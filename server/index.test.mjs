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
  const accountApp = createAccountApp({
    dbPath: join(directory, 'accounts.sqlite'),
    adminUsername: 'ShahzaibKS',
    adminPassword: 'a-manager-password',
  })
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

test('manager sign-in protects the SQL customer directory and persists the session', async () => {
  const unauthenticated = await fetch(`${origin}/api/admin/customers`)
  assert.equal(unauthenticated.status, 401)

  const invalidLogin = await fetch(`${origin}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify({ username: 'ShahzaibKS', password: 'wrong-password' }),
  })
  assert.equal(invalidLogin.status, 401)

  const login = await fetch(`${origin}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify({ username: 'shahzaibks', password: 'a-manager-password' }),
  })
  assert.equal(login.status, 200)
  assert.equal((await login.json()).user.username, 'shahzaibks')
  const cookie = login.headers.get('set-cookie').split(';')[0]

  const session = await fetch(`${origin}/api/admin/session`, { headers: { Cookie: cookie } })
  assert.equal((await session.json()).user.username, 'shahzaibks')

  const directory = await fetch(`${origin}/api/admin/customers`, { headers: { Cookie: cookie } })
  assert.equal(directory.status, 200)
  const result = await directory.json()
  assert.deepEqual(result.customers.map(({ fullName, email }) => ({ fullName, email })), [
    { fullName: 'Test Customer', email: 'test@example.com' },
  ])
  assert.ok(result.customers[0].createdAt)
  assert.ok(!JSON.stringify(result).includes('password_hash'))

  const logout = await fetch(`${origin}/api/admin/logout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin, Cookie: cookie },
    body: '{}',
  })
  assert.equal(logout.status, 200)
  const afterLogout = await fetch(`${origin}/api/admin/customers`, { headers: { Cookie: cookie } })
  assert.equal(afterLogout.status, 401)
})

test('support conversations are isolated by customer account and manager reads clear unread state', async () => {
  const secondRegistration = await fetch(`${origin}/api/account/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify({ fullName: 'Second Customer', email: 'second@example.com', password: 'a-secure-password' }),
  })
  assert.equal(secondRegistration.status, 201)
  const firstAccountCookie = (await fetch(`${origin}/api/account/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify({ email: 'test@example.com', password: 'a-secure-password' }),
  })).headers.get('set-cookie').split(';')[0]
  const secondAccountCookie = secondRegistration.headers.get('set-cookie').split(';')[0]

  const firstChatResponse = await fetch(`${origin}/api/support`, { headers: { Cookie: firstAccountCookie } })
  const firstChat = await firstChatResponse.json()
  assert.equal(firstChat.conversation.customer_email, 'test@example.com')
  assert.match(firstChat.conversation.customer_id, /^account-/)

  const secondChatResponse = await fetch(`${origin}/api/support`, { headers: { Cookie: secondAccountCookie } })
  const secondChat = await secondChatResponse.json()
  assert.notEqual(firstChat.conversation.id, secondChat.conversation.id)
  assert.equal(secondChat.messages.length, 0)

  const firstMessageResponse = await fetch(`${origin}/api/support/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin, Cookie: firstAccountCookie },
    body: JSON.stringify({ body: 'Private question for my order' }),
  })
  assert.equal(firstMessageResponse.status, 201)
  const firstMessage = (await firstMessageResponse.json()).message
  const secondRefresh = await fetch(`${origin}/api/support`, { headers: { Cookie: secondAccountCookie } })
  assert.equal((await secondRefresh.json()).messages.length, 0)

  const unauthorizedInbox = await fetch(`${origin}/api/admin/support`)
  assert.equal(unauthorizedInbox.status, 401)
  const login = await fetch(`${origin}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify({ username: 'ShahzaibKS', password: 'a-manager-password' }),
  })
  const adminCookie = login.headers.get('set-cookie').split(';')[0]
  const inboxResponse = await fetch(`${origin}/api/admin/support`, { headers: { Cookie: adminCookie } })
  assert.equal(inboxResponse.status, 200)
  const inbox = await inboxResponse.json()
  assert.ok(inbox.conversations.some((item) => item.id === firstChat.conversation.id))
  assert.ok(inbox.conversations.some((item) => item.id === secondChat.conversation.id))
  assert.ok(inbox.messages.some((item) => item.id === firstMessage.id))

  const readResponse = await fetch(`${origin}/api/admin/support/${firstChat.conversation.id}/read`, {
    method: 'POST',
    headers: { Origin: origin, Cookie: adminCookie },
  })
  assert.equal(readResponse.status, 200)
  const readConversation = (await readResponse.json()).conversation
  assert.ok(readConversation.admin_read_at >= firstMessage.created_at)

  await new Promise((resolve) => setTimeout(resolve, 5))
  const nextCustomerMessageResponse = await fetch(`${origin}/api/support/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin, Cookie: firstAccountCookie },
    body: JSON.stringify({ body: 'One more detail' }),
  })
  const nextCustomerMessage = (await nextCustomerMessageResponse.json()).message
  assert.ok(nextCustomerMessage.created_at > readConversation.admin_read_at)

  const replyResponse = await fetch(`${origin}/api/admin/support/${firstChat.conversation.id}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin, Cookie: adminCookie },
    body: JSON.stringify({ body: 'We can help with that.' }),
  })
  assert.equal(replyResponse.status, 201)
  const refreshedCustomerChat = await fetch(`${origin}/api/support`, { headers: { Cookie: firstAccountCookie } })
  const refreshedChat = await refreshedCustomerChat.json()
  assert.deepEqual(refreshedChat.messages.map(({ sender_role }) => sender_role), ['customer', 'customer', 'admin'])
})

test('manager can create and edit SQLite products and storefront receives active products only', async () => {
  const unauthorized = await fetch(`${origin}/api/admin/products`)
  assert.equal(unauthorized.status, 401)

  const login = await fetch(`${origin}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify({ username: 'ShahzaibKS', password: 'a-manager-password' }),
  })
  const adminCookie = login.headers.get('set-cookie').split(';')[0]
  const product = {
    id: 'test-catalog-design',
    name: 'Test Catalog Design',
    detail: 'Hand-finished test product',
    price: 8900,
    category: 'Daily Wear',
    image: 'https://example.com/product.jpg',
    fabric: 'Cotton',
    stitching: 'Resha stitch',
    colorways: [{ name: 'Ivory', hex: '#e9e1d2' }],
    tag: 'New',
    active: true,
  }
  const create = await fetch(`${origin}/api/admin/products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin, Cookie: adminCookie },
    body: JSON.stringify({ product }),
  })
  assert.equal(create.status, 200)
  assert.deepEqual((await create.json()).product, product)

  const storefront = await fetch(`${origin}/api/products`)
  assert.equal(storefront.status, 200)
  assert.ok((await storefront.json()).products.some((entry) => entry.id === product.id))

  const update = await fetch(`${origin}/api/admin/products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin, Cookie: adminCookie },
    body: JSON.stringify({ product: { ...product, name: 'Updated Catalog Design', price: 9500 } }),
  })
  assert.equal(update.status, 200)
  assert.equal((await update.json()).product.name, 'Updated Catalog Design')

  const hide = await fetch(`${origin}/api/admin/products/${product.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Origin: origin, Cookie: adminCookie },
    body: JSON.stringify({ active: false }),
  })
  assert.equal(hide.status, 200)
  assert.equal((await hide.json()).product.active, false)
  const afterHide = await fetch(`${origin}/api/products`)
  assert.ok(!(await afterHide.json()).products.some((entry) => entry.id === product.id))
})

test('checkout uses admin-configured payments, calculates prices on the server, and stores private orders', async () => {
  const login = await fetch(`${origin}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify({ username: 'ShahzaibKS', password: 'a-manager-password' }),
  })
  const adminCookie = login.headers.get('set-cookie').split(';')[0]
  const unauthenticatedSettings = await fetch(`${origin}/api/admin/payment-methods`)
  assert.equal(unauthenticatedSettings.status, 401)

  const product = {
    id: 'checkout-test-design',
    name: 'Checkout Test Design',
    detail: 'Test checkout product',
    price: 12000,
    category: 'Daily Wear',
    image: 'https://example.com/checkout.jpg',
    fabric: 'Cotton',
    stitching: 'Test stitch',
    colorways: [{ name: 'Ivory', hex: '#e9e1d2' }],
    active: true,
  }
  const savedProduct = await fetch(`${origin}/api/admin/products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin, Cookie: adminCookie },
    body: JSON.stringify({ product }),
  })
  assert.equal(savedProduct.status, 200)

  const methods = [
    { id: 'card', enabled: true, instructions: '', checkoutUrl: 'https://payments.example/checkout?amount={amount}&order={order_number}' },
    { id: 'bank_transfer', enabled: false, instructions: '', accountName: '', accountNumber: '', iban: '' },
    { id: 'easypaisa', enabled: false, instructions: '', accountName: '', accountNumber: '' },
    { id: 'jazzcash', enabled: false, instructions: '', accountName: '', accountNumber: '' },
  ]
  const saveMethods = await fetch(`${origin}/api/admin/payment-methods`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Origin: origin, Cookie: adminCookie },
    body: JSON.stringify({ methods }),
  })
  assert.equal(saveMethods.status, 200)
  assert.deepEqual((await (await fetch(`${origin}/api/payment-methods`)).json()).methods.map(({ id }) => id), ['card'])

  const createOrder = await fetch(`${origin}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify({
      customer: {
        name: 'Checkout Customer',
        email: 'checkout@example.com',
        phone: '+92 300 1234567',
        address: '12 Test Street, Model Town',
        city: 'Lahore',
        province: 'Punjab',
        postalCode: '54000',
        notes: '',
      },
      paymentMethod: 'card',
      items: [{ productId: product.id, color: 'Ivory', size: 'M', quantity: 2 }],
    }),
  })
  assert.equal(createOrder.status, 201)
  const { order } = await createOrder.json()
  assert.equal(order.subtotal, 24000)
  assert.equal(order.status, 'awaiting_payment')
  assert.equal(order.paymentStatus, 'awaiting_payment')
  const hostedUrl = new URL(order.paymentDetails.checkoutUrl)
  assert.equal(hostedUrl.searchParams.get('amount'), '24000')
  assert.equal(hostedUrl.searchParams.get('order'), order.orderNumber)

  const publicOrderResponse = await fetch(`${origin}/api/orders/${order.id}`)
  assert.equal(publicOrderResponse.status, 200)
  const publicOrder = (await publicOrderResponse.json()).order
  assert.equal(publicOrder.orderNumber, order.orderNumber)
  assert.equal(publicOrder.address, undefined)
  assert.equal(publicOrder.email, undefined)

  const adminOrders = await fetch(`${origin}/api/admin/orders`, { headers: { Cookie: adminCookie } })
  assert.equal(adminOrders.status, 200)
  const storedOrder = (await adminOrders.json()).orders.find((entry) => entry.id === order.id)
  assert.equal(storedOrder.email, 'checkout@example.com')
  assert.equal(storedOrder.address, '12 Test Street, Model Town')

  const updateOrder = await fetch(`${origin}/api/admin/orders/${order.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Origin: origin, Cookie: adminCookie },
    body: JSON.stringify({ status: 'processing' }),
  })
  assert.equal(updateOrder.status, 200)
  const updated = (await updateOrder.json()).order
  assert.equal(updated.status, 'processing')
  assert.equal(updated.paymentStatus, 'paid')
})

test('shop contact details are public to read and manager-only to update', async () => {
  const unauthenticated = await fetch(`${origin}/api/admin/store-contact`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify({ contact: { address: '1 Main Street', phone: '', whatsapp: '', email: '', mapUrl: '' } }),
  })
  assert.equal(unauthenticated.status, 401)

  const login = await fetch(`${origin}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify({ username: 'ShahzaibKS', password: 'a-manager-password' }),
  })
  const adminCookie = login.headers.get('set-cookie').split(';')[0]
  const contact = {
    address: 'Shop 4, Main Road, Lahore',
    phone: '+92 42 1234567',
    whatsapp: '+92 300 1234567',
    email: 'shop@example.com',
    mapUrl: 'https://maps.app.goo.gl/example',
  }
  const saved = await fetch(`${origin}/api/admin/store-contact`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Origin: origin, Cookie: adminCookie },
    body: JSON.stringify({ contact }),
  })
  assert.equal(saved.status, 200)
  assert.deepEqual((await saved.json()).contact, { ...contact, whatsapp: '923001234567' })

  const publicContact = await fetch(`${origin}/api/store-contact`)
  assert.equal(publicContact.status, 200)
  assert.deepEqual((await publicContact.json()).contact, { ...contact, whatsapp: '923001234567' })

  const unsafeMapLink = await fetch(`${origin}/api/admin/store-contact`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Origin: origin, Cookie: adminCookie },
    body: JSON.stringify({ contact: { ...contact, mapUrl: 'javascript:alert(1)' } }),
  })
  assert.equal(unsafeMapLink.status, 400)
})

test('manager login reports missing SQL admin credentials as a setup error', async () => {
  const missingConfigDirectory = mkdtempSync(join(tmpdir(), 'mian-admin-config-test-'))
  const unconfigured = createAccountApp({
    dbPath: join(missingConfigDirectory, 'accounts.sqlite'),
    adminUsername: '',
    adminPassword: '',
  })
  const unconfiguredServer = unconfigured.app.listen(0, '127.0.0.1')
  try {
    await new Promise((resolve, reject) => {
      unconfiguredServer.once('listening', resolve)
      unconfiguredServer.once('error', reject)
    })
    const unconfiguredOrigin = `http://127.0.0.1:${unconfiguredServer.address().port}`
    const response = await fetch(`${unconfiguredOrigin}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: unconfiguredOrigin },
      body: JSON.stringify({ email: 'manager@example.com', password: 'a-manager-password' }),
    })
    assert.equal(response.status, 503)
    assert.match((await response.json()).error, /ADMIN_USERNAME/)
  } finally {
    await new Promise((resolve, reject) => unconfiguredServer.close((error) => error ? reject(error) : resolve()))
    unconfigured.database.close()
    rmSync(missingConfigDirectory, { recursive: true, force: true })
  }
})

test('manager login rejects a password that repeats the username', async () => {
  const samePasswordDirectory = mkdtempSync(join(tmpdir(), 'mian-admin-password-test-'))
  const insecure = createAccountApp({
    dbPath: join(samePasswordDirectory, 'accounts.sqlite'),
    adminUsername: 'ShahzaibKS',
    adminPassword: 'ShahzaibKS',
  })
  const insecureServer = insecure.app.listen(0, '127.0.0.1')
  try {
    await new Promise((resolve, reject) => {
      insecureServer.once('listening', resolve)
      insecureServer.once('error', reject)
    })
    const insecureOrigin = `http://127.0.0.1:${insecureServer.address().port}`
    const response = await fetch(`${insecureOrigin}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: insecureOrigin },
      body: JSON.stringify({ username: 'ShahzaibKS', password: 'ShahzaibKS' }),
    })
    assert.equal(response.status, 503)
    assert.match((await response.json()).error, /different from the username/)
  } finally {
    await new Promise((resolve, reject) => insecureServer.close((error) => error ? reject(error) : resolve()))
    insecure.database.close()
    rmSync(samePasswordDirectory, { recursive: true, force: true })
  }
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
