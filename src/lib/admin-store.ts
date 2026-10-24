import type { FittingRequest, Product, SupportConversation, SupportMessage } from '../types'

const productsKey = 'mian-tailor.admin.products.v1'
const requestsKey = 'mian-tailor.admin.fitting-requests.v1'
const conversationsKey = 'mian-tailor.admin.support-conversations.v1'
const messagesKey = 'mian-tailor.admin.support-messages.v1'
const whatsappKey = 'mian-tailor.admin.whatsapp-number.v1'
const localChangeEvent = 'mian-tailor-admin-data-change'

export type LocalAdminSnapshot = {
  revision: number
  products: Product[]
  requests: FittingRequest[]
  conversations: SupportConversation[]
  messages: SupportMessage[]
  whatsappNumber: string
}

let localRevision = 0
let cachedSnapshot: LocalAdminSnapshot | null = null

function readList<T>(key: string): T[] | null {
  const stored = localStorage.getItem(key)
  if (stored === null) return null
  const value: unknown = JSON.parse(stored)
  if (!Array.isArray(value)) throw new Error(`Saved admin data in ${key} is invalid.`)
  return value as T[]
}

export function readLocalProducts(fallback: Product[]): Product[] {
  return readList<Product>(productsKey) ?? fallback
}

export function readLocalRequests(): FittingRequest[] {
  return readList<FittingRequest>(requestsKey) ?? []
}

export function readLocalConversations(): SupportConversation[] {
  return readList<SupportConversation>(conversationsKey) ?? []
}

export function readLocalMessages(): SupportMessage[] {
  return readList<SupportMessage>(messagesKey) ?? []
}

export function readLocalWhatsAppNumber(): string {
  return localStorage.getItem(whatsappKey) ?? ''
}

export function getLocalAdminSnapshot(fallbackProducts: Product[]): LocalAdminSnapshot {
  if (!cachedSnapshot || cachedSnapshot.revision !== localRevision) {
    cachedSnapshot = {
      revision: localRevision,
      products: readLocalProducts(fallbackProducts),
      requests: readLocalRequests(),
      conversations: readLocalConversations(),
      messages: readLocalMessages(),
      whatsappNumber: readLocalWhatsAppNumber(),
    }
  }
  return cachedSnapshot
}

function notifyLocalChange() {
  localRevision += 1
  cachedSnapshot = null
  window.dispatchEvent(new Event(localChangeEvent))
}

export function writeLocalProducts(products: Product[]) {
  localStorage.setItem(productsKey, JSON.stringify(products))
  notifyLocalChange()
}

export function writeLocalRequests(requests: FittingRequest[]) {
  localStorage.setItem(requestsKey, JSON.stringify(requests))
  notifyLocalChange()
}

export function writeLocalConversations(conversations: SupportConversation[]) {
  localStorage.setItem(conversationsKey, JSON.stringify(conversations))
  notifyLocalChange()
}

export function writeLocalMessages(messages: SupportMessage[]) {
  localStorage.setItem(messagesKey, JSON.stringify(messages))
  notifyLocalChange()
}

export function writeLocalWhatsAppNumber(number: string) {
  localStorage.setItem(whatsappKey, number)
  notifyLocalChange()
}

export function subscribeToLocalAdminData(onChange: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || [productsKey, requestsKey, conversationsKey, messagesKey, whatsappKey].includes(event.key)) {
      localRevision += 1
      cachedSnapshot = null
      onChange()
    }
  }
  window.addEventListener(localChangeEvent, onChange)
  window.addEventListener('storage', onStorage)
  window.addEventListener('focus', onChange)
  return () => {
    window.removeEventListener(localChangeEvent, onChange)
    window.removeEventListener('storage', onStorage)
    window.removeEventListener('focus', onChange)
  }
}
