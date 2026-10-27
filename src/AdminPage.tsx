import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import type { FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { ArrowLeft, Check, Headset, LogOut, Package, Plus, RefreshCw, Scissors, Settings, ShoppingBag, Users, X } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import type { CustomerProfile, FittingRequest, Product, SupportConversation, SupportMessage } from './types'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import { getLocalAdminSnapshot, readLocalConversations, readLocalMessages, readLocalProducts, readLocalRequests, readLocalWhatsAppNumber, subscribeToLocalAdminData, writeLocalConversations, writeLocalMessages, writeLocalProducts, writeLocalRequests, writeLocalWhatsAppNumber } from './lib/admin-store'
import './Admin.css'

type AdminSection = 'overview' | 'products' | 'customers' | 'fittings' | 'support' | 'settings'
type LocalAdminUser = { email: string }
type AccountDirectoryCustomer = { id: number; fullName: string; email: string; createdAt: string }
type AccountDirectoryResponse = { customers?: AccountDirectoryCustomer[]; error?: string }
type AdminSessionResponse = { user?: LocalAdminUser | null; error?: string }
type ProductDraft = {
  id: string
  name: string
  detail: string
  price: string
  category: string
  image: string
  fabric: string
  stitching: string
  tag: string
  colorwaysText: string
  active: boolean
}

const emptyDraft: ProductDraft = {
  id: '',
  name: '',
  detail: '',
  price: '',
  category: '',
  image: '',
  fabric: '',
  stitching: '',
  tag: '',
  colorwaysText: 'Charcoal: #4c4b49\nIvory: #e9e1d2\nIndigo: #3b506f\nDeep Plum: #704254\nBlack: #252321',
  active: true,
}

const money = new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR', maximumFractionDigits: 0 })
function formatAdminDateTime(value: string) {
  const [date, time] = value.split('T')
  return time ? `${date} ${time.slice(0, 5)}` : date
}

function formatAdminDate(value: string) {
  return value.split(/[T ]/)[0]
}

function currentTimestamp() {
  return new Date().toISOString()
}
const sections: { id: AdminSection; label: string; icon: typeof Package }[] = [
  { id: 'overview', label: 'Overview', icon: ShoppingBag },
  { id: 'products', label: 'Products', icon: Package },
  { id: 'customers', label: 'Customers', icon: Users },
  { id: 'fittings', label: 'Fitting requests', icon: Scissors },
  { id: 'support', label: 'Live support', icon: Headset },
  { id: 'settings', label: 'Settings', icon: Settings },
]

function draftFromProduct(product: Product): ProductDraft {
  return {
    id: product.id,
    name: product.name,
    detail: product.detail,
    price: String(product.price),
    category: product.category,
    image: product.image,
    fabric: product.fabric,
    stitching: product.stitching,
    tag: product.tag ?? '',
    colorwaysText: product.colorways.map((colorway) => `${colorway.name}: ${colorway.hex}`).join('\n'),
    active: product.active !== false,
  }
}

export default function AdminPage({ starterProducts }: { starterProducts: Product[] }) {
  const localMode = !isSupabaseConfigured || !supabase
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedSection = searchParams.get('section')
  const initialSection: AdminSection = sections.some((item) => item.id === requestedSection) ? requestedSection as AdminSection : 'overview'
  const localSnapshot = useSyncExternalStore(
    subscribeToLocalAdminData,
    () => getLocalAdminSnapshot(starterProducts),
    () => getLocalAdminSnapshot(starterProducts),
  )
  const [session, setSession] = useState<Session | null>(null)
  const [localAdminUser, setLocalAdminUser] = useState<LocalAdminUser | null>(null)
  const [authReady, setAuthReady] = useState(!localMode)
  const [section, setSection] = useState<AdminSection>(initialSection)
  const [storedProducts, setProducts] = useState<Product[]>(() => localMode ? localSnapshot.products : [])
  const [storedRequests, setRequests] = useState<FittingRequest[]>(() => localMode ? localSnapshot.requests : [])
  const [storedConversations, setConversations] = useState<SupportConversation[]>(() => localMode ? localSnapshot.conversations : [])
  const [storedSupportMessages, setSupportMessages] = useState<SupportMessage[]>(() => localMode ? localSnapshot.messages : [])
  const [customerProfiles, setCustomerProfiles] = useState<CustomerProfile[]>([])
  const [customerLoadError, setCustomerLoadError] = useState('')
  const [selectedConversationId, setSelectedConversationId] = useState(() => searchParams.get('conversation') ?? '')
  const [reply, setReply] = useState('')
  const [storedWhatsAppNumber, setWhatsAppNumber] = useState(() => localMode ? localSnapshot.whatsappNumber : '')
  const [whatsAppDraft, setWhatsAppDraft] = useState<string | null>(null)
  const [loading, setLoading] = useState(!localMode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [draft, setDraft] = useState<ProductDraft>(emptyDraft)
  const [editing, setEditing] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const products = localMode ? localSnapshot.products : storedProducts
  const requests = localMode ? localSnapshot.requests : storedRequests
  const conversations = localMode ? localSnapshot.conversations : storedConversations
  const supportMessages = localMode ? localSnapshot.messages : storedSupportMessages
  const whatsAppNumber = whatsAppDraft ?? (localMode ? localSnapshot.whatsappNumber : storedWhatsAppNumber)

  function navigateSection(nextSection: AdminSection) {
    setSection(nextSection)
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set('section', nextSection)
    if (nextSection !== 'support') nextParams.delete('conversation')
    setSearchParams(nextParams, { replace: true })
  }

  function selectConversation(conversationId: string) {
    setSelectedConversationId(conversationId)
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set('section', 'support')
    nextParams.set('conversation', conversationId)
    setSearchParams(nextParams, { replace: true })
  }

  function handleRealtimeStatus(status: string) {
    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
      setError('Live updates disconnected. Use refresh to retry or check Supabase Realtime settings.')
    }
  }

  const refreshData = useCallback(async (options: { silent?: boolean } = {}) => {
    if (!options.silent) {
      setLoading(true)
      setError('')
    }
    try {
      if (localMode) {
        setProducts(readLocalProducts(starterProducts))
        setRequests(readLocalRequests())
        setConversations(readLocalConversations())
        setSupportMessages(readLocalMessages())
        setWhatsAppNumber(readLocalWhatsAppNumber())
        try {
          const response = await fetch('/api/admin/customers')
          const result = await response.json() as AccountDirectoryResponse
          if (!response.ok) throw new Error(result.error ?? 'Could not load customer accounts.')
          setCustomerProfiles((result.customers ?? []).map((customer) => ({
            id: `account-${customer.id}`,
            email: customer.email,
            full_name: customer.fullName,
            created_at: customer.createdAt,
          })))
          setCustomerLoadError('')
        } catch (directoryError) {
          setCustomerLoadError(directoryError instanceof Error ? directoryError.message : 'Could not load customer accounts.')
        }
        return
      }
      if (!supabase) return
      const [productResult, requestResult, conversationResult, messageResult, settingsResult, customerResult] = await Promise.all([
        supabase.from('products').select('*').order('name'),
        supabase.from('fitting_requests').select('*').order('created_at', { ascending: false }),
        supabase.from('support_conversations').select('*').order('updated_at', { ascending: false }),
        supabase.from('support_messages').select('*').order('created_at'),
        supabase.from('business_settings').select('value').eq('key', 'whatsapp_number').maybeSingle(),
        supabase.from('customer_profiles').select('id,email,full_name,created_at').order('created_at', { ascending: false }),
      ])
      let directoryError = ''
      let directoryCustomers: AccountDirectoryCustomer[] = []
      try {
        const directoryResponse = await fetch('/api/admin/customers', {
          headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
        })
        const directoryResult = await directoryResponse.json() as AccountDirectoryResponse
        if (!directoryResponse.ok) {
          directoryError = directoryResult.error ?? 'Could not load website registrations.'
        } else {
          directoryCustomers = directoryResult.customers ?? []
        }
      } catch (directoryLoadError) {
        directoryError = directoryLoadError instanceof Error ? directoryLoadError.message : 'Could not load website registrations.'
      }
      const customerDirectory = new Map<string, CustomerProfile>()
      for (const profile of customerResult.data ?? []) {
        customerDirectory.set(profile.email.toLowerCase(), profile as CustomerProfile)
      }
      for (const customer of directoryCustomers) {
        customerDirectory.set(customer.email.toLowerCase(), {
          id: `account-${customer.id}`,
          email: customer.email,
          full_name: customer.fullName,
          created_at: customer.createdAt,
        })
      }
      setCustomerProfiles([...customerDirectory.values()].sort((a, b) => b.created_at.localeCompare(a.created_at)))
      setCustomerLoadError([customerResult.error?.message, directoryError].filter(Boolean).join(' · '))
      const loadError = productResult.error ?? requestResult.error ?? conversationResult.error ?? messageResult.error ?? settingsResult.error
      if (loadError) {
        setError(loadError.message)
      } else {
        setProducts(productResult.data ?? [])
        setRequests(requestResult.data ?? [])
        setConversations((conversationResult.data ?? []) as SupportConversation[])
        setSupportMessages((messageResult.data ?? []) as SupportMessage[])
        setWhatsAppNumber(settingsResult.data?.value ?? '')
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load admin data.')
    } finally {
      setLoading(false)
    }
  }, [localMode, session, starterProducts])

  useEffect(() => {
    if (!localMode) return
    let mounted = true
    void fetch('/api/admin/session').then(async (response) => {
      const result = await response.json() as AdminSessionResponse
      if (!response.ok) throw new Error(result.error ?? 'Could not check manager session.')
      if (mounted) setLocalAdminUser(result.user ?? null)
    }).catch((sessionError: unknown) => {
      if (mounted) setError(sessionError instanceof Error ? sessionError.message : 'Could not check manager session.')
    }).finally(() => {
      if (mounted) setAuthReady(true)
    })
    return () => { mounted = false }
  }, [localMode])

  useEffect(() => {
    if (!supabase) return
    let mounted = true
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setAuthReady(true)
    })

    void supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!mounted) return
      if (sessionError) setError(sessionError.message)
      setSession(data.session)
      setAuthReady(true)
    }).catch((authError: Error) => {
      if (!mounted) return
      setError(authError.message)
      setAuthReady(true)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (localMode) {
      if (localAdminUser) void Promise.resolve().then(() => refreshData({ silent: true }))
      return
    }
    if (!supabase || session?.user.app_metadata.role !== 'admin') return
    void Promise.resolve().then(() => refreshData({ silent: true }))
  }, [localAdminUser, localMode, refreshData, session])

  useEffect(() => {
    if (section !== 'customers' || (localMode ? !localAdminUser : session?.user.app_metadata.role !== 'admin')) return
    const interval = window.setInterval(() => { void refreshData({ silent: true }) }, 30_000)
    return () => window.clearInterval(interval)
  }, [localAdminUser, localMode, refreshData, section, session])

  useEffect(() => {
    if (localMode || !supabase || session?.user.app_metadata.role !== 'admin') return
    const client = supabase
    const channel = client.channel('mian-admin-live-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => { void refreshData({ silent: true }) })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fitting_requests' }, () => { void refreshData({ silent: true }) })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'support_conversations' }, () => { void refreshData({ silent: true }) })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'support_messages' }, () => { void refreshData({ silent: true }) })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'business_settings' }, () => { void refreshData({ silent: true }) })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customer_profiles' }, () => { void refreshData({ silent: true }) })
      .subscribe(handleRealtimeStatus)
    return () => { void client.removeChannel(channel) }
  }, [localMode, refreshData, session])

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setSaving(true)
    setLoading(true)
    try {
      if (localMode) {
        const response = await fetch('/api/admin/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        })
        const result = await response.json() as AdminSessionResponse
        if (!response.ok) throw new Error(result.error ?? 'Could not sign in.')
        setLocalAdminUser(result.user ?? null)
        return
      }
      if (!supabase) throw new Error('Admin authentication is unavailable.')
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
      if (signInError) throw signInError
    } catch (signInError) {
      setError(signInError instanceof Error ? signInError.message : 'Could not sign in.')
      setLoading(false)
    } finally {
      setPassword('')
      setSaving(false)
    }
  }

  async function signOut() {
    try {
      if (localMode) {
        const response = await fetch('/api/admin/logout', { method: 'POST' })
        const result = await response.json() as AdminSessionResponse
        if (!response.ok) throw new Error(result.error ?? 'Could not sign out.')
        setLocalAdminUser(null)
        setCustomerProfiles([])
        return
      }
      if (!supabase) throw new Error('Admin authentication is unavailable.')
      const { error: signOutError } = await supabase.auth.signOut()
      if (signOutError) setError(signOutError.message)
    } catch (signOutError) {
      setError(signOutError instanceof Error ? signOutError.message : 'Could not sign out.')
    }
  }

  function startNewProduct() {
    setDraft(emptyDraft)
    setEditing(false)
    setEditorOpen(true)
    setError('')
    setNotice('')
  }

  function startEditProduct(product: Product) {
    setDraft(draftFromProduct(product))
    setEditing(true)
    setEditorOpen(true)
    setError('')
    setNotice('')
  }

  async function saveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setNotice('')

    const colorways = draft.colorwaysText.split('\n').filter((line) => line.trim()).map((line) => {
      const [name, hex] = line.split(':').map((part) => part.trim())
      return { name, hex }
    })
    if (colorways.some((colorway) => !colorway.name || !/^#[\da-f]{6}$/i.test(colorway.hex))) {
      setError('Enter each color on its own line as Name: #RRGGBB.')
      return
    }
    if (!Number.isFinite(Number(draft.price)) || Number(draft.price) < 0) {
      setError('Enter a valid price of zero or more.')
      return
    }
    try {
      const imageUrl = new URL(draft.image)
      if (imageUrl.protocol !== 'https:' && imageUrl.protocol !== 'http:') throw new Error()
    } catch {
      setError('Enter a valid http or https image URL.')
      return
    }

    setSaving(true)
    try {
      const product: Product = {
        id: draft.id.trim(),
        name: draft.name.trim(),
        detail: draft.detail.trim(),
        price: Number(draft.price),
        category: draft.category.trim(),
        image: draft.image.trim(),
        fabric: draft.fabric.trim(),
        stitching: draft.stitching.trim(),
        colorways,
        tag: draft.tag.trim() || undefined,
        active: draft.active,
      }
      if (localMode) {
        const nextProducts = [...products.filter((item) => item.id !== product.id), product].sort((a, b) => a.name.localeCompare(b.name))
        writeLocalProducts(nextProducts)
        setProducts(nextProducts)
      } else {
        if (!supabase) return
        const { error: saveError } = await supabase.from('products').upsert({ ...product, updated_at: new Date().toISOString() })
        if (saveError) {
          setError(saveError.message)
          return
        }
      }
      setNotice(editing ? 'Product updated.' : 'Product created.')
      setDraft(emptyDraft)
      setEditorOpen(false)
      await refreshData()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save this product.')
    } finally {
      setSaving(false)
    }
  }

  async function toggleProduct(product: Product) {
    setError('')
    try {
      if (localMode) {
        const nextProducts = products.map((item) => item.id === product.id ? { ...item, active: item.active === false } : item)
        writeLocalProducts(nextProducts)
        setProducts(nextProducts)
      } else {
        if (!supabase) return
        const { error: updateError } = await supabase.from('products').update({
          active: product.active === false,
          updated_at: new Date().toISOString(),
        }).eq('id', product.id)
        if (updateError) {
          setError(updateError.message)
          return
        }
        await refreshData()
      }
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Could not update this product.')
    }
  }

  async function updateRequestStatus(requestId: string, status: FittingRequest['status']) {
    setError('')
    try {
      if (localMode) {
        const nextRequests = requests.map((request) => request.id === requestId ? { ...request, status } : request)
        writeLocalRequests(nextRequests)
        setRequests(nextRequests)
      } else {
        if (!supabase) return
        const { error: updateError } = await supabase.from('fitting_requests').update({ status }).eq('id', requestId)
        if (updateError) {
          setError(updateError.message)
          return
        }
        await refreshData()
      }
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Could not update this fitting request.')
    }
  }

  async function publishStarterCatalog() {
    setError('')
    setSaving(true)
    try {
      if (localMode) {
        writeLocalProducts(starterProducts)
        setProducts(starterProducts)
        setNotice(`${starterProducts.length} starter designs loaded into this browser.`)
        return
      }
      if (!supabase) return
      const { error: seedError } = await supabase.from('products').insert(starterProducts.map((product) => ({
        ...product,
        active: true,
      })))
      if (seedError) {
        setError(seedError.message)
        return
      }
      setNotice(`${starterProducts.length} starter designs published.`)
      await refreshData()
    } catch (seedError) {
      setError(seedError instanceof Error ? seedError.message : 'Could not publish starter designs.')
    } finally {
      setSaving(false)
    }
  }

  async function sendSupportReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const activeConversation = selectedConversation
    if (!activeConversation || !reply.trim()) return
    setSaving(true)
    setError('')
    try {
      const body = reply.trim()
      if (localMode) {
        const nextMessage: SupportMessage = {
          id: crypto.randomUUID(),
          conversation_id: activeConversation.id,
          sender_id: 'admin',
          sender_role: 'admin',
          body,
          created_at: currentTimestamp(),
        }
        const nextConversations = conversations.map((item) => item.id === activeConversation.id ? { ...item, updated_at: nextMessage.created_at } : item)
        writeLocalConversations(nextConversations)
        writeLocalMessages([...supportMessages, nextMessage])
        setConversations(nextConversations)
        setSupportMessages((current) => [...current, nextMessage])
      } else {
        if (!supabase) return
        const { data: { user }, error: userError } = await supabase.auth.getUser()
        if (userError) throw userError
        if (!user) throw new Error('Admin session expired. Sign in again to reply.')
        const { error: messageError } = await supabase.from('support_messages').insert({
          conversation_id: activeConversation.id,
          sender_id: user.id,
          sender_role: 'admin',
          body,
        })
        if (messageError) throw messageError
        const { error: conversationError } = await supabase.from('support_conversations')
          .update({ updated_at: currentTimestamp() }).eq('id', activeConversation.id)
        if (conversationError) throw conversationError
        await refreshData()
      }
      setReply('')
    } catch (replyError) {
      setError(replyError instanceof Error ? replyError.message : 'Could not send your reply.')
    } finally {
      setSaving(false)
    }
  }

  async function updateConversationStatus(conversation: SupportConversation) {
    const status: SupportConversation['status'] = conversation.status === 'open' ? 'closed' : 'open'
    setError('')
    try {
      if (localMode) {
        const next = conversations.map((item) => item.id === conversation.id ? { ...item, status, updated_at: new Date().toISOString() } : item)
        writeLocalConversations(next)
        setConversations(next)
      } else {
        if (!supabase) return
        const { error: updateError } = await supabase.from('support_conversations').update({ status, updated_at: new Date().toISOString() }).eq('id', conversation.id)
        if (updateError) throw updateError
        await refreshData()
      }
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Could not update this chat.')
    }
  }

  async function saveWhatsAppSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const number = whatsAppNumber.replace(/\D/g, '')
    if (number && (number.length < 8 || number.length > 15)) {
      setError('Enter a WhatsApp number with its country code, using 8 to 15 digits.')
      return
    }
    setSaving(true)
    setError('')
    setNotice('')
    try {
      if (localMode) {
        writeLocalWhatsAppNumber(number)
      } else {
        if (!supabase) return
        const { error: saveError } = await supabase.from('business_settings').upsert({
          key: 'whatsapp_number',
          value: number,
          updated_at: new Date().toISOString(),
        })
        if (saveError) throw saveError
      }
      setWhatsAppNumber(number)
      setWhatsAppDraft(null)
      setNotice('Customer service settings saved.')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save customer service settings.')
    } finally {
      setSaving(false)
    }
  }

  const selectedConversation = conversations.find((item) => item.id === selectedConversationId)
    ?? conversations.find((item) => item.status === 'open')
  const selectedMessages = selectedConversation
    ? supportMessages.filter((item) => item.conversation_id === selectedConversation.id)
    : []

  if (!authReady) {
    return <div className="admin-loading">Checking manager session…</div>
  }

  if ((localMode && !localAdminUser) || (!localMode && !session)) {
    return (
      <div className="admin-gate">
        <form className="admin-login-card" onSubmit={signIn}>
          <span className="admin-brand-mark">M</span>
          <p className="admin-kicker">Mian Tailor And Design</p>
          <h1>Welcome back.</h1>
          <p>Sign in with your manager account to view customer registrations.</p>
          <label>Email address<input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
          <label>Password<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
          {error && <p className="admin-alert" role="alert">{error}</p>}
          <button className="admin-primary-button" type="submit" disabled={saving}>{saving ? 'Signing in…' : 'Sign in'}</button>
          <Link className="admin-back-link" to="/"><ArrowLeft size={15} /> Back to storefront</Link>
        </form>
      </div>
    )
  }

  if (!localMode && session && session.user.app_metadata.role !== 'admin') {
    return (
      <div className="admin-gate">
        <div className="admin-gate-card">
          <span className="admin-brand-mark">M</span>
          <p className="admin-kicker">Mian Tailor And Design</p>
          <h1>Admin access required</h1>
          <p>This account is signed in but does not have the admin role.</p>
          {error && <p className="admin-alert" role="alert">{error}</p>}
          <button className="admin-secondary-button" type="button" onClick={signOut}><LogOut size={15} /> Sign out</button>
          <Link className="admin-back-link" to="/"><ArrowLeft size={15} /> Back to storefront</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <Link className="admin-sidebar-brand" to="/"><span className="admin-brand-mark">M</span><span>MIAN <small>TAILOR AND DESIGN</small></span></Link>
        <p className="admin-sidebar-label">Workspace</p>
        <nav aria-label="Admin sections">
          {sections.map(({ id, label, icon: Icon }) => <button className={section === id ? 'admin-nav-item active' : 'admin-nav-item'} key={id} type="button" onClick={() => { navigateSection(id); setNotice('') }}><Icon size={17} />{label}{id === 'fittings' && requests.some((request) => request.status === 'new') && <span className="admin-nav-count">{requests.filter((request) => request.status === 'new').length}</span>}{id === 'support' && conversations.some((conversation) => conversation.status === 'open') && <span className="admin-nav-count">{conversations.filter((conversation) => conversation.status === 'open').length}</span>}</button>)}
        </nav>
        <Link className="admin-back-link" to="/"><ArrowLeft size={15} /> View storefront</Link>
        {(session || localAdminUser) && <button className="admin-signout" type="button" onClick={() => void signOut()}><LogOut size={16} /> Sign out</button>}
      </aside>

      <main className="admin-main">
        <header className="admin-topbar">
          <div><p className="admin-kicker">Mian Tailor And Design / Admin</p><h1>{sections.find((item) => item.id === section)?.label}</h1></div>
          <div className="admin-topbar-actions"><span className={localMode ? 'admin-sync-state local' : 'admin-sync-state'}><i />{localMode ? 'SQL customer directory · local catalog' : 'Supabase live sync'}</span>{(session?.user.email || localAdminUser?.email) && <span className="admin-user-email">{session?.user.email || localAdminUser?.email}</span>}<button className="admin-icon-button" type="button" onClick={() => void refreshData()} aria-label="Refresh data" disabled={loading}><RefreshCw size={16} /></button></div>
        </header>
        {error && <p className="admin-alert admin-page-alert" role="alert">{error}</p>}
        {notice && <p className="admin-notice" role="status"><Check size={16} />{notice}<button type="button" onClick={() => setNotice('')} aria-label="Dismiss message"><X size={14} /></button></p>}
        {loading && <p className="admin-loading-inline">Updating records…</p>}

        {section === 'overview' && (
          <section className="admin-content">
            <div className="admin-welcome"><div><p className="admin-kicker">Your atelier at a glance</p><h2>Good day.</h2><p>Manage your stitched collection and keep fitting requests moving.</p></div><Scissors size={38} strokeWidth={1.2} /></div>
            <div className="admin-stat-grid">
              <article><span className="admin-stat-icon"><Package size={18} /></span><p>Products</p><strong>{products.length}</strong><small>{products.filter((product) => product.active !== false).length} active in storefront</small></article>
              <article><span className="admin-stat-icon"><Scissors size={18} /></span><p>Fitting requests</p><strong>{requests.length}</strong><small>{requests.filter((request) => request.status === 'new').length} new to review</small></article>
              <article><span className="admin-stat-icon"><Users size={18} /></span><p>Customers</p><strong>{customerProfiles.length}</strong><small>Registered customer accounts</small></article>
              <article><span className="admin-stat-icon"><Headset size={18} /></span><p>Live support</p><strong>{conversations.filter((item) => item.status === 'open').length}</strong><small>{supportMessages.length} messages across all chats</small></article>
              <article><span className="admin-stat-icon"><ShoppingBag size={18} /></span><p>Collection value</p><strong>{money.format(products.filter((product) => product.active !== false).reduce((total, product) => total + product.price, 0))}</strong><small>Combined price of active designs</small></article>
            </div>
            {products.length === 0 && <div className="admin-empty-catalog"><div><h2>Start with the 50-design collection</h2><p>Load the storefront's starter designs {localMode ? 'into this browser' : 'into Supabase'} so you can edit them here.</p></div><button className="admin-primary-button" type="button" onClick={() => void publishStarterCatalog()} disabled={saving}>{saving ? 'Loading…' : `Load ${starterProducts.length} designs`}</button></div>}
            <div className="admin-panel">
              <div className="admin-panel-heading"><div><p className="admin-kicker">Latest activity</p><h2>Recent fitting requests</h2></div><button className="admin-text-button" type="button" onClick={() => navigateSection('fittings')}>View all <ArrowLeft size={14} /></button></div>
              {requests.length === 0 ? <p className="admin-empty">New fitting requests will appear here.</p> : <div className="admin-request-list">{requests.slice(0, 5).map((request) => <article key={request.id}><div><strong>{request.name}</strong><span>{request.occasion} · {formatAdminDate(request.created_at)}</span></div><span className={`admin-status ${request.status}`}>{request.status}</span></article>)}</div>}
            </div>
          </section>
        )}

        {section === 'products' && (
          <section className="admin-content">
            {products.length === 0 && <div className="admin-empty-catalog"><div><h2>Your product list is empty</h2><p>Load the 50 starter designs or add a product manually.</p></div><button className="admin-primary-button" type="button" onClick={() => void publishStarterCatalog()} disabled={saving}>{saving ? 'Loading…' : 'Load starter collection'}</button></div>}
            <div className="admin-panel">
              <div className="admin-panel-heading"><div><p className="admin-kicker">Catalog</p><h2>{products.length} products</h2></div><button className="admin-primary-button admin-add-button" type="button" onClick={startNewProduct}><Plus size={16} /> Add product</button></div>
              <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Product</th><th>Category</th><th>Price</th><th>Visibility</th><th>Actions</th></tr></thead><tbody>{products.map((product) => <tr key={product.id}><td><div className="admin-product-cell"><img src={product.image} alt="" /><span><strong>{product.name}</strong><small>{product.id}</small></span></div></td><td>{product.category}</td><td>{money.format(product.price)}</td><td><span className={product.active === false ? 'admin-status inactive' : 'admin-status active'}>{product.active === false ? 'Hidden' : 'Active'}</span></td><td><div className="admin-row-actions"><button className="admin-small-button" type="button" onClick={() => startEditProduct(product)}>Edit</button><button className="admin-small-button" type="button" onClick={() => void toggleProduct(product)}>{product.active === false ? 'Publish' : 'Hide'}</button></div></td></tr>)}</tbody></table></div>
            </div>
            {editorOpen && <form className="admin-panel admin-product-form" onSubmit={saveProduct}><div className="admin-panel-heading"><div><p className="admin-kicker">{editing ? 'Edit listing' : 'New listing'}</p><h2>{editing ? draft.name : 'Product details'}</h2></div><button className="admin-icon-button" type="button" onClick={() => { setDraft(emptyDraft); setEditing(false); setEditorOpen(false) }} aria-label="Close editor"><X size={17} /></button></div><div className="admin-form-grid">
              <label>Product ID<input required pattern="[a-z0-9-]+" value={draft.id} readOnly={editing} onChange={(event) => setDraft({ ...draft, id: event.target.value })} placeholder="e.g. mehran-straight-cut" /></label>
              <label>Name<input required value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
              <label>Category<input required value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })} placeholder="Daily Wear" /></label>
              <label>Price (PKR)<input required type="number" min="0" step="1" value={draft.price} onChange={(event) => setDraft({ ...draft, price: event.target.value })} /></label>
              <label className="admin-field-full">Short detail<input required value={draft.detail} onChange={(event) => setDraft({ ...draft, detail: event.target.value })} /></label>
              <label className="admin-field-full">Image URL<input required type="url" value={draft.image} onChange={(event) => setDraft({ ...draft, image: event.target.value })} /></label>
              <label>Fabric<input required value={draft.fabric} onChange={(event) => setDraft({ ...draft, fabric: event.target.value })} /></label>
              <label>Tag <span className="admin-optional">(optional)</span><input value={draft.tag} onChange={(event) => setDraft({ ...draft, tag: event.target.value })} /></label>
              <label className="admin-field-full">Stitching details<input required value={draft.stitching} onChange={(event) => setDraft({ ...draft, stitching: event.target.value })} /></label>
              <label className="admin-field-full">Colorways <span className="admin-optional">(one Name: #RRGGBB per line)</span><textarea required rows={5} value={draft.colorwaysText} onChange={(event) => setDraft({ ...draft, colorwaysText: event.target.value })} /></label>
              <label className="admin-checkbox"><input type="checkbox" checked={draft.active} onChange={(event) => setDraft({ ...draft, active: event.target.checked })} /> Visible in storefront</label>
            </div><div className="admin-form-actions"><button className="admin-secondary-button" type="button" onClick={() => { setDraft(emptyDraft); setEditing(false); setEditorOpen(false) }}>Cancel</button><button className="admin-primary-button" type="submit" disabled={saving}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Create product'}</button></div></form>}
          </section>
        )}

        {section === 'fittings' && (
          <section className="admin-content"><div className="admin-panel"><div className="admin-panel-heading"><div><p className="admin-kicker">Customer appointments</p><h2>{requests.length} fitting requests</h2></div></div>{requests.length === 0 ? <p className="admin-empty">No fitting requests yet. Customer submissions will show up here.</p> : <div className="admin-table-wrap"><table className="admin-table admin-fitting-table"><thead><tr><th>Customer</th><th>Occasion & notes</th><th>Received</th><th>Status</th></tr></thead><tbody>{requests.map((request) => <tr key={request.id}><td><strong>{request.name}</strong><a href={`mailto:${request.email}`}>{request.email}</a><a href={`tel:${request.phone}`}>{request.phone}</a></td><td><strong>{request.occasion}</strong><p>{request.notes || 'No additional notes'}</p></td><td>{formatAdminDate(request.created_at)}</td><td><select className="admin-status-select" value={request.status} onChange={(event) => { const status = event.target.value; if (status === 'new' || status === 'contacted' || status === 'completed') void updateRequestStatus(request.id, status) }} aria-label={`Update request status for ${request.name}`}><option value="new">New</option><option value="contacted">Contacted</option><option value="completed">Completed</option></select></td></tr>)}</tbody></table></div>}</div></section>
        )}

        {section === 'customers' && (
          <section className="admin-content">
            <div className="admin-panel">
              <div className="admin-panel-heading"><div><p className="admin-kicker">Customer accounts</p><h2>{customerProfiles.length} registered customers</h2></div></div>
              {customerLoadError && <p className="admin-alert admin-section-alert" role="alert">Could not load customer accounts. Check that the SQL account API is running, then refresh. Details: {customerLoadError}</p>}
              {customerProfiles.length === 0 ? <p className="admin-empty">No registered customer accounts yet. New registrations will appear here.</p>
                : <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Name</th><th>Email</th><th>Registered</th></tr></thead><tbody>{customerProfiles.map((customer) => <tr key={customer.id}><td>{customer.full_name || 'Customer'}</td><td><a href={`mailto:${customer.email}`}>{customer.email}</a></td><td>{formatAdminDate(customer.created_at)}</td></tr>)}</tbody></table></div>}
            </div>
          </section>
        )}

        {section === 'support' && (
          <section className="admin-content">
            <div className="admin-support-layout">
              <div className="admin-panel admin-inbox">
                <div className="admin-panel-heading"><div><p className="admin-kicker">Customer care</p><h2>Conversations</h2></div><span className={`admin-status ${localMode ? 'new' : 'active'}`}>{localMode ? 'This device' : 'Live sync'}</span></div>
                {localMode && <p className="admin-local-chat-note">Demo messages stay in this browser profile. Add Supabase to receive chats from customers on other devices.</p>}
                {conversations.length === 0 ? <p className="admin-empty">No customer chats are stored in this browser yet. Chats from other devices require Supabase live mode.</p> : conversations.map((item) => {
                  const lastMessage = supportMessages.filter((entry) => entry.conversation_id === item.id).at(-1)
                  return <button className={item.id === selectedConversationId ? 'admin-inbox-item selected' : 'admin-inbox-item'} key={item.id} type="button" onClick={() => selectConversation(item.id)}>
                    <span className="admin-inbox-item-top"><strong>{item.customer_name || 'Store visitor'}</strong><span className={`admin-status ${item.status}`}>{item.status}</span></span>
                    <span className="admin-inbox-preview">{lastMessage?.body ?? 'No messages yet'}</span>
                    <time>{formatAdminDateTime(lastMessage?.created_at ?? item.updated_at)}</time>
                  </button>
                })}
              </div>
              <div className="admin-panel admin-chat-panel">
                {selectedConversation ? <>
                  <div className="admin-panel-heading">
                    <div><p className="admin-kicker">Live conversation</p><h2>{selectedConversation.customer_name || 'Store visitor'}</h2></div>
                    <button className="admin-secondary-button admin-close-chat" type="button" onClick={() => void updateConversationStatus(selectedConversation)}>{selectedConversation.status === 'open' ? 'Close conversation' : 'Reopen conversation'}</button>
                  </div>
                  <div className="admin-chat-messages">
                    {selectedMessages.map((item) => <article className={`admin-chat-bubble ${item.sender_role}`} key={item.id}><span>{item.sender_role === 'admin' ? 'Your team' : selectedConversation.customer_name}</span><p>{item.body}</p><time>{formatAdminDateTime(item.created_at)}</time></article>)}
                    {selectedMessages.length === 0 && <p className="admin-empty">Send a welcome message to start this conversation.</p>}
                  </div>
                  {selectedConversation.status === 'open' && <form className="admin-chat-compose" onSubmit={sendSupportReply}><textarea value={reply} onChange={(event) => setReply(event.target.value)} rows={2} maxLength={2000} placeholder="Write a reply…" aria-label="Your reply" required /><button className="admin-primary-button" type="submit" disabled={saving || !reply.trim()}><span>Send reply</span></button></form>}
                </> : <div className="admin-chat-empty"><Headset size={28} /><h2>Select a conversation</h2><p>Choose a customer from the inbox to reply in real time.</p></div>}
              </div>
            </div>
          </section>
        )}

        {section === 'settings' && (
          <section className="admin-content">
            <form className="admin-panel admin-settings-panel" onSubmit={saveWhatsAppSettings}>
              <div className="admin-panel-heading"><div><p className="admin-kicker">Customer service</p><h2>WhatsApp contact</h2></div></div>
              <div className="admin-settings-content">
                <p>Set the business WhatsApp number customers should message. Include the country code, digits only (for example, 923001234567). The storefront chat panel will open a WhatsApp conversation with a greeting.</p>
                <label>WhatsApp Business number<input inputMode="tel" autoComplete="tel" value={whatsAppNumber} onChange={(event) => setWhatsAppDraft(event.target.value)} placeholder="923001234567" /></label>
                <div className="admin-form-actions"><button className="admin-primary-button" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save customer service settings'}</button></div>
              </div>
            </form>
            <div className="admin-panel admin-settings-panel">
              <div className="admin-panel-heading"><div><p className="admin-kicker">Data and live updates</p><h2>{localMode ? 'SQLite accounts · browser demo data' : 'Supabase live mode'}</h2></div></div>
              <div className="admin-settings-content"><p>{localMode ? 'Customer registrations and manager sessions are stored in the account service SQLite database. Product edits, fitting requests, and demo support messages are saved in this browser.' : 'Live chat, catalog changes, and appointment updates are synchronized through Supabase Realtime. The self-hosted account database remains available for website customer registrations.'}</p></div>
            </div>
          </section>
        )}
      </main>
    </div>
  )
}
