import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import { DatabaseSync } from 'node:sqlite'
import { createClient } from '@supabase/supabase-js'

if (existsSync(resolve('.env'))) process.loadEnvFile(resolve('.env'))

const scrypt = promisify(scryptCallback)
const sessionDurationSeconds = 60 * 60 * 24 * 30
const passwordSaltBytes = 16
const passwordHashBytes = 64
const scryptOptions = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex')
}

function safeUser(row) {
  return { id: row.id, fullName: row.full_name, email: row.email }
}

function cookieValue(request, name) {
  const cookies = request.headers.cookie?.split(';') ?? []
  const value = cookies.map((cookie) => cookie.trim()).find((cookie) => cookie.startsWith(`${name}=`))
  return value ? decodeURIComponent(value.slice(name.length + 1)) : null
}

function setSessionCookie(response, token) {
  const secure = process.env.AUTH_COOKIE_SECURE
    ? process.env.AUTH_COOKIE_SECURE === 'true'
    : process.env.NODE_ENV === 'production'
  response.setHeader('Set-Cookie', `mian_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${sessionDurationSeconds}${secure ? '; Secure' : ''}`)
}

function clearSessionCookie(response) {
  const secure = process.env.AUTH_COOKIE_SECURE
    ? process.env.AUTH_COOKIE_SECURE === 'true'
    : process.env.NODE_ENV === 'production'
  response.setHeader('Set-Cookie', `mian_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`)
}

function normalizeEmail(value) {
  if (typeof value !== 'string') return null
  const email = value.trim().toLowerCase()
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null
}

function allowSameOrigin(request, response, next) {
  const origin = request.get('origin')
  if (!origin) {
    response.status(403).json({ error: 'This request could not be verified.' })
    return
  }
  try {
    if (new URL(origin).host !== request.get('host')) {
      response.status(403).json({ error: 'This request could not be verified.' })
      return
    }
  } catch {
    response.status(403).json({ error: 'This request could not be verified.' })
    return
  }
  next()
}

export function createAccountApp({
  dbPath = process.env.AUTH_DB_PATH ?? './data/accounts.sqlite',
  verifyAdminToken,
} = {}) {
  const databasePath = resolve(dbPath)
  mkdirSync(dirname(databasePath), { recursive: true })
  const database = new DatabaseSync(databasePath)
  database.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;')
  database.exec(`
    CREATE TABLE IF NOT EXISTS customer_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS customer_sessions (
      token_hash TEXT PRIMARY KEY,
      account_id INTEGER NOT NULL REFERENCES customer_accounts(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS customer_sessions_expiry ON customer_sessions(expires_at);
  `)
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY
  const supabaseAuth = supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false, autoRefreshToken: false } })
    : null

  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', 1)
  app.use(express.json({ limit: '10kb', strict: true }))
  app.use('/api/account', (_request, response, next) => {
    response.setHeader('Cache-Control', 'no-store')
    next()
  })

  const attempts = new Map()
  function rateLimit(request, response, next) {
    const key = `${request.path}:${request.ip}`
    const now = Date.now()
    let state = attempts.get(key)
    if (!state || state.until <= now) {
      state = { count: 0, until: now + 15 * 60 * 1000 }
      attempts.set(key, state)
    }
    state.count += 1
    if (state.count > 10) {
      response.status(429).json({ error: 'Too many attempts. Please wait 15 minutes and try again.' })
      return
    }
    if (attempts.size > 1000) {
      for (const [attemptKey, entry] of attempts) {
        if (entry.until <= now) attempts.delete(attemptKey)
      }
    }
    next()
  }

  const findSessionAccount = database.prepare(`
    SELECT customer_accounts.id, customer_accounts.full_name, customer_accounts.email
    FROM customer_sessions
    JOIN customer_accounts ON customer_accounts.id = customer_sessions.account_id
    WHERE customer_sessions.token_hash = ? AND customer_sessions.expires_at > ?
  `)

  function createSession(account, response) {
    const token = randomBytes(32).toString('base64url')
    database.prepare('INSERT INTO customer_sessions (token_hash, account_id, expires_at) VALUES (?, ?, ?)')
      .run(hashToken(token), account.id, Date.now() + sessionDurationSeconds * 1000)
    setSessionCookie(response, token)
    return safeUser(account)
  }

  app.get('/api/account', (request, response) => {
    database.prepare('DELETE FROM customer_sessions WHERE expires_at <= ?').run(Date.now())
    const token = cookieValue(request, 'mian_session')
    const account = token ? findSessionAccount.get(hashToken(token), Date.now()) : null
    if (!account && token) clearSessionCookie(response)
    response.json({ user: account ? safeUser(account) : null })
  })

  app.get('/api/admin/customers', async (request, response, next) => {
    const token = request.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]
    if (!token) {
      response.status(401).json({ error: 'Admin sign-in is required to view customer accounts.' })
      return
    }
    if (!verifyAdminToken && !supabaseAuth) {
      response.status(503).json({ error: 'Customer directory requires Supabase admin authentication to be configured on the account service.' })
      return
    }
    try {
      const user = verifyAdminToken
        ? await verifyAdminToken(token)
        : await supabaseAuth.auth.getUser(token).then(({ data, error }) => {
            if (error) return null
            return data.user
          })
      if (!user) {
        response.status(401).json({ error: 'Admin session is invalid or expired. Sign in again.' })
        return
      }
      if (user.app_metadata?.role !== 'admin') {
        response.status(403).json({ error: 'Admin access is required to view customer accounts.' })
        return
      }
      const customers = database.prepare(`
        SELECT id, full_name AS fullName, email, created_at AS createdAt
        FROM customer_accounts
        ORDER BY datetime(created_at) DESC, id DESC
      `).all()
      response.json({ customers })
    } catch (error) {
      next(error)
    }
  })

  app.post('/api/account/register', allowSameOrigin, rateLimit, async (request, response, next) => {
    const body = request.body && typeof request.body === 'object' ? request.body : {}
    const fullName = typeof body.fullName === 'string' ? body.fullName.trim() : ''
    const email = normalizeEmail(body.email)
    const password = body.password
    if (fullName.length < 2 || fullName.length > 120 || !email || typeof password !== 'string' || password.length < 8 || password.length > 128) {
      response.status(400).json({ error: 'Enter a valid name and email, and a password between 8 and 128 characters.' })
      return
    }
    try {
      const salt = randomBytes(passwordSaltBytes)
      const derivedKey = await scrypt(password, salt, passwordHashBytes, scryptOptions)
      const insert = database.prepare('INSERT INTO customer_accounts (full_name, email, password_hash) VALUES (?, ?, ?)')
      const result = insert.run(fullName, email, `${salt.toString('hex')}:${derivedKey.toString('hex')}`)
      const account = database.prepare('SELECT id, full_name, email FROM customer_accounts WHERE id = ?').get(result.lastInsertRowid)
      response.status(201).json({ user: createSession(account, response) })
    } catch (error) {
      if (error?.code === 'SQLITE_CONSTRAINT_UNIQUE' || error?.errcode === 2067) {
        response.status(409).json({ error: 'An account with that email already exists.' })
        return
      }
      next(error)
    }
  })

  app.post('/api/account/login', allowSameOrigin, rateLimit, async (request, response, next) => {
    const body = request.body && typeof request.body === 'object' ? request.body : {}
    const email = normalizeEmail(body.email)
    const password = body.password
    if (!email || typeof password !== 'string' || password.length > 128) {
      response.status(400).json({ error: 'Enter a valid email and password.' })
      return
    }
    try {
      const account = database.prepare('SELECT id, full_name, email, password_hash FROM customer_accounts WHERE email = ?').get(email)
      const [saltHex, expectedHex] = account?.password_hash.split(':') ?? ['', '']
      const salt = Buffer.from(saltHex, 'hex')
      const expected = Buffer.from(expectedHex, 'hex')
      const derived = await scrypt(password, account ? salt : Buffer.alloc(passwordSaltBytes), passwordHashBytes, scryptOptions)
      const valid = account && expected.length === derived.length && timingSafeEqual(expected, derived)
      if (!valid) {
        response.status(401).json({ error: 'Email or password is incorrect.' })
        return
      }
      response.json({ user: createSession(account, response) })
    } catch (error) {
      next(error)
    }
  })

  app.post('/api/account/logout', allowSameOrigin, (request, response) => {
    const token = cookieValue(request, 'mian_session')
    if (token) database.prepare('DELETE FROM customer_sessions WHERE token_hash = ?').run(hashToken(token))
    clearSessionCookie(response)
    response.json({ user: null })
  })

  app.use((error, _request, response, _next) => {
    console.error('Account API request failed:', error)
    if (response.headersSent) return
    if (error instanceof SyntaxError) {
      response.status(400).json({ error: 'Request body must be valid JSON.' })
      return
    }
    response.status(500).json({ error: 'Account service is temporarily unavailable.' })
  })

  return { app, database }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const { app, database } = createAccountApp()
  const port = Number(process.env.AUTH_PORT ?? 3001)
  const host = process.env.AUTH_HOST ?? '127.0.0.1'
  const server = app.listen(port, host, () => console.log(`Mian account API listening on http://${host}:${port}`))
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => server.close(() => {
      database.close()
      process.exit(0)
    }))
  }
}
