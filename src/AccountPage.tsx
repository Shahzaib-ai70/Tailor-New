import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { ArrowLeft, LogOut } from 'lucide-react'
import { Link } from 'react-router-dom'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import './Account.css'

type AccountMode = 'sign-in' | 'register'

export default function AccountPage() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(Boolean(supabase))
  const [saving, setSaving] = useState(false)
  const [mode, setMode] = useState<AccountMode>('sign-in')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    if (!supabase) return
    let mounted = true
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setLoading(false)
    })
    void supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!mounted) return
      if (sessionError) setError(sessionError.message)
      setSession(data.session)
      setLoading(false)
    }).catch((sessionError: Error) => {
      if (!mounted) return
      setError(sessionError.message)
      setLoading(false)
    })
    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase) return
    setSaving(true)
    setError('')
    setNotice('')
    try {
      if (mode === 'register') {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { full_name: name.trim() },
            emailRedirectTo: `${window.location.origin}/account`,
          },
        })
        if (signUpError) throw signUpError
        if (!data.session) {
          setNotice('Account created. Check your email for a confirmation link, then sign in.')
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        })
        if (signInError) throw signInError
      }
      setPassword('')
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : 'Could not complete your account request.')
    } finally {
      setSaving(false)
    }
  }

  async function signOut() {
    if (!supabase) return
    setError('')
    try {
      const { error: signOutError } = await supabase.auth.signOut()
      if (signOutError) throw signOutError
      setNotice('You have signed out.')
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : 'Could not sign out.')
    }
  }

  return (
    <section className="account-page section-wrap">
      <div className="account-card">
        <p className="eyebrow">Your Mian account</p>
        {loading ? <p className="account-copy">Checking your account…</p> : session ? (
          <>
            <h1>Welcome{session.user.user_metadata.full_name ? `, ${session.user.user_metadata.full_name}` : ' back'}.</h1>
            <p className="account-copy">Signed in as <strong>{session.user.email}</strong></p>
            {notice && <p className="account-notice" role="status">{notice}</p>}
            {error && <p className="account-error" role="alert">{error}</p>}
            <button className="button button-dark account-submit" type="button" onClick={() => void signOut()}><LogOut size={15} /> Sign out</button>
          </>
        ) : !isSupabaseConfigured ? (
          <>
            <h1>Accounts are not set up yet.</h1>
            <p className="account-copy">Customer registration and sign-in will be available after Supabase is configured for this site.</p>
          </>
        ) : (
          <>
            <h1>{mode === 'sign-in' ? 'Welcome back.' : 'Create your account.'}</h1>
            <p className="account-copy">{mode === 'sign-in' ? 'Sign in to your customer account.' : 'Register to create your customer account.'}</p>
            <div className="account-tabs" role="tablist" aria-label="Account access">
              <button type="button" role="tab" aria-selected={mode === 'sign-in'} className={mode === 'sign-in' ? 'active' : ''} onClick={() => { setMode('sign-in'); setError(''); setNotice('') }}>Sign in</button>
              <button type="button" role="tab" aria-selected={mode === 'register'} className={mode === 'register' ? 'active' : ''} onClick={() => { setMode('register'); setError(''); setNotice('') }}>Register</button>
            </div>
            <form className="account-form" onSubmit={submit}>
              {mode === 'register' && <label>Full name<input autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={120} required /></label>}
              <label>Email address<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={254} required /></label>
              <label>Password<input type="password" autoComplete={mode === 'register' ? 'new-password' : 'current-password'} value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} required /></label>
              {notice && <p className="account-notice" role="status">{notice}</p>}
              {error && <p className="account-error" role="alert">{error}</p>}
              <button className="button button-dark account-submit" type="submit" disabled={saving}>{saving ? 'Please wait…' : mode === 'sign-in' ? 'Sign in' : 'Create account'}</button>
            </form>
          </>
        )}
        <Link className="account-back-link" to="/"><ArrowLeft size={14} /> Back to storefront</Link>
      </div>
    </section>
  )
}
