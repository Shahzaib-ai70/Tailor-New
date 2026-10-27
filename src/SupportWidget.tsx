import { useEffect, useRef, useState } from 'react'
import { MessageCircle, Send, X } from 'lucide-react'
import type { SupportConversation, SupportMessage } from './types'
import { customerChatSupabase, supabase } from './lib/supabase'
import { readApiResponse } from './lib/api-response'
import {
  readLocalWhatsAppNumber,
  subscribeToLocalAdminData,
} from './lib/admin-store'
import './SupportWidget.css'

type LocalSupportResponse = {
  conversation?: SupportConversation
  messages?: SupportMessage[]
  error?: string
}

export default function SupportWidget() {
  const localMode = !supabase
  const [open, setOpen] = useState(false)
  const [conversation, setConversation] = useState<SupportConversation | null>(null)
  const [messages, setMessages] = useState<SupportMessage[]>([])
  const [whatsAppNumber, setWhatsAppNumber] = useState(() => localMode ? readLocalWhatsAppNumber() : '')
  const [customerName, setCustomerName] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const messageListRef = useRef<HTMLDivElement>(null)
  const customerNameRef = useRef('')

  useEffect(() => {
    customerNameRef.current = customerName
  }, [customerName])

  useEffect(() => {
    if (localMode) {
      const unsubscribe = subscribeToLocalAdminData(() => {
        try {
          setWhatsAppNumber(readLocalWhatsAppNumber())
        } catch (syncError) {
          setError(syncError instanceof Error ? syncError.message : 'Could not refresh support messages.')
        }
      })
      return unsubscribe
    }

    const client = customerChatSupabase
    if (!client) return
    const settingsChannel = client.channel('mian-whatsapp-setting')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'business_settings', filter: 'key=eq.whatsapp_number' }, (payload) => {
        const record = payload.new as { value?: string }
        if (record.value !== undefined) setWhatsAppNumber(record.value)
      })
      .subscribe()
    void client.from('business_settings').select('value').eq('key', 'whatsapp_number').maybeSingle()
      .then(({ data, error: settingsError }) => {
        if (settingsError) setError(settingsError.message)
        else setWhatsAppNumber(data?.value ?? '')
      })
    return () => { void client.removeChannel(settingsChannel) }
  }, [localMode])

  useEffect(() => {
    if (!open) return
    let active = true
    let messageChannel: ReturnType<NonNullable<typeof supabase>['channel']> | undefined
    let pollInterval: number | undefined
    const client = customerChatSupabase

    async function initializeChat() {
      setLoading(true)
      setError('')
      try {
        if (localMode) {
          async function refreshSupportChat() {
            const response = await fetch('/api/support')
            const result = await readApiResponse<LocalSupportResponse>(response)
            if (!response.ok) throw new Error(result.error ?? 'Could not connect to customer care.')
            if (!result.conversation) throw new Error('The support service did not return a conversation.')
            if (active) {
              setConversation(result.conversation)
              setMessages(result.messages ?? [])
              if (result.conversation.customer_name !== 'Store visitor') {
                setCustomerName((previous) => previous || result.conversation!.customer_name)
              }
            }
          }
          await refreshSupportChat()
          if (active) {
            pollInterval = window.setInterval(() => {
              void refreshSupportChat().catch((refreshError: unknown) => {
                if (active) setError(refreshError instanceof Error ? refreshError.message : 'Could not refresh support messages.')
              })
            }, 5000)
          }
          return
        }

        if (!client) return
        let { data: { session }, error: sessionError } = await client.auth.getSession()
        if (sessionError) throw sessionError
        if (!session) {
          const { data, error: signInError } = await client.auth.signInAnonymously()
          if (signInError) throw new Error(`Live chat needs Supabase anonymous sign-in enabled: ${signInError.message}`)
          session = data.session
        }
        if (!session) throw new Error('Could not create a secure support session. Please use WhatsApp instead.')

        const { data: existing, error: findError } = await client.from('support_conversations')
          .select('*')
          .eq('customer_id', session.user.id)
          .eq('status', 'open')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (findError) throw findError
        let current = existing as SupportConversation | null
        if (!current) {
          const { data: created, error: createError } = await client.from('support_conversations')
            .insert({ customer_id: session.user.id, customer_name: customerNameRef.current.trim() || 'Store visitor' })
            .select('*')
            .single()
          if (createError) throw createError
          current = created as SupportConversation
        } else if (customerNameRef.current.trim() && current.customer_name === 'Store visitor') {
          const { data: updated, error: updateError } = await client.from('support_conversations')
            .update({ customer_name: customerNameRef.current.trim() })
            .eq('id', current.id)
            .select('*')
            .single()
          if (updateError) throw updateError
          current = updated as SupportConversation
        }
        const { data: existingMessages, error: messageError } = await client.from('support_messages')
          .select('*').eq('conversation_id', current.id).order('created_at')
        if (messageError) throw messageError
        if (!active) return
        setConversation(current)
        setMessages(existingMessages as SupportMessage[])
        messageChannel = client.channel(`support-${current.id}`)
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'support_messages', filter: `conversation_id=eq.${current.id}` }, (payload) => {
            const added = payload.new as SupportMessage
            setMessages((previous) => previous.some((item) => item.id === added.id) ? previous : [...previous, added])
          })
          .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'support_conversations', filter: `id=eq.${current.id}` }, (payload) => {
            setConversation(payload.new as SupportConversation)
          })
          .subscribe((status) => {
            if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setError('Live chat disconnected. Reopen this chat or contact us on WhatsApp.')
          })
      } catch (chatError) {
        if (active) setError(chatError instanceof Error ? chatError.message : 'Could not connect to customer service.')
      } finally {
        if (active) setLoading(false)
      }
    }

    void initializeChat()
    return () => {
      active = false
      if (pollInterval !== undefined) window.clearInterval(pollInterval)
      if (messageChannel && client) void client.removeChannel(messageChannel)
    }
  }, [open, localMode])

  useEffect(() => {
    if (messageListRef.current) messageListRef.current.scrollTop = messageListRef.current.scrollHeight
  }, [messages, open])

  async function sendMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!conversation || conversation.status !== 'open' || !message.trim()) return
    const body = message.trim()
    setSending(true)
    setError('')
    try {
      if (localMode) {
        const response = await fetch('/api/support/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body }),
        })
        const result = await readApiResponse<{ message?: SupportMessage; error?: string }>(response)
        if (!response.ok) throw new Error(result.error ?? 'Could not send your message.')
        if (!result.message) throw new Error('The support service did not confirm your message.')
        setMessages((previous) => previous.some((item) => item.id === result.message!.id) ? previous : [...previous, result.message!])
        setMessage('')
        return
      }
      if (!customerChatSupabase) return
      const { data: { user }, error: userError } = await customerChatSupabase.auth.getUser()
      if (userError) throw userError
      if (!user) throw new Error('Your support session expired. Please reopen the chat.')
      const { data: sent, error: sendError } = await customerChatSupabase.from('support_messages')
        .insert({ conversation_id: conversation.id, sender_id: user.id, sender_role: 'customer', body })
        .select('*')
        .single()
      if (sendError) throw sendError
      setMessages((previous) => previous.some((item) => item.id === sent.id) ? previous : [...previous, sent as SupportMessage])
      setMessage('')
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : 'Could not send your message.')
    } finally {
      setSending(false)
    }
  }

  async function saveCustomerName() {
    const name = customerName.trim()
    if (!conversation || !name || name === conversation.customer_name) return
    try {
      if (localMode) {
        const response = await fetch('/api/support/name', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name }),
        })
        const result = await readApiResponse<{ conversation?: SupportConversation; error?: string }>(response)
        if (!response.ok) throw new Error(result.error ?? 'Could not update your name.')
        if (result.conversation) setConversation(result.conversation)
        return
      }
      if (!customerChatSupabase) return
      const { data, error: updateError } = await customerChatSupabase.from('support_conversations')
        .update({ customer_name: name })
        .eq('id', conversation.id)
        .select('*')
        .single()
      if (updateError) throw updateError
      setConversation(data as SupportConversation)
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Could not update your name.')
    }
  }

  const cleanNumber = whatsAppNumber.replace(/\D/g, '')
  const whatsAppHref = cleanNumber ? `https://wa.me/${cleanNumber}?text=${encodeURIComponent('Hello, I would like help with Mian Tailor And Design.')}` : ''

  return (
    <div className="support-widget">
      {open && <section className="support-panel" aria-label="Customer service chat">
        <header className="support-header">
          <span className="support-avatar"><MessageCircle size={19} /></span>
          <div><strong>Customer care</strong><span><i />{localMode ? 'Secure chat · private to your account' : 'Live team chat'}</span></div>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close customer service chat"><X size={19} /></button>
        </header>
        <label className="support-name-label">Your name <input value={customerName} onChange={(event) => setCustomerName(event.target.value)} onBlur={() => void saveCustomerName()} placeholder="How should we address you?" maxLength={80} /></label>
        <div className="support-messages" ref={messageListRef} aria-live="polite">
          <div className="support-welcome">Welcome! Tell us how we can help with your order, fit, or design.</div>
          {messages.map((item) => <div className={`support-message ${item.sender_role}`} key={item.id}><p>{item.body}</p><time>{new Date(item.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</time></div>)}
          {loading && <p className="support-state">Connecting to customer care…</p>}
          {error && <p className="support-error" role="alert">{error}</p>}
        </div>
        {whatsAppHref && <a className="support-whatsapp-link" href={whatsAppHref} target="_blank" rel="noreferrer">Continue on WhatsApp</a>}
        {!whatsAppHref && <p className="support-whatsapp-note">WhatsApp support number will appear here once configured.</p>}
        <form className="support-compose" onSubmit={sendMessage}>
          <input value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Write your message…" maxLength={2000} aria-label="Your message" />
          <button type="submit" disabled={sending || loading || !conversation || conversation.status !== 'open' || !message.trim()} aria-label="Send message"><Send size={17} /></button>
        </form>
      </section>}
      <button className="support-launcher" type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-label={open ? 'Close customer service' : 'Chat with customer service'}>
        {open ? <X size={20} /> : <MessageCircle size={20} />}<span>{open ? 'Close' : 'Need help?'}</span>
      </button>
    </div>
  )
}
