export type Colorway = { name: string; hex: string }

export type Product = {
  id: string
  name: string
  detail: string
  price: number
  category: string
  image: string
  fabric: string
  stitching: string
  colorways: Colorway[]
  tag?: string
  active?: boolean
}

export type CartLine = { product: Product; colorway: Colorway; size: string; quantity: number }

export type FittingRequest = {
  id: string
  name: string
  email: string
  phone: string
  occasion: string
  notes: string
  status: 'new' | 'contacted' | 'completed'
  created_at: string
}

export type SupportConversation = {
  id: string
  customer_id: string
  customer_name: string
  customer_email?: string | null
  status: 'open' | 'closed'
  admin_read_at?: string | null
  created_at: string
  updated_at: string
}

export type SupportMessage = {
  id: string
  conversation_id: string
  sender_id: string
  sender_role: 'customer' | 'admin'
  body: string
  created_at: string
}

export type CustomerProfile = {
  id: string
  email: string
  full_name: string
  created_at: string
}

export type PaymentMethodId = 'card' | 'bank_transfer' | 'easypaisa' | 'jazzcash'

export type PaymentMethod = {
  id: PaymentMethodId
  enabled: boolean
  instructions: string
  checkoutUrl?: string
  accountName?: string
  accountNumber?: string
  iban?: string
}

export type CheckoutAddress = {
  name: string
  email: string
  phone: string
  address: string
  city: string
  province: string
  postalCode: string
  notes: string
}

export type OrderItem = {
  productId: string
  name: string
  color: string
  size: string
  quantity: number
  unitPrice: number
}

export type StoreOrder = {
  id: string
  orderNumber: string
  customerName: string
  email: string
  phone: string
  address: string
  city: string
  province: string
  postalCode: string
  notes: string
  paymentMethod: PaymentMethodId
  paymentStatus: 'awaiting_payment' | 'paid'
  status: 'awaiting_payment' | 'processing' | 'shipped' | 'completed' | 'cancelled'
  subtotal: number
  items: OrderItem[]
  createdAt: string
}
