import { useEffect, useState } from 'react'
import { Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom'
import { ArrowDown, ArrowRight, ArrowUpRight, Check, Menu, Minus, Plus, ShoppingBag, UserRound, X } from 'lucide-react'
import type { CartLine, Colorway, Product } from './types'
import { supabase } from './lib/supabase'
import { readLocalRequests, writeLocalRequests } from './lib/admin-store'
import { readApiResponse } from './lib/api-response'
import AdminPage from './AdminPage'
import AccountPage from './AccountPage'
import SupportWidget from './SupportWidget'
import LanguageSwitcher from './LanguageSwitcher'
import { CheckoutPage, PaymentPage } from './CheckoutPage'
import { useLocale } from './locale-context'
import './App.css'

const colorways = [
  { name: 'Charcoal', hex: '#4c4b49' },
  { name: 'Ivory', hex: '#e9e1d2' },
  { name: 'Indigo', hex: '#3b506f' },
  { name: 'Deep Plum', hex: '#704254' },
  { name: 'Black', hex: '#252321' },
]

const baseDesigns = [
  { id: 'mehran-straight-cut', name: 'Mehran Straight Cut', detail: 'Everyday / straight collar', category: 'Daily Wear', price: 8900, fabric: 'Washed cotton', stitching: 'Straight collar, clean placket, side-seam pockets', colorways, tag: 'Bestseller' },
  { id: 'safa-summer-cotton', name: 'Safa Summer Cotton', detail: 'Everyday / airy relaxed fit', category: 'Daily Wear', price: 8200, fabric: 'Breathable cotton', stitching: 'Soft band collar, tonal buttons, roomy shalwar', colorways },
  { id: 'noor-band-collar', name: 'Noor Band Collar', detail: 'Everyday / rounded band collar', category: 'Daily Wear', price: 9400, fabric: 'Lightweight cotton', stitching: 'Rounded collar, narrow cuff, relaxed straight cut', colorways },
  { id: 'neel-threadwork', name: 'Neel Threadwork Placket', detail: 'Eid Edit / contrast threadwork', category: 'Eid & Festive', price: 12900, fabric: 'Textured cotton blend', stitching: 'Contrast piping, shaped cuffs, hand-finished placket', colorways, tag: 'Eid edit' },
  { id: 'gul-mehndi-cuff', name: 'Gul Mehndi Cuff', detail: 'Eid Edit / embellished cuff', category: 'Eid & Festive', price: 14500, fabric: 'Soft premium cotton', stitching: 'Fine collar detailing, covered buttons, embroidered cuffs', colorways },
  { id: 'jashn-panel-kameez', name: 'Jashn Panel Kameez', detail: 'Wedding Guest / shaped panels', category: 'Wedding Guest', price: 15900, fabric: 'Premium textured cotton', stitching: 'Panel-front detail, contrast buttons, tailored shoulder', colorways, tag: 'Celebration' },
  { id: 'zari-waistcoat', name: 'Zari Waistcoat Set', detail: 'Waistcoat / woven layer', category: 'Waistcoat Sets', price: 18900, fabric: 'Cotton kameez, woven waistcoat', stitching: 'Layered waistcoat, refined buttons, precise shoulder line', colorways, tag: 'Two-piece' },
  { id: 'riwayat-prince-coat', name: 'Riwayat Prince Coat', detail: 'Waistcoat / formal layered set', category: 'Waistcoat Sets', price: 21900, fabric: 'Premium cotton with woven vest', stitching: 'Structured vest, statement buttons, clean kameez front', colorways },
  { id: 'siyah-pathani', name: 'Siyah Pathani Suit', detail: 'Pathani / relaxed silhouette', category: 'Pathani', price: 9900, fabric: 'Cotton dobby', stitching: 'Wide band collar, concealed placket, tapered shalwar', colorways },
  { id: 'dastoor-classic-shalwar', name: 'Dastoor Classic Shalwar', detail: 'Wedding Guest / traditional drape', category: 'Wedding Guest', price: 11900, fabric: 'Cotton-linen blend', stitching: 'Classic long hem, hand-finished collar, full-cut shalwar', colorways },
]

const stitchTreatments = [
  { id: 'resha', name: 'Resha Stitch', detail: 'fine tonal resha embroidery', price: 0 },
  { id: 'kinari', name: 'Kinari Edge', detail: 'contrast kinari edging on collar and cuffs', price: 900 },
  { id: 'badla', name: 'Badla Placket', detail: 'badla-inspired metallic thread along the placket', price: 1600 },
  { id: 'shadow', name: 'Shadow Panel', detail: 'tonal shadow panels with double topstitching', price: 1200 },
  { id: 'gulaab', name: 'Gulaab Motif', detail: 'small floral motifs hand-finished at the cuff', price: 1900 },
]

const productPhotos = [
  'photo-1711216612464-3fde510fa50f',
  'photo-1710956446132-832273cd344d',
  'photo-1770359993283-a2c2f386584e',
  'photo-1774437791807-362e58f09a2c',
  'photo-1785613590026-6beec884b0a3',
  'photo-1767796704750-d685fb2a2143',
  'photo-1785671053282-b734d6d4fafe',
  'photo-1785613590014-23875bff09f2',
  'photo-1780831768483-7c586313a714',
  'photo-1780247473503-98dab7f79af7',
  'photo-1774527929685-0372244a6232',
  'photo-1776630982364-60bbcef71c27',
  'photo-1774437790865-76bfb73d7166',
  'photo-1772736243289-872f9ac73cf8',
  'photo-1781106785213-ee999c3edf50',
  'photo-1785613589986-0ffdb2880575',
  'photo-1768807478320-fcfd3929acb2',
  'photo-1768807478287-9e7953cfdca3',
  'photo-1767775498862-d4740ce574ce',
  'photo-1774437678561-c321687f6986',
  'photo-1774267230662-575d1f4ec1bd',
  'photo-1774438462884-4961ce3e1683',
  'photo-1774438357726-948799526851',
  'photo-1774438028955-657a8aaea934',
  'photo-1774438024336-b390b6fffe10',
  'photo-1774438364169-41c3c4ed5b2c',
  'photo-1774267230654-ad5335ecd6f0',
  'photo-1785613590468-ed69d7f38d8d',
  'photo-1785612157903-13729eac0c0c',
  'photo-1783923134306-45ca9b7d747e',
  'photo-1783923134298-5a202299a7c4',
  'photo-1783923134222-b84651059acc',
  'photo-1768505655473-b1cbb5e09c3b',
  'photo-1762708548905-bbfb80fdb909',
  'photo-1762708550156-115244f4042f',
  'photo-1762709412730-321a0d81b517',
  'photo-1762709313986-aadc6aeb443a',
  'photo-1780246329289-8f8fddffac90',
  'photo-1760110885990-11520997b2f4',
  'photo-1763723341218-e37463fc7318',
  'photo-1770575913004-6462e1680a5c',
  'photo-1734510411010-d410f38e10f0',
  'photo-1770392988936-dc3d8581e0c9',
  'photo-1768696082567-f3571983a977',
  'photo-1779903598092-0ebe4b84cd77',
  'photo-1754658662315-46038fd8349d',
  'photo-1727835523545-70ee992b5763',
  'photo-1744551358303-46edae8b374b',
  'photo-1701365676249-9d7ab5022dec',
  'photo-1711044871601-301f9b0ecf91',
].map((photoId) => `https://images.unsplash.com/${photoId}?auto=format&fit=crop&w=1200&h=1500&q=85`)

const products: Product[] = stitchTreatments.flatMap((treatment, treatmentIndex) => baseDesigns.map((design, designIndex) => ({
  ...design,
  id: `${design.id}-${treatment.id}`,
  name: `${design.name} - ${treatment.name}`,
  detail: `${design.category} / ${treatment.name}`,
  price: design.price + treatment.price,
  stitching: `${design.stitching}; ${treatment.detail}`,
  image: productPhotos[treatmentIndex * baseDesigns.length + designIndex],
  tag: treatmentIndex === 0 ? design.tag : undefined,
})))

if (productPhotos.length !== 50 || new Set(productPhotos).size !== 50 || products.length !== 50 || new Set(products.map((product) => product.id)).size !== 50 || new Set(products.map((product) => product.image)).size !== 50) {
  throw new Error('The product catalog must contain 50 uniquely named designs with unique photos.')
}

const categories = ['All collections', 'Daily Wear', 'Eid & Festive', 'Wedding Guest', 'Waistcoat Sets', 'Pathani']
const sizes = ['S', 'M', 'L', 'XL', 'XXL']
const money = new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR', maximumFractionDigits: 0 })
const cartStorageKey = 'mian-shopping-bag-v1'

function isStoredCartLine(value: unknown): value is CartLine {
  if (!value || typeof value !== 'object') return false
  const line = value as Partial<CartLine>
  const product = line.product
  const colorway = line.colorway
  return Boolean(
    product && typeof product === 'object'
    && typeof product.id === 'string'
    && typeof product.name === 'string'
    && typeof product.detail === 'string'
    && typeof product.price === 'number' && Number.isFinite(product.price) && product.price >= 0
    && typeof product.category === 'string'
    && typeof product.image === 'string'
    && typeof product.fabric === 'string'
    && typeof product.stitching === 'string'
    && Array.isArray(product.colorways)
    && colorway && typeof colorway === 'object'
    && typeof colorway.name === 'string'
    && typeof colorway.hex === 'string'
    && sizes.includes(line.size ?? '')
    && Number.isInteger(line.quantity) && (line.quantity ?? 0) > 0 && (line.quantity ?? 0) <= 10,
  )
}

function readStoredCart(): { cart: CartLine[]; error: string } {
  try {
    const stored = window.localStorage.getItem(cartStorageKey)
    if (!stored) return { cart: [], error: '' }
    const parsed: unknown = JSON.parse(stored)
    if (!Array.isArray(parsed) || !parsed.every(isStoredCartLine)) {
      return { cart: [], error: 'Your saved bag could not be read and has been cleared.' }
    }
    return { cart: parsed, error: '' }
  } catch {
    return { cart: [], error: 'Your saved bag could not be read. Check your browser storage settings.' }
  }
}

function ProductCard({ product, onAdd }: { product: Product; onAdd: (product: Product, colorway: Colorway, size: string) => void }) {
  const { t } = useLocale()
  const [size, setSize] = useState('M')
  const [selectedColorway, setSelectedColorway] = useState(product.colorways[0])
  const [added, setAdded] = useState(false)
  function add() {
    onAdd(product, selectedColorway, size)
    setAdded(true)
    window.setTimeout(() => setAdded(false), 1400)
  }

  return (
    <article className="product-card">
      <Link className="product-image-wrap" to={`/shop/${product.id}`} aria-label={`${t('View')} ${product.name}`}>
        <img className="product-image" src={product.image} alt={`${t("Men's fashion reference photo for")} ${t(product.name)}`} />
        {product.tag && <span className="product-tag">{t(product.tag)}</span>}
        <span className="product-view">{t('View design')} <ArrowUpRight size={14} /></span>
      </Link>
      <div className="product-info">
        <div className="product-title-row"><div><h3><Link to={`/shop/${product.id}`}>{t(product.name)}</Link></h3><p>{t(product.detail)}</p></div><span className="product-price">{money.format(product.price)}</span></div>
        <div className="card-color-picker" role="group" aria-label={`${t('Choose color for')} ${product.name}`}><span className="color-picker-label">{t(selectedColorway.name)}</span><div className="color-options">{product.colorways.map((colorway) => <button className={selectedColorway.name === colorway.name ? 'color-option selected' : 'color-option'} key={colorway.name} type="button" onClick={() => setSelectedColorway(colorway)} aria-label={`${t(colorway.name)} ${t('color')}`} aria-pressed={selectedColorway.name === colorway.name} title={t(colorway.name)} style={{ '--swatch': colorway.hex } as React.CSSProperties} />)}</div></div>
        <div className="product-actions"><label className="size-select-label" htmlFor={`size-${product.id}`}>{t('Size')}</label><select id={`size-${product.id}`} value={size} onChange={(event) => setSize(event.target.value)} aria-label={`${t('Select size for')} ${product.name}`}>{sizes.map((value) => <option key={value}>{value}</option>)}</select><button className="add-button" type="button" onClick={add}>{added ? <><Check size={15} /> {t('Added')}</> : <>{t('Add to bag')} <Plus size={15} /></>}</button></div>
      </div>
    </article>
  )
}

function HomePage({ catalog, onAdd }: { catalog: Product[]; onAdd: (product: Product, colorway: Colorway, size: string) => void }) {
  const { t } = useLocale()
  const featuredProducts = catalog.length > 2 ? [catalog[0], catalog[Math.floor(catalog.length / 2)], catalog[catalog.length - 1]] : catalog
  return (
    <>
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-copy"><p className="eyebrow"><span className="eyebrow-line" /> {t('Made with our roots in mind')}</p><h1 id="hero-title">{t('Tradition,')}<br /><em>{t('stitched your way.')}</em></h1><p className="hero-description">{t('Pakistani shalwar kameez, cut for today. Thoughtful fabrics, distinctive stitching, and room to move through every moment.')}</p><Link className="button button-dark" to="/shop">{t('Explore the collection')} <ArrowUpRight size={16} /></Link><div className="hero-footnote"><span>{t('PAKISTANI CRAFT')}</span><span>{t('Designed with care')} <i /> {t('Made to wear')}</span></div></div>
        <div className="hero-image" role="img" aria-label={t('Man wearing a charcoal Pakistani shalwar kameez')}><div className="image-note"><span>{t('THE EVERYDAY EDIT')}</span><span>01 / 50 {t('DESIGNS')}</span></div><div className="hero-caption"><span>{t('Easy in every detail.')}</span><ArrowDown size={17} /></div></div>
        <div className="hero-side-label">{t('SHALWAR KAMEEZ · MADE WITH INTENTION')}</div>
      </section>
      <section className="trust-strip" aria-label={t('Our promise')}><span>{t('Pakistani design sensibility')}</span><i /><span>{t('Comfort-first cottons')}</span><i /><span>{t('Careful finishing')}</span><i /><span>{t('Made for your moments')}</span></section>
      <section className="featured section-wrap"><div className="section-heading"><div><p className="eyebrow">{t('A few good places to start')}</p><h2>{t('Stitched for')}<br /><em>{t('your kind of day.')}</em></h2></div><p className="section-intro">{t('From the ease of everyday cotton to a little extra detail for the celebrations that stay with you.')}</p></div><div className="product-grid">{featuredProducts.map((product) => <ProductCard key={product.id} product={product} onAdd={onAdd} />)}</div><Link className="text-link all-suits-link" to="/shop">{t('Explore 50 stitched designs in five colors')} <ArrowRight size={15} /></Link></section>
      <section className="home-craft"><div className="home-craft-photo" role="img" aria-label={t('Pakistani man wearing traditional charcoal shalwar kameez')} /><div className="home-craft-copy"><p className="eyebrow">{t('The hand behind the stitch')}</p><h2>{t('Everyday ease.')}<br /><em>{t('Considered detail.')}</em></h2><p>{t('We believe a good kameez is felt before it is noticed: in its drape, the ease of its cut, and the care in every finish.')}</p><Link className="text-link" to="/craft">{t('Meet the craft')} <ArrowRight size={15} /></Link></div></section>
    </>
  )
}

function ShopPage({ catalog, onAdd }: { catalog: Product[]; onAdd: (product: Product, colorway: Colorway, size: string) => void }) {
  const { t } = useLocale()
  const [activeCategory, setActiveCategory] = useState('All collections')
  const visibleProducts = activeCategory === 'All collections' ? catalog : catalog.filter((product) => product.category === activeCategory)
  return (
    <section className="shop-page section-wrap">
      <div className="page-intro"><p className="eyebrow">{t('The shalwar kameez collection')}</p><h1>{t('Made for the')}<br /><em>{t('way you move.')}</em></h1><p>{t('Explore fifty designs across five stitch treatments and five colorways. Stock photos are style references and may not show the exact design or selected color.')}</p></div>
      <div className="collection-tools"><div className="filter-list" role="group" aria-label={t('Filter designs by occasion')}>{categories.map((category) => <button className={activeCategory === category ? 'filter-button active' : 'filter-button'} key={category} onClick={() => setActiveCategory(category)} type="button">{t(category)}</button>)}</div><span className="product-count">{visibleProducts.length} {t('designs')}</span></div>
      <div className="product-grid shop-grid">{visibleProducts.map((product) => <ProductCard key={product.id} product={product} onAdd={onAdd} />)}</div>
    </section>
  )
}

function ProductPage({ catalog, onAdd }: { catalog: Product[]; onAdd: (product: Product, colorway: Colorway, size: string) => void }) {
  const { t } = useLocale()
  const { productId } = useParams()
  const product = catalog.find((item) => item.id === productId)
  const [size, setSize] = useState('M')
  const [selectedColorway, setSelectedColorway] = useState(product?.colorways[0] ?? colorways[0])
  const [added, setAdded] = useState(false)
  if (!product) return <Navigate to="/shop" replace />
  return (
    <section className="product-page section-wrap">
      <div className="breadcrumbs"><Link to="/shop">{t('Shop')}</Link><span>/</span><span>{product.name}</span></div>
      <div className="product-detail-grid"><div className="product-detail-photo"><img src={product.image} alt={`${t("Men's fashion reference photo for")} ${t(product.name)}`} /></div><div className="product-detail-copy"><p className="eyebrow">{t(product.category)} {t('collection')}</p><h1>{t(product.name)}</h1><p className="detail-subtitle">{t(product.detail)}</p><p className="detail-price">{money.format(product.price)}</p><p className="detail-description">{t('A thoughtfully stitched Pakistani shalwar kameez made for comfort and movement. Stock photos are style references; the exact product color and stitching may differ. Choose ')}{t(selectedColorway.name)}{t(' or another colorway to make it yours.')}</p><div className="detail-color-picker"><span className="detail-size-label">{t('Color:')} <strong>{t(selectedColorway.name)}</strong></span><div className="color-options">{product.colorways.map((colorway) => <button className={selectedColorway.name === colorway.name ? 'color-option selected' : 'color-option'} key={colorway.name} type="button" onClick={() => setSelectedColorway(colorway)} aria-label={`${t(colorway.name)} ${t('color')}`} aria-pressed={selectedColorway.name === colorway.name} title={t(colorway.name)} style={{ '--swatch': colorway.hex } as React.CSSProperties} />)}</div></div><div className="detail-specs"><div><span>{t('Fabric')}</span><strong>{t(product.fabric)}</strong></div><div><span>{t('Stitching')}</span><strong>{t(product.stitching)}</strong></div><div><span>{t('Fit')}</span><strong>{t('Relaxed kameez, easy shalwar')}</strong></div></div><label className="detail-size-label" htmlFor="product-size">{t('Select size')}</label><div className="detail-purchase"><select id="product-size" value={size} onChange={(event) => setSize(event.target.value)}>{sizes.map((value) => <option key={value}>{value}</option>)}</select><button className="button button-dark" type="button" onClick={() => { onAdd(product, selectedColorway, size); setAdded(true); window.setTimeout(() => setAdded(false), 1500) }}>{added ? <><Check size={16} /> {t('Added to bag')}</> : <>{t('Add to bag')} <Plus size={16} /></>}</button></div><p className="made-note">{t('Need a more personal fit?')} <Link to="/fitting">{t('Book a fitting')} <ArrowRight size={13} /></Link></p></div></div>
    </section>
  )
}

function CraftPage() {
  const { t } = useLocale()
  return (
    <section className="story-page">
      <div className="story-hero"><div className="story-hero-copy"><p className="eyebrow">{t('Our approach')}</p><h1>{t('Rooted in tradition.')}<br /><em>{t('Made for now.')}</em></h1><p>{t('Clothes that carry a little of home, wherever the day takes you.')}</p></div><div className="story-hero-image" role="img" aria-label={t('A man in black Pakistani shalwar kameez outdoors')} /></div>
      <div className="craft-story section-wrap"><div><p className="eyebrow">{t('The details matter')}</p><h2>{t('Good fabric.')}<br /><em>{t('Thoughtful stitching.')}</em></h2></div><div><p>{t('Shalwar kameez is a living wardrobe: generous in movement, versatile in how it is worn, and rich with regional character. We take that familiar form seriously.')}</p><p>{t('Each design begins with the way it should feel. Then we choose breathable cloth, shape a comfortable silhouette, and finish the collar, placket, and cuffs with intention.')}</p><Link className="text-link" to="/shop">{t('Browse stitched designs')} <ArrowRight size={15} /></Link></div></div>
      <div className="craft-values"><article><span>01</span><h3>{t('Comfort first')}</h3><p>{t('Room to move, breathable fabrics, and cuts that work with your day.')}</p></article><article><span>02</span><h3>{t('Stitch with purpose')}</h3><p>{t('Clean plackets, considered collars, and small details that feel personal.')}</p></article><article><span>03</span><h3>{t('Wear it often')}</h3><p>{t('Versatile pieces for everyday visits, Friday prayers, Eid, and family gatherings.')}</p></article></div>
    </section>
  )
}

function FittingPage() {
  const { t } = useLocale()
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function submitRequest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    setSubmitting(true)
    setSubmitted(false)
    setError('')

    try {
      const formData = new FormData(form)
      if (supabase) {
        const { error: insertError } = await supabase.from('fitting_requests').insert({
          name: String(formData.get('name')),
          email: String(formData.get('email')),
          phone: String(formData.get('phone')),
          occasion: String(formData.get('occasion')),
          notes: String(formData.get('notes') ?? ''),
        })
        if (insertError) {
          setError(insertError.message)
          return
        }
      } else {
        const requests = readLocalRequests()
        requests.unshift({
          id: crypto.randomUUID(),
          name: String(formData.get('name')),
          email: String(formData.get('email')),
          phone: String(formData.get('phone')),
          occasion: String(formData.get('occasion')),
          notes: String(formData.get('notes') ?? ''),
          status: 'new',
          created_at: new Date().toISOString(),
        })
        writeLocalRequests(requests)
      }
      setSubmitted(true)
      form.reset()
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Could not send your fitting request.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="fitting-page section-wrap">
      <div className="fitting-intro">
        <p className="eyebrow">{t('A fit that feels like yours')}</p>
        <h1>{t("Let's get the")}<br /><em>{t('details right.')}</em></h1>
        <p>{t("Tell us a little about what you need. We'll be in touch to arrange a fitting and talk through fabric, cut, and finishing.")}</p>
        <div className="fitting-note"><span>01</span><p>{t('Personal measurements')}</p><span>02</span><p>{t('Fabric and stitch choices')}</p><span>03</span><p>{t('A kameez made for you')}</p></div>
      </div>
      <form className="fitting-form" onSubmit={submitRequest}>
        <p className="eyebrow">{t('Request an appointment')}</p>
        <div className="form-row">
          <label>{t('Your name')}<input autoComplete="name" name="name" required placeholder={t('Full name')} /></label>
          <label>{t('Email address')}<input autoComplete="email" name="email" type="email" required placeholder="you@example.com" /></label>
        </div>
        <div className="form-row">
          <label>{t('Phone number')}<input autoComplete="tel" name="phone" type="tel" required placeholder="+92" /></label>
          <label>{t('Occasion')}<select name="occasion" defaultValue=""><option value="" disabled>{t('Select one')}</option><option>{t('Everyday wear')}</option><option>{t('Wedding')}</option><option>{t('Eid or celebration')}</option><option>{t('Other')}</option></select></label>
        </div>
        <label>{t('What are you looking for?')}<textarea name="notes" rows={4} placeholder={t('Preferred fabric, color, or stitching details')} /></label>
        <button className="button button-dark" type="submit" disabled={submitting}>
          {submitted ? <><Check size={16} /> {t('Request received')}</> : submitting ? <>{t('Sending request…')}</> : <>{t('Request a fitting')} <ArrowRight size={16} /></>}
        </button>
        {submitted && <p className="form-success" role="status">{t(supabase ? 'Thank you. Your fitting request has been sent.' : 'Thank you. Your fitting request is noted in this demo.')}</p>}
        {error && <p className="form-error" role="alert">{t(error)}</p>}
        <p className="form-disclaimer">{t(supabase ? 'Your request will be reviewed by our team.' : 'Demo mode: this request is saved only in this browser and is not sent to our team.')}</p>
      </form>
    </section>
  )
}

function NotFoundPage() {
  const { t } = useLocale()
  return <section className="not-found section-wrap"><p className="eyebrow">{t('Nothing here')}</p><h1>{t("Let's find your")}<br /><em>{t('next favorite.')}</em></h1><Link className="button button-dark" to="/shop">{t('Browse the collection')} <ArrowRight size={16} /></Link></section>
}

function App() {
  const { t } = useLocale()
  const location = useLocation()
  const navigate = useNavigate()
  const [catalog, setCatalog] = useState<Product[]>(products)
  const [catalogLoadError, setCatalogLoadError] = useState('')
  const [initialCart] = useState(readStoredCart)
  const [cart, setCart] = useState<CartLine[]>(initialCart.cart)
  const [cartStorageError, setCartStorageError] = useState(initialCart.error)
  const [cartOpen, setCartOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const itemCount = cart.reduce((total, line) => total + line.quantity, 0)
  const subtotal = cart.reduce((total, line) => total + line.product.price * line.quantity, 0)

  function saveCart(nextCart: CartLine[]) {
    setCart(nextCart)
    try {
      window.localStorage.setItem(cartStorageKey, JSON.stringify(nextCart))
      setCartStorageError('')
    } catch {
      setCartStorageError('Your bag could not be saved. Check your browser storage settings.')
    }
  }

  useEffect(() => {
    if (!supabase) {
      let mounted = true
      async function loadSqlCatalog() {
        try {
          const response = await fetch('/api/products')
          const result = await readApiResponse<{ products?: Product[]; error?: string }>(response)
          if (!response.ok) throw new Error(result.error ?? 'Could not load catalog products.')
          if (mounted) {
            if (result.products?.length) setCatalog(result.products)
            setCatalogLoadError('')
          }
        } catch (loadError) {
          if (mounted) setCatalogLoadError(loadError instanceof Error ? loadError.message : 'Could not load the latest collection.')
        }
      }
      void loadSqlCatalog()
      const interval = window.setInterval(() => { void loadSqlCatalog() }, 30_000)
      return () => {
        mounted = false
        window.clearInterval(interval)
      }
    }
    const client = supabase
    let mounted = true
    async function loadCatalog() {
      try {
        const { data, error } = await client.from('products').select('*').eq('active', true).order('name')
        if (!mounted) return
        if (error) {
          setCatalogLoadError(error.message)
          return
        }
        setCatalog(data)
      } catch (loadError) {
        if (mounted) setCatalogLoadError(loadError instanceof Error ? loadError.message : 'Could not load the latest collection.')
      }
    }
    void loadCatalog()
    const channel = client.channel('mian-storefront-products')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => { void loadCatalog() })
      .subscribe()
    return () => {
      mounted = false
      void client.removeChannel(channel)
    }
  }, [])

  function addToCart(product: Product, colorway: Colorway, size: string) {
    const existingLine = cart.find((line) => line.product.id === product.id && line.colorway.name === colorway.name && line.size === size)
    if (existingLine && existingLine.quantity >= 10) return
    if (existingLine) {
      saveCart(cart.map((line) => line === existingLine ? { ...line, quantity: line.quantity + 1 } : line))
      return
    }
    saveCart([...cart, { product, colorway, size, quantity: 1 }])
  }

  function updateQuantity(productId: string, colorName: string, size: string, amount: number) {
    saveCart(cart.map((line) => line.product.id === productId && line.colorway.name === colorName && line.size === size
      ? { ...line, quantity: Math.min(10, line.quantity + amount) }
      : line).filter((line) => line.quantity > 0))
  }

  function clearCart() {
    saveCart([])
  }

  if (location.pathname.startsWith('/admin')) return <AdminPage starterProducts={products} />

  return (
    <div className="storefront">
      <header className="site-header"><Link className="wordmark" to="/" aria-label={t('Mian Tailor And Design home')}><span className="wordmark-mark" aria-hidden="true"><span>M</span><i /></span><span className="wordmark-name">MIAN <i>TAILOR AND DESIGN</i></span></Link><button className="mobile-menu-toggle" type="button" onClick={() => setMenuOpen((open) => !open)} aria-label={t(menuOpen ? 'Close navigation' : 'Open navigation')}>{menuOpen ? <X size={20} /> : <Menu size={20} />}</button><nav className={menuOpen ? 'main-nav is-open' : 'main-nav'} aria-label={t('Main navigation')}><NavLink to="/" end onClick={() => setMenuOpen(false)}>{t('Home')}</NavLink><NavLink to="/shop" onClick={() => setMenuOpen(false)}>{t('Shop')}</NavLink><NavLink to="/craft" onClick={() => setMenuOpen(false)}>{t('Our craft')}</NavLink><NavLink to="/fitting" onClick={() => setMenuOpen(false)}>{t('Book a fitting')}</NavLink></nav><div className="header-actions"><LanguageSwitcher /><Link className="account-link" to="/account" aria-label={t('Sign in or register')}><UserRound size={17} strokeWidth={1.6} /><span>{t('Account')}</span></Link><button className="bag-button" type="button" onClick={() => setCartOpen(true)} aria-label={`${t('Open shopping bag, ')}${itemCount}${t(' items')}`}><ShoppingBag size={18} strokeWidth={1.6} /><span>{t('Bag')}</span><span className="bag-count">{itemCount}</span></button></div></header>
      <main>{catalogLoadError && <p className="catalog-error" role="alert">{t('Could not load the latest collection: ')}{catalogLoadError}</p>}{cartStorageError && <p className="catalog-error" role="alert">{t(cartStorageError)}</p>}<Routes><Route path="/" element={<HomePage catalog={catalog} onAdd={addToCart} />} /><Route path="/shop" element={<ShopPage catalog={catalog} onAdd={addToCart} />} /><Route path="/shop/:productId" element={<ProductPage catalog={catalog} onAdd={addToCart} />} /><Route path="/craft" element={<CraftPage />} /><Route path="/fitting" element={<FittingPage />} /><Route path="/account" element={<AccountPage />} /><Route path="/checkout" element={<CheckoutPage cart={cart} subtotal={subtotal} onOrderPlaced={clearCart} />} /><Route path="/payment/:orderId" element={<PaymentPage />} /><Route path="*" element={<NotFoundPage />} /></Routes></main>
      <footer className="site-footer"><Link className="footer-brand" to="/">MIAN TAILOR AND DESIGN</Link><span>{t('Pakistani craft. Made to wear.')}</span><span>© 2026 Mian Tailor And Design</span></footer>
      {cartOpen && <div className="cart-layer"><button className="cart-backdrop" type="button" onClick={() => setCartOpen(false)} aria-label={t('Close shopping bag')} /><aside className="cart-drawer" role="dialog" aria-modal="true" aria-labelledby="cart-title"><div className="cart-header"><div><p className="eyebrow">{t('Your selection')}</p><h2 id="cart-title">{t('The bag')} <span>({itemCount})</span></h2></div><button className="icon-button" type="button" onClick={() => setCartOpen(false)} aria-label={t('Close bag')}><X size={21} /></button></div>{cart.length === 0 ? <div className="empty-cart"><ShoppingBag size={28} strokeWidth={1.3} /><p>{t('Your next favorite is waiting.')}</p><Link className="text-link" to="/shop" onClick={() => setCartOpen(false)}>{t('Explore the collection')} <ArrowRight size={15} /></Link></div> : <><div className="cart-items">{cart.map((line) => <div className="cart-line" key={`${line.product.id}-${line.colorway.name}-${line.size}`}><img src={line.product.image} alt="" /><div className="cart-line-info"><h3>{t(line.product.name)}</h3><p>{t(line.colorway.name)} · {t('Size ')}{line.size}</p><div className="quantity-control"><button type="button" onClick={() => updateQuantity(line.product.id, line.colorway.name, line.size, -1)} aria-label={`${t('Remove one ')}${t(line.product.name)}`}><Minus size={13} /></button><span>{line.quantity}</span><button type="button" onClick={() => updateQuantity(line.product.id, line.colorway.name, line.size, 1)} aria-label={`${t('Add one ')}${t(line.product.name)}`}><Plus size={13} /></button></div></div><span className="cart-line-price">{money.format(line.product.price * line.quantity)}</span></div>)}</div><div className="cart-summary"><p><span>{t('Subtotal')}</span><strong>{money.format(subtotal)}</strong></p><span className="shipping-note">{t('Delivery charges are confirmed by customer service.')}</span><button className="checkout-button" type="button" onClick={() => { setCartOpen(false); navigate('/checkout') }}>{t('Continue to checkout')} <ArrowRight size={16} /></button><button className="continue-shopping" type="button" onClick={() => setCartOpen(false)}>{t('Continue shopping')}</button></div></>}</aside></div>}
      <SupportWidget />
    </div>
  )
}

export default App