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
