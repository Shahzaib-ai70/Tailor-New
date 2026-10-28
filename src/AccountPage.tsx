import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { ArrowLeft, LogOut } from 'lucide-react'
import { Link } from 'react-router-dom'
import { readApiResponse } from './lib/api-response'
import { useLocale } from './locale-context'
import './Account.css'

type Account = {
  id: number
  fullName: string
  email: string
}

type AccountMode = 'sign-in' | 'register'

async function accountRequest(path: string, body?: object): Promise<Account | null> {
  const response = await fetch(path, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const result = await readApiResponse<{ user?: Account | null; error?: string }>(response)
  if (!response.ok) throw new Error(result.error || 'Could not complete your account request.')
  return result.user ?? null
}

export default function AccountPage() {
  const { t } = useLocale()
  const [account, setAccount] = useState<Account | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [mode, setMode] = useState<AccountMode>('sign-in')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let mounted = true
    void accountRequest('/api/account').then((nextAccount) => {
      if (mounted) setAccount(nextAccount)
    }).catch((loadError: unknown) => {
      if (mounted) setError(loadError instanceof Error ? loadError.message : 'Could not check your account.')
    }).finally(() => {
      if (mounted) setLoading(false)
    })
    return () => { mounted = false }
  }, [])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const nextAccount = await accountRequest(
        mode === 'register' ? '/api/account/register' : '/api/account/login',
        mode === 'register'
          ? { fullName: name.trim(), email: email.trim(), password }
          : { email: email.trim(), password },
      )
      setAccount(nextAccount)
      setPassword('')
      if (mode === 'register') setNotice('Your account has been created and you are signed in.')
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : 'Could not complete your account request.')
    } finally {
      setSaving(false)
    }
  }

  async function signOut() {
    setError('')
    setNotice('')
    try {
      await accountRequest('/api/account/logout', {})
      setAccount(null)
      setNotice('You have signed out.')
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : 'Could not sign out.')
    }
  }

  return (
    <section className="account-page section-wrap">
      <div className="account-card">
        <p className="eyebrow">{t('Your Mian account')}</p>
        {loading ? <p className="account-copy">{t('Checking your account…')}</p> : account ? (
          <>
            <h1>{t('Welcome,')} {account.fullName}.</h1>
            <p className="account-copy">{t('Signed in as')} <strong>{account.email}</strong></p>
            {notice && <p className="account-notice" role="status">{t(notice)}</p>}
            {error && <p className="account-error" role="alert">{t(error)}</p>}
            <button className="button button-dark account-submit" type="button" onClick={() => void signOut()}><LogOut size={15} /> {t('Sign out')}</button>
          </>
        ) : (
          <>
            <h1>{t(mode === 'sign-in' ? 'Welcome back.' : 'Create your account.')}</h1>
            <p className="account-copy">{t(mode === 'sign-in' ? 'Sign in to your customer account.' : 'Register for your Mian customer account.')}</p>
            <div className="account-tabs" role="tablist" aria-label={t('Account access')}>
              <button type="button" role="tab" aria-selected={mode === 'sign-in'} className={mode === 'sign-in' ? 'active' : ''} onClick={() => { setMode('sign-in'); setError(''); setNotice('') }}>{t('Sign in')}</button>
              <button type="button" role="tab" aria-selected={mode === 'register'} className={mode === 'register' ? 'active' : ''} onClick={() => { setMode('register'); setError(''); setNotice('') }}>{t('Register')}</button>
            </div>
            <form className="account-form" onSubmit={submit}>
              {mode === 'register' && <label>{t('Full name')}<input autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={120} required /></label>}
              <label>{t('Email address')}<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={254} required /></label>
              <label>{t('Password')}<input type="password" autoComplete={mode === 'register' ? 'new-password' : 'current-password'} value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} maxLength={128} required /></label>
              {notice && <p className="account-notice" role="status">{t(notice)}</p>}
              {error && <p className="account-error" role="alert">{t(error)}</p>}
              <button className="button button-dark account-submit" type="submit" disabled={saving}>{t(saving ? 'Please wait…' : mode === 'sign-in' ? 'Sign in' : 'Create account')}</button>
            </form>
          </>
        )}
        <Link className="account-back-link" to="/"><ArrowLeft size={14} /> {t('Back to storefront')}</Link>
      </div>
    </section>
  )
}
