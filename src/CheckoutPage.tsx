import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { ArrowLeft, ArrowRight, Check, CreditCard, LoaderCircle, MapPin, Wallet } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { CartLine, PaymentMethod, PaymentMethodId, StoreOrder } from './types'
import { readApiResponse } from './lib/api-response'
import { useLocale } from './locale-context'

type PaymentMethodResponse = { methods?: PaymentMethod[]; error?: string }
type OrderResponse = { order?: StoreOrder & { paymentDetails: PaymentMethod }; error?: string }

const money = new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR', maximumFractionDigits: 0 })
const paymentLabels: Record<PaymentMethodId, string> = {
  card: 'Card',
  bank_transfer: 'Bank transfer',
  easypaisa: 'Easypaisa',
  jazzcash: 'JazzCash',
}

export function CheckoutPage({ cart, subtotal, onOrderPlaced }: {
  cart: CartLine[]
  subtotal: number
  onOrderPlaced: () => void
}) {
  const { t } = useLocale()
  const navigate = useNavigate()
  const [methods, setMethods] = useState<PaymentMethod[]>([])
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethodId | ''>('')
  const [loadingMethods, setLoadingMethods] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    async function loadMethods() {
      try {
        const response = await fetch('/api/payment-methods')
        const result = await readApiResponse<PaymentMethodResponse>(response)
        if (!response.ok) throw new Error(result.error ?? 'Could not load payment methods.')
        if (active) {
          const available = result.methods ?? []
          setMethods(available)
          setSelectedMethod(available[0]?.id ?? '')
        }
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Could not load payment methods.')
      } finally {
        if (active) setLoadingMethods(false)
      }
    }
    void loadMethods()
    return () => { active = false }
  }, [])

  async function submitOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedMethod || cart.length === 0) return
    setSubmitting(true)
    setError('')
    try {
      const formData = new FormData(event.currentTarget)
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer: {
            name: formData.get('name'),
            email: formData.get('email'),
            phone: formData.get('phone'),
            address: formData.get('address'),
            city: formData.get('city'),
            province: formData.get('province'),
            postalCode: formData.get('postalCode'),
            notes: formData.get('notes'),
          },
          paymentMethod: selectedMethod,
          items: cart.map((line) => ({
            productId: line.product.id,
            color: line.colorway.name,
            size: line.size,
            quantity: line.quantity,
          })),
        }),
      })
      const result = await readApiResponse<OrderResponse>(response)
      if (!response.ok) throw new Error(result.error ?? 'Could not place your order.')
      if (!result.order) throw new Error('The store did not confirm your order.')
      onOrderPlaced()
      navigate(`/payment/${result.order.id}`)
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Could not place your order.')
    } finally {
      setSubmitting(false)
    }
  }

  if (!cart.length) {
    return <section className="checkout-page section-wrap checkout-empty">
      <p className="eyebrow">{t('Secure checkout')}</p>
      <h1>{t('Your bag is empty.')}</h1>
      <Link className="button button-dark" to="/shop">{t('Explore the collection')} <ArrowRight size={16} /></Link>
    </section>
  }

  return (
    <section className="checkout-page section-wrap">
      <Link className="checkout-back-link" to="/shop"><ArrowLeft size={15} /> {t('Continue shopping')}</Link>
      <div className="checkout-heading"><div><p className="eyebrow">{t('Almost yours')}</p><h1>{t('Checkout')}</h1><p>{t('Add your delivery details and choose how you would like to pay.')}</p></div><span className="checkout-secure-note"><Check size={15} /> {t('Your order is securely submitted')}</span></div>
      <form className="checkout-grid" onSubmit={submitOrder}>
        <div className="checkout-form-column">
          <section className="checkout-panel">
            <div className="checkout-panel-heading"><span><MapPin size={17} /></span><div><h2>{t('Contact and delivery')}</h2><p>{t('We need these details to confirm and deliver your order.')}</p></div></div>
            <div className="checkout-fields">
              <label>{t('Full name')}<input name="name" autoComplete="name" required maxLength={120} /></label>
              <div className="checkout-field-row">
                <label>{t('Email address')}<input name="email" type="email" autoComplete="email" required maxLength={254} /></label>
                <label>{t('Phone number')}<input name="phone" type="tel" autoComplete="tel" inputMode="tel" placeholder="+92 300 1234567" required maxLength={25} /></label>
              </div>
              <label>{t('Street address')}<textarea name="address" autoComplete="street-address" rows={2} placeholder={t('House, street, area, apartment')} required maxLength={300} /></label>
              <div className="checkout-field-row checkout-location-row">
                <label>{t('City')}<input name="city" autoComplete="address-level2" required maxLength={100} /></label>
                <label>{t('Province / region')}<select name="province" autoComplete="address-level1" defaultValue="" required><option value="" disabled>{t('Select province')}</option><option value="Punjab">{t('Punjab')}</option><option value="Sindh">{t('Sindh')}</option><option value="Khyber Pakhtunkhwa">{t('Khyber Pakhtunkhwa')}</option><option value="Balochistan">{t('Balochistan')}</option><option value="Islamabad Capital Territory">{t('Islamabad Capital Territory')}</option><option value="Gilgit-Baltistan">{t('Gilgit-Baltistan')}</option><option value="Azad Jammu and Kashmir">{t('Azad Jammu and Kashmir')}</option></select></label>
                <label>{t('Postal code')}<input name="postalCode" autoComplete="postal-code" maxLength={20} /></label>
              </div>
              <label>{t('Delivery notes (optional)')}<textarea name="notes" rows={2} placeholder={t('Landmark or delivery instructions')} maxLength={1000} /></label>
            </div>
          </section>

          <section className="checkout-panel">
            <div className="checkout-panel-heading"><span><Wallet size={17} /></span><div><h2>{t('Payment method')}</h2><p>{t('Payment instructions will be shown after you place the order.')}</p></div></div>
            {loadingMethods ? <p className="checkout-state"><LoaderCircle size={16} className="checkout-spinner" /> {t('Loading payment methods…')}</p> : methods.length === 0 ? <p className="checkout-state">{t('No payment methods are available yet. Please contact customer service.')}</p> : <div className="payment-method-list">
              {methods.map((method) => <label className={selectedMethod === method.id ? 'payment-method-option selected' : 'payment-method-option'} key={method.id}>
                <input type="radio" name="paymentMethod" value={method.id} checked={selectedMethod === method.id} onChange={() => setSelectedMethod(method.id)} />
                <span className="payment-method-icon">{method.id === 'card' ? <CreditCard size={17} /> : <Wallet size={17} />}</span>
                <span><strong>{t(paymentLabels[method.id])}</strong><small>{t(method.id === 'card' ? 'Secure external card checkout' : 'Payment instructions on the next page')}</small></span>
                <i />
              </label>)}
            </div>}
          </section>
        </div>

        <aside className="checkout-order-panel">
          <div className="checkout-panel-heading"><span><Check size={17} /></span><div><h2>{t('Order summary')}</h2><p>{cart.length} {t(cart.length === 1 ? 'item' : 'items')}</p></div></div>
          <div className="checkout-summary-items">{cart.map((line) => <div className="checkout-summary-item" key={`${line.product.id}-${line.colorway.name}-${line.size}`}>
            <img src={line.product.image} alt="" />
            <div><strong>{t(line.product.name)}</strong><small>{t(line.colorway.name)} · {t('Size ')}{line.size} · {line.quantity}×</small></div>
            <span>{money.format(line.product.price * line.quantity)}</span>
          </div>)}</div>
          <div className="checkout-totals"><p><span>{t('Subtotal')}</span><strong>{money.format(subtotal)}</strong></p><p><span>{t('Delivery')}</span><span>{t('Confirmed by our team')}</span></p><p className="checkout-total"><span>{t('Order total')}</span><strong>{money.format(subtotal)}</strong></p></div>
          <p className="checkout-delivery-note">{t('The amount shown is for your items. Customer service will confirm any delivery charge before processing.')}</p>
          {error && <p className="form-error" role="alert">{t(error)}</p>}
          <button className="checkout-submit-button" type="submit" disabled={submitting || loadingMethods || methods.length === 0 || !selectedMethod}>
            {submitting ? <>{t('Placing order…')} <LoaderCircle size={16} className="checkout-spinner" /></> : <>{t('Place order')} <ArrowRight size={16} /></>}
          </button>
          <p className="checkout-privacy-note">{t('Your contact and delivery details are used only to handle this order.')}</p>
        </aside>
      </form>
    </section>
  )
}

export function PaymentPage() {
  const { t } = useLocale()
  const { orderId } = useParams()
  const [order, setOrder] = useState<(StoreOrder & { paymentDetails: PaymentMethod }) | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    async function loadOrder() {
      try {
        if (!orderId) throw new Error('Order not found.')
        const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}`)
        const result = await readApiResponse<OrderResponse>(response)
        if (!response.ok) throw new Error(result.error ?? 'Could not load your order.')
        if (!result.order) throw new Error('The store did not return your order.')
        if (active) setOrder(result.order)
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Could not load your order.')
      } finally {
        if (active) setLoading(false)
      }
    }
    void loadOrder()
    return () => { active = false }
  }, [orderId])

  if (loading) return <section className="payment-page section-wrap"><p className="checkout-state"><LoaderCircle size={16} className="checkout-spinner" /> {t('Loading your order…')}</p></section>
  if (error || !order) return <section className="payment-page section-wrap"><p className="eyebrow">{t('Payment')}</p><h1>{t('We could not load your order.')}</h1><p className="form-error" role="alert">{t(error || 'Order not found.')}</p><Link className="button button-dark" to="/shop">{t('Back to the collection')} <ArrowRight size={16} /></Link></section>

  const method = order.paymentDetails
  const isCard = method.id === 'card'
  return <section className="payment-page section-wrap">
    <div className="payment-confirmation-icon"><Check size={23} /></div>
    <p className="eyebrow">{t('Order received')}</p>
    <h1>{t('Thank you for your order.')}</h1>
    <p className="payment-intro">{t('Your order has been saved. It will remain awaiting payment until our team verifies your payment.')}</p>
    <div className="payment-order-card">
      <div className="payment-order-header"><span>{t('Order number')}</span><strong>{order.orderNumber}</strong></div>
      <div className="payment-order-header"><span>{t('Payment method')}</span><strong>{t(paymentLabels[method.id])}</strong></div>
      <div className="payment-order-header"><span>{t('Amount for items')}</span><strong>{money.format(order.subtotal)}</strong></div>
      <div className="payment-order-header"><span>{t('Order status')}</span><strong className="payment-awaiting">{t('Awaiting payment')}</strong></div>
      <div className="payment-instructions"><h2>{t(isCard ? 'Pay securely by card' : 'Payment instructions')}</h2>
        {method.accountName && <p><span>{t('Account name')}</span><strong>{method.accountName}</strong></p>}
        {method.accountNumber && <p><span>{t(method.id === 'bank_transfer' ? 'Account number' : 'Account / mobile number')}</span><strong>{method.accountNumber}</strong></p>}
        {method.iban && <p><span>{t('IBAN')}</span><strong>{method.iban}</strong></p>}
        {method.instructions && <p className="payment-extra-instructions">{t(method.instructions)}</p>}
        {isCard && method.checkoutUrl && <a className="checkout-submit-button payment-card-link" href={method.checkoutUrl} target="_blank" rel="noopener noreferrer">{t('Continue to secure card checkout')} <ArrowRight size={16} /></a>}
        {!isCard && <p className="payment-extra-instructions">{t('After sending payment, contact customer service and share your order number and payment reference.')}</p>}
      </div>
    </div>
    <p className="payment-help-note">{t('Need help? Customer service is available using the chat button on this page.')}</p>
    <Link className="text-link payment-home-link" to="/">{t('Return to the storefront')} <ArrowRight size={15} /></Link>
  </section>
}
