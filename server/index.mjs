import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import { DatabaseSync } from 'node:sqlite'

if (existsSync(resolve('.env'))) process.loadEnvFile(resolve('.env'))

const scrypt = promisify(scryptCallback)
const sessionDurationSeconds = 60 * 60 * 24 * 30
const passwordSaltBytes = 16
const passwordHashBytes = 64
const scryptOptions = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex')
}

function timestampAfter(reference) {
  const referenceTime = reference ? Date.parse(reference) : 0
  return new Date(Math.max(Date.now(), Number.isFinite(referenceTime) ? referenceTime + 1 : 0)).toISOString()
}

function safeUser(row) {
  return { id: row.id, fullName: row.full_name, email: row.email }
}

function cookieValue(request, name) {
  const cookies = request.headers.cookie?.split(';') ?? []
  const value = cookies.map((cookie) => cookie.trim()).find((cookie) => cookie.startsWith(`${name}=`))
  return value ? decodeURIComponent(value.slice(name.length + 1)) : null
}

function setSessionCookie(response, token, name = 'mian_session') {
  const secure = process.env.AUTH_COOKIE_SECURE
    ? process.env.AUTH_COOKIE_SECURE === 'true'
    : process.env.NODE_ENV === 'production'
  response.setHeader('Set-Cookie', `${name}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${sessionDurationSeconds}${secure ? '; Secure' : ''}`)
}

function clearSessionCookie(response, name = 'mian_session') {
  const secure = process.env.AUTH_COOKIE_SECURE
    ? process.env.AUTH_COOKIE_SECURE === 'true'
    : process.env.NODE_ENV === 'production'
  response.setHeader('Set-Cookie', `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`)
}

function normalizeEmail(value) {
  if (typeof value !== 'string') return null
  const email = value.trim().toLowerCase()
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null
}

function normalizeUsername(value) {
  if (typeof value !== 'string') return null
  const username = value.trim().toLowerCase()
  return username.length >= 3 && username.length <= 64 && /^[a-z0-9._-]+$/.test(username) ? username : null
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
  adminUsername = process.env.ADMIN_USERNAME ?? process.env.ADMIN_EMAIL,
  adminPassword = process.env.ADMIN_PASSWORD,
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
    CREATE TABLE IF NOT EXISTS admin_sessions (
      token_hash TEXT PRIMARY KEY,
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS admin_sessions_expiry ON admin_sessions(expires_at);
    CREATE TABLE IF NOT EXISTS support_sessions (
      id TEXT PRIMARY KEY,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS support_sessions_expiry ON support_sessions(expires_at);
    CREATE TABLE IF NOT EXISTS support_conversations (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL,
      customer_name TEXT NOT NULL,
      customer_email TEXT,
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
      admin_read_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS support_conversations_customer ON support_conversations(customer_id, status, updated_at);
    CREATE TABLE IF NOT EXISTS support_messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES support_conversations(id) ON DELETE CASCADE,
      sender_id TEXT NOT NULL,
      sender_role TEXT NOT NULL CHECK (sender_role IN ('customer', 'admin')),
      body TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS support_messages_conversation ON support_messages(conversation_id, created_at);
    CREATE TABLE IF NOT EXISTS catalog_products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      detail TEXT NOT NULL,
      price REAL NOT NULL,
      category TEXT NOT NULL,
      image TEXT NOT NULL,
      fabric TEXT NOT NULL,
      stitching TEXT NOT NULL,
      colorways_json TEXT NOT NULL,
      tag TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS catalog_products_active_name ON catalog_products(active, name);
  `)

  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', 1)
  app.use(express.json({ limit: '1mb', strict: true }))
  app.use(['/api/account', '/api/admin', '/api/support'], (_request, response, next) => {
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
  const findAdminSession = database.prepare(`
    SELECT token_hash FROM admin_sessions
    WHERE token_hash = ? AND expires_at > ?
  `)
  const findSupportSession = database.prepare(`
    SELECT id FROM support_sessions
    WHERE token_hash = ? AND expires_at > ?
  `)

  function createSession(account, response) {
    const token = randomBytes(32).toString('base64url')
    database.prepare('INSERT INTO customer_sessions (token_hash, account_id, expires_at) VALUES (?, ?, ?)')
      .run(hashToken(token), account.id, Date.now() + sessionDurationSeconds * 1000)
    setSessionCookie(response, token)
    return safeUser(account)
  }

  function getAdminSession(request, response) {
    const token = cookieValue(request, 'mian_admin_session')
    const session = token ? findAdminSession.get(hashToken(token), Date.now()) : null
    if (!session && token) clearSessionCookie(response, 'mian_admin_session')
    return session ? { username: normalizeUsername(adminUsername) } : null
  }

  function getSupportOwner(request, response) {
    const accountToken = cookieValue(request, 'mian_session')
    const account = accountToken ? findSessionAccount.get(hashToken(accountToken), Date.now()) : null
    if (account) {
      return {
        id: `account-${account.id}`,
        name: account.full_name,
        email: account.email,
      }
    }

    const supportToken = cookieValue(request, 'mian_support_session')
    const supportSession = supportToken ? findSupportSession.get(hashToken(supportToken), Date.now()) : null
    if (supportSession) return { id: `guest-${supportSession.id}`, name: 'Store visitor', email: null }

    const token = randomBytes(32).toString('base64url')
    const id = randomBytes(16).toString('hex')
    database.prepare('INSERT INTO support_sessions (id, token_hash, expires_at) VALUES (?, ?, ?)')
      .run(id, hashToken(token), Date.now() + sessionDurationSeconds * 1000)
    setSessionCookie(response, token, 'mian_support_session')
    return { id: `guest-${id}`, name: 'Store visitor', email: null }
  }

  function findOpenConversation(ownerId) {
    return database.prepare(`
      SELECT * FROM support_conversations
      WHERE customer_id = ? AND status = 'open'
      ORDER BY updated_at DESC LIMIT 1
    `).get(ownerId)
  }

  function findLatestConversation(ownerId) {
    return database.prepare(`
      SELECT * FROM support_conversations
      WHERE customer_id = ?
      ORDER BY CASE status WHEN 'open' THEN 0 ELSE 1 END, updated_at DESC
      LIMIT 1
    `).get(ownerId)
  }

  function createSupportConversation(owner) {
    const now = new Date().toISOString()
    const conversation = {
      id: randomBytes(16).toString('hex'),
      customer_id: owner.id,
      customer_name: owner.name,
      customer_email: owner.email,
      status: 'open',
      admin_read_at: null,
      created_at: now,
      updated_at: now,
    }
    database.prepare(`
      INSERT INTO support_conversations
        (id, customer_id, customer_name, customer_email, status, admin_read_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      conversation.id,
      conversation.customer_id,
      conversation.customer_name,
      conversation.customer_email,
      conversation.status,
      conversation.admin_read_at,
      conversation.created_at,
      conversation.updated_at,
    )
    return conversation
  }

  function listSupportMessages(conversationId) {
    return database.prepare(`
      SELECT * FROM support_messages
      WHERE conversation_id = ?
      ORDER BY created_at, rowid
    `).all(conversationId)
  }

  function latestCustomerMessageTime(conversationId) {
    return database.prepare(`
      SELECT created_at FROM support_messages
      WHERE conversation_id = ? AND sender_role = 'customer'
      ORDER BY created_at DESC, rowid DESC
      LIMIT 1
    `).get(conversationId)?.created_at
  }

  function serializeProduct(row) {
    return {
      id: row.id,
      name: row.name,
      detail: row.detail,
      price: row.price,
      category: row.category,
      image: row.image,
      fabric: row.fabric,
      stitching: row.stitching,
      colorways: JSON.parse(row.colorways_json),
      ...(row.tag ? { tag: row.tag } : {}),
      active: Boolean(row.active),
    }
  }

  function validateProduct(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    const textFields = ['id', 'name', 'detail', 'category', 'image', 'fabric', 'stitching']
    if (textFields.some((field) => typeof value[field] !== 'string' || !value[field].trim())) return null
    const id = value.id.trim()
    if (id.length > 120 || !/^[a-z0-9-]+$/.test(id)) return null
    if (value.name.length > 200 || value.detail.length > 1000 || value.category.length > 100
      || value.image.length > 2048 || value.fabric.length > 200 || value.stitching.length > 1000) return null
    if (!Number.isFinite(value.price) || value.price < 0 || value.price > 100000000) return null
    try {
      const imageUrl = new URL(value.image)
      if (imageUrl.protocol !== 'https:' && imageUrl.protocol !== 'http:') return null
    } catch {
      return null
    }
    if (!Array.isArray(value.colorways) || value.colorways.length < 1 || value.colorways.length > 30) return null
    if (value.colorways.some((colorway) => !colorway
      || typeof colorway.name !== 'string'
      || !colorway.name.trim()
      || colorway.name.length > 80
      || typeof colorway.hex !== 'string'
      || !/^#[\da-f]{6}$/i.test(colorway.hex))) return null
    if (value.tag !== undefined && (typeof value.tag !== 'string' || value.tag.length > 100)) return null
    return {
      ...value,
      id,
      name: value.name.trim(),
      detail: value.detail.trim(),
      category: value.category.trim(),
      image: value.image.trim(),
      fabric: value.fabric.trim(),
      stitching: value.stitching.trim(),
      colorways: value.colorways.map((colorway) => ({ name: colorway.name.trim(), hex: colorway.hex })),
      tag: typeof value.tag === 'string' && value.tag.trim() ? value.tag.trim() : null,
      active: value.active !== false,
    }
  }

  const saveProduct = database.prepare(`
    INSERT INTO catalog_products
      (id, name, detail, price, category, image, fabric, stitching, colorways_json, tag, active, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      detail = excluded.detail,
      price = excluded.price,
      category = excluded.category,
      image = excluded.image,
      fabric = excluded.fabric,
      stitching = excluded.stitching,
      colorways_json = excluded.colorways_json,
      tag = excluded.tag,
      active = excluded.active,
      updated_at = excluded.updated_at
  `)

  function storeProduct(product) {
    saveProduct.run(
      product.id,
      product.name,
      product.detail,
      product.price,
      product.category,
      product.image,
      product.fabric,
      product.stitching,
      JSON.stringify(product.colorways),
      product.tag,
      product.active ? 1 : 0,
      new Date().toISOString(),
    )
  }

  app.get('/api/account', (request, response) => {
    database.prepare('DELETE FROM customer_sessions WHERE expires_at <= ?').run(Date.now())
    const token = cookieValue(request, 'mian_session')
    const account = token ? findSessionAccount.get(hashToken(token), Date.now()) : null
    if (!account && token) clearSessionCookie(response)
    response.json({ user: account ? safeUser(account) : null })
  })

  app.get('/api/products', (_request, response) => {
    const rows = database.prepare(`
      SELECT * FROM catalog_products WHERE active = 1 ORDER BY name
    `).all()
    response.json({ products: rows.map(serializeProduct) })
  })

  app.get('/api/support', (request, response) => {
    database.prepare('DELETE FROM support_sessions WHERE expires_at <= ?').run(Date.now())
    const owner = getSupportOwner(request, response)
    const conversation = findLatestConversation(owner.id) ?? createSupportConversation(owner)
    response.json({ conversation, messages: listSupportMessages(conversation.id) })
  })

  app.post('/api/support/name', allowSameOrigin, (request, response) => {
    const owner = getSupportOwner(request, response)
    const name = typeof request.body?.name === 'string' ? request.body.name.trim() : ''
    if (name.length < 1 || name.length > 80) {
      response.status(400).json({ error: 'Enter a name between 1 and 80 characters.' })
      return
    }
    const conversation = findOpenConversation(owner.id)
    if (!conversation) {
      response.status(404).json({ error: 'No open conversation was found.' })
      return
    }
    const updatedAt = new Date().toISOString()
    database.prepare('UPDATE support_conversations SET customer_name = ?, updated_at = ? WHERE id = ?')
      .run(name, updatedAt, conversation.id)
    response.json({
      conversation: { ...conversation, customer_name: name, updated_at: updatedAt },
    })
  })

  app.post('/api/support/messages', allowSameOrigin, rateLimit, (request, response) => {
    const owner = getSupportOwner(request, response)
    const body = typeof request.body?.body === 'string' ? request.body.body.trim() : ''
    if (!body || body.length > 2000) {
      response.status(400).json({ error: 'Messages must contain between 1 and 2000 characters.' })
      return
    }
    const conversation = findOpenConversation(owner.id)
    if (!conversation) {
      response.status(404).json({ error: 'No open conversation was found.' })
      return
    }
    const createdAt = timestampAfter(conversation.admin_read_at)
    const message = {
      id: randomBytes(16).toString('hex'),
      conversation_id: conversation.id,
      sender_id: owner.id,
      sender_role: 'customer',
      body,
      created_at: createdAt,
    }
    database.prepare(`
      INSERT INTO support_messages (id, conversation_id, sender_id, sender_role, body, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(message.id, message.conversation_id, message.sender_id, message.sender_role, message.body, message.created_at)
    database.prepare('UPDATE support_conversations SET updated_at = ? WHERE id = ?')
      .run(createdAt, conversation.id)
    response.status(201).json({ message })
  })

  app.use('/api/admin/support', (request, response, next) => {
    if (!getAdminSession(request, response)) {
      response.status(401).json({ error: 'Manager sign-in is required to view support conversations.' })
      return
    }
    next()
  })

  app.get('/api/admin/support', (_request, response) => {
    const conversations = database.prepare(`
      SELECT * FROM support_conversations
      ORDER BY updated_at DESC, created_at DESC
    `).all()
    const messages = database.prepare(`
      SELECT support_messages.* FROM support_messages
      JOIN support_conversations ON support_conversations.id = support_messages.conversation_id
      ORDER BY support_messages.created_at, support_messages.rowid
    `).all()
    response.json({ conversations, messages })
  })

  app.post('/api/admin/support/:id/read', allowSameOrigin, (request, response) => {
    const conversation = database.prepare('SELECT * FROM support_conversations WHERE id = ?').get(request.params.id)
    if (!conversation) {
      response.status(404).json({ error: 'Conversation not found.' })
      return
    }
    const adminReadAt = timestampAfter(latestCustomerMessageTime(conversation.id))
    database.prepare('UPDATE support_conversations SET admin_read_at = ? WHERE id = ?')
      .run(adminReadAt, conversation.id)
    response.json({ conversation: { ...conversation, admin_read_at: adminReadAt } })
  })

  app.patch('/api/admin/support/:id', allowSameOrigin, (request, response) => {
    const status = request.body?.status
    if (status !== 'open' && status !== 'closed') {
      response.status(400).json({ error: 'Conversation status must be open or closed.' })
      return
    }
    const conversation = database.prepare('SELECT * FROM support_conversations WHERE id = ?').get(request.params.id)
    if (!conversation) {
      response.status(404).json({ error: 'Conversation not found.' })
      return
    }
    const updatedAt = new Date().toISOString()
    database.prepare('UPDATE support_conversations SET status = ?, updated_at = ? WHERE id = ?')
      .run(status, updatedAt, conversation.id)
    response.json({ conversation: { ...conversation, status, updated_at: updatedAt } })
  })

  app.post('/api/admin/support/:id/messages', allowSameOrigin, (request, response) => {
    const conversation = database.prepare('SELECT * FROM support_conversations WHERE id = ?').get(request.params.id)
    if (!conversation) {
      response.status(404).json({ error: 'Conversation not found.' })
      return
    }
    if (conversation.status !== 'open') {
      response.status(409).json({ error: 'Reopen this conversation before replying.' })
      return
    }
    const body = typeof request.body?.body === 'string' ? request.body.body.trim() : ''
    if (!body || body.length > 2000) {
      response.status(400).json({ error: 'Messages must contain between 1 and 2000 characters.' })
      return
    }
    const admin = getAdminSession(request, response)
    const createdAt = timestampAfter(latestCustomerMessageTime(conversation.id))
    const message = {
      id: randomBytes(16).toString('hex'),
      conversation_id: conversation.id,
      sender_id: admin.username,
      sender_role: 'admin',
      body,
      created_at: createdAt,
    }
    database.prepare(`
      INSERT INTO support_messages (id, conversation_id, sender_id, sender_role, body, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(message.id, message.conversation_id, message.sender_id, message.sender_role, message.body, message.created_at)
    database.prepare('UPDATE support_conversations SET updated_at = ?, admin_read_at = ? WHERE id = ?')
      .run(createdAt, createdAt, conversation.id)
    response.status(201).json({ message, conversation: { ...conversation, updated_at: createdAt, admin_read_at: createdAt } })
  })

  app.get('/api/admin/session', (request, response) => {
    database.prepare('DELETE FROM admin_sessions WHERE expires_at <= ?').run(Date.now())
    response.json({ user: getAdminSession(request, response) })
  })

  app.post('/api/admin/login', allowSameOrigin, rateLimit, async (request, response, next) => {
    const body = request.body && typeof request.body === 'object' ? request.body : {}
    const username = normalizeUsername(body.username ?? body.email)
    const password = body.password
    if (!normalizeUsername(adminUsername)
      || typeof adminPassword !== 'string'
      || adminPassword.length < 12
      || adminPassword.toLowerCase() === normalizeUsername(adminUsername)) {
      response.status(503).json({ error: 'Set ADMIN_USERNAME and a unique manager password of at least 12 characters that is different from the username.' })
      return
    }
    if (!username || typeof password !== 'string' || password.length > 128) {
      response.status(400).json({ error: 'Enter a valid manager username and password.' })
      return
    }
    try {
      const salt = randomBytes(passwordSaltBytes)
      const [providedHash, configuredHash] = await Promise.all([
        scrypt(password, salt, passwordHashBytes, scryptOptions),
        scrypt(adminPassword, salt, passwordHashBytes, scryptOptions),
      ])
      const valid = username === normalizeUsername(adminUsername)
        && providedHash.length === configuredHash.length
        && timingSafeEqual(providedHash, configuredHash)
      if (!valid) {
        response.status(401).json({ error: 'Email or password is incorrect.' })
        return
      }
      const token = randomBytes(32).toString('base64url')
      database.prepare('INSERT INTO admin_sessions (token_hash, expires_at) VALUES (?, ?)')
        .run(hashToken(token), Date.now() + sessionDurationSeconds * 1000)
      setSessionCookie(response, token, 'mian_admin_session')
      response.json({ user: { username: normalizeUsername(adminUsername) } })
    } catch (error) {
      next(error)
    }
  })

  app.post('/api/admin/logout', allowSameOrigin, (request, response) => {
    const token = cookieValue(request, 'mian_admin_session')
    if (token) database.prepare('DELETE FROM admin_sessions WHERE token_hash = ?').run(hashToken(token))
    clearSessionCookie(response, 'mian_admin_session')
    response.json({ user: null })
  })

  app.get('/api/admin/customers', (request, response) => {
    if (!getAdminSession(request, response)) {
      response.status(401).json({ error: 'Manager sign-in is required to view customer accounts.' })
      return
    }
    const customers = database.prepare(`
      SELECT id, full_name AS fullName, email, created_at AS createdAt
      FROM customer_accounts
      ORDER BY datetime(created_at) DESC, id DESC
    `).all()
    response.json({ customers })
  })

  app.use('/api/admin/products', (request, response, next) => {
    if (!getAdminSession(request, response)) {
      response.status(401).json({ error: 'Manager sign-in is required to manage products.' })
      return
    }
    next()
  })

  app.get('/api/admin/products', (_request, response) => {
    const rows = database.prepare('SELECT * FROM catalog_products ORDER BY name').all()
    response.json({ products: rows.map(serializeProduct) })
  })

  app.post('/api/admin/products/seed', allowSameOrigin, (request, response) => {
    if (database.prepare('SELECT COUNT(*) AS count FROM catalog_products').get().count > 0) {
      response.status(409).json({ error: 'The catalog already contains products.' })
      return
    }
    const incoming = request.body?.products
    if (!Array.isArray(incoming) || incoming.length < 1 || incoming.length > 1000) {
      response.status(400).json({ error: 'Provide between 1 and 1000 valid catalog products.' })
      return
    }
    const validated = incoming.map(validateProduct)
    if (validated.some((product) => !product)
      || new Set(validated.map((product) => product.id)).size !== validated.length) {
      response.status(400).json({ error: 'The catalog contains invalid or duplicate product entries.' })
      return
    }
    database.exec('BEGIN')
    try {
      for (const product of validated) storeProduct(product)
      database.exec('COMMIT')
    } catch (error) {
      database.exec('ROLLBACK')
      throw error
    }
    const products = database.prepare('SELECT * FROM catalog_products ORDER BY name').all()
    response.status(201).json({ products: products.map(serializeProduct) })
  })

  app.post('/api/admin/products', allowSameOrigin, (request, response) => {
    const product = validateProduct(request.body?.product)
    if (!product) {
      response.status(400).json({ error: 'Check the product details, image URL, price, and colorways.' })
      return
    }
    storeProduct(product)
    response.json({ product: serializeProduct(database.prepare('SELECT * FROM catalog_products WHERE id = ?').get(product.id)) })
  })

  app.patch('/api/admin/products/:id', allowSameOrigin, (request, response) => {
    if (typeof request.body?.active !== 'boolean') {
      response.status(400).json({ error: 'Product visibility must be true or false.' })
      return
    }
    const result = database.prepare('UPDATE catalog_products SET active = ?, updated_at = ? WHERE id = ?')
      .run(request.body.active ? 1 : 0, new Date().toISOString(), request.params.id)
    if (result.changes === 0) {
      response.status(404).json({ error: 'Product not found.' })
      return
    }
    response.json({ product: serializeProduct(database.prepare('SELECT * FROM catalog_products WHERE id = ?').get(request.params.id)) })
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
