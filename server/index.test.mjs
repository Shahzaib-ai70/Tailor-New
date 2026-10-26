import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { createAccountApp } from './index.mjs'

let directory
let database
let server
let origin

before(async () => {
  directory = mkdtempSync(join(tmpdir(), 'mian-account-test-'))
  const accountApp = createAccountApp({ dbPath: join(directory, 'accounts.sqlite') })
  database = accountApp.database
  server = accountApp.app.listen(0, '127.0.0.1')
  await new Promise((resolve, reject) => {
    server.once('listening', resolve)
    server.once('error', reject)
  })
  origin = `http://127.0.0.1:${server.address().port}`
})

after(async () => {
  if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  database?.close()
  if (directory) rmSync(directory, { recursive: true, force: true })
})

test('registration stores a password hash and creates a persistent signed-in session', async () => {
  const response = await fetch(`${origin}/api/account/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify({ fullName: 'Test Customer', email: 'TEST@example.com', password: 'a-secure-password' }),
  })
  assert.equal(response.status, 201)
  const { user } = await response.json()
  assert.equal(user.fullName, 'Test Customer')
  assert.equal(user.email, 'test@example.com')
  const saved = database.prepare('SELECT password_hash FROM customer_accounts WHERE email = ?').get(user.email)
  assert.match(saved.password_hash, /^[a-f0-9]+:[a-f0-9]+$/)
  assert.ok(!saved.password_hash.includes('a-secure-password'))

  const cookie = response.headers.get('set-cookie').split(';')[0]
  const sessionResponse = await fetch(`${origin}/api/account`, { headers: { Cookie: cookie } })
  assert.equal((await sessionResponse.json()).user.email, user.email)
})

test('duplicate registration and invalid login are rejected', async () => {
  const duplicate = await fetch(`${origin}/api/account/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify({ fullName: 'Another Customer', email: 'test@example.com', password: 'a-secure-password' }),
  })
  assert.equal(duplicate.status, 409)

  const wrongPassword = await fetch(`${origin}/api/account/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify({ email: 'test@example.com', password: 'incorrect-password' }),
  })
  assert.equal(wrongPassword.status, 401)
})

test('logout clears the session and cross-origin mutations are rejected', async () => {
  const login = await fetch(`${origin}/api/account/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify({ email: 'test@example.com', password: 'a-secure-password' }),
  })
  assert.equal(login.status, 200)
  const cookie = login.headers.get('set-cookie').split(';')[0]

  const logout = await fetch(`${origin}/api/account/logout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin, Cookie: cookie },
    body: '{}',
  })
  assert.equal(logout.status, 200)
  const session = await fetch(`${origin}/api/account`, { headers: { Cookie: cookie } })
  assert.equal((await session.json()).user, null)

  const crossOrigin = await fetch(`${origin}/api/account/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://attacker.example' },
    body: JSON.stringify({ email: 'test@example.com', password: 'a-secure-password' }),
  })
  assert.equal(crossOrigin.status, 403)
})
