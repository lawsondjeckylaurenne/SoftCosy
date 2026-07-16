'use client'

import { useState, useMemo, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Trash2, Plus, Minus, DollarSign, Loader2, Search, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'

interface Variant {
  id: number
  sku: string
  size?: string
  model?: string
  selling_price: number
  is_active: boolean
  stock: number
}

interface RawProduct {
  id: number
  name: string
  category?: { id: number; name: string }
  product_images?: { image_url: string; order: number }[]
  variants: Variant[]
}

interface CartItem {
  cart_id: string
  product_id: number
  variant_id: number
  name: string
  category: string
  price: number
  quantity: number
  image: string
  stock: number
}

const PRODUCTS_PER_PAGE = 12

export default function CashierPage() {
  const queryClient = useQueryClient()

  // ── États panier & paiement ───────────────────
  const [cart, setCart] = useState<CartItem[]>([])
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [amountPaid, setAmountPaid] = useState('')
  const [discountAmount, setDiscountAmount] = useState('0')
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('') // obligatoire : sert à retrouver le client
  const [customerAddress, setCustomerAddress] = useState('') // optionnel

  // ── États recherche & pagination produits ─────
  const [searchTerm, setSearchTerm] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [productPage, setProductPage] = useState(1)
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | 'all'>('all')

  // ── État sélecteur de variante ─────────────────
  const [variantPickerProduct, setVariantPickerProduct] = useState<RawProduct | null>(null)

  // Debounce 350 ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm)
      setProductPage(1)
    }, 350)
    return () => clearTimeout(timer)
  }, [searchTerm])

  const handleCategoryChange = (id: number | 'all') => {
    setSelectedCategoryId(id)
    setProductPage(1)
  }

  // ── Catégories ────────────────────────────────
  const { data: categoriesData = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const res = await api.get('/categories/')
      return res.data.results || res.data
    }
  })

  // ── Produits (paginés + filtrés côté serveur) ─
  const { data: rawProductsData, isLoading } = useQuery({
    queryKey: ['cashier-products', productPage, debouncedSearch, selectedCategoryId],
    queryFn: async () => {
      const params = new URLSearchParams()
      params.append('page', String(productPage))
      params.append('page_size', String(PRODUCTS_PER_PAGE))
      if (debouncedSearch) params.append('search', debouncedSearch)
      if (selectedCategoryId !== 'all') params.append('category_id', String(selectedCategoryId))
      const res = await api.get(`/products/?${params}`)
      return res.data
    },
    placeholderData: (prev) => prev,
  })

  const hasNextPage = !!rawProductsData?.next
  const hasPrevPage = !!rawProductsData?.previous
  const totalProducts = rawProductsData?.count || 0
  const totalPages = Math.ceil(totalProducts / PRODUCTS_PER_PAGE)

  const rawProducts: RawProduct[] = useMemo(() => {
    const data = rawProductsData?.results || rawProductsData
    const all: RawProduct[] = Array.isArray(data) ? data : []
    // Exclure les produits dont aucune variante active n'a de prix défini
    return all.filter(p =>
      p.variants.some(v => v.is_active !== false && (v.selling_price ?? 0) > 0)
    )
  }, [rawProductsData])

  // ── Helpers produit ───────────────────────────
  const getActiveVariants = (p: RawProduct) => p.variants.filter(v => v.is_active !== false)

  const getProductMinPrice = (p: RawProduct): number => {
    const active = getActiveVariants(p)
    if (active.length === 0) return 0
    return Math.min(...active.map(v => v.selling_price || 0))
  }

  const getProductTotalStock = (p: RawProduct): number =>
    getActiveVariants(p).reduce((s, v) => s + (v.stock || 0), 0)

  // ── Click sur un produit ──────────────────────
  const handleProductClick = (p: RawProduct) => {
    const active = getActiveVariants(p)
    if (active.length > 1) {
      setVariantPickerProduct(p)
    } else if (active.length === 1) {
      addVariantToCart(p, active[0])
    }
  }

  const addVariantToCart = (p: RawProduct, v: Variant) => {
    if (v.stock <= 0) return
    const cartId = `p${p.id}-v${v.id}`
    const active = getActiveVariants(p)
    const label = active.length > 1
      ? `${p.name} ${v.size || ''} ${v.model || ''}`.trim()
      : p.name

    setCart(prev => {
      const existing = prev.find(i => i.cart_id === cartId)
      if (existing) {
        if (existing.quantity >= v.stock) return prev
        return prev.map(i => i.cart_id === cartId ? { ...i, quantity: i.quantity + 1 } : i)
      }
      return [...prev, {
        cart_id: cartId,
        product_id: p.id,
        variant_id: v.id,
        name: label,
        category: p.category?.name || 'Non classé',
        price: v.selling_price || 0,
        quantity: 1,
        image: p.product_images?.[0]?.image_url || '/placeholder.svg',
        stock: v.stock,
      }]
    })
    setVariantPickerProduct(null)
  }

  const updateQuantity = (cart_id: string, delta: number, maxStock: number) => {
    setCart(prev =>
      prev
        .map(item => {
          if (item.cart_id !== cart_id) return item
          const newQ = Math.max(0, Math.min(maxStock, item.quantity + delta))
          return { ...item, quantity: newQ }
        })
        .filter(item => item.quantity > 0)
    )
  }

  const removeFromCart = (cart_id: string) => {
    setCart(prev => prev.filter(item => item.cart_id !== cart_id))
  }

  // ── Calculs panier ────────────────────────────
  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0)

  // ── Mutation vente ────────────────────────────
  const makeSaleMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await api.post('/sales/', payload)
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cashier-products'] })
      queryClient.invalidateQueries({ queryKey: ['sales'] })
      alert('Vente enregistrée avec succès!')
      setCart([])
      setAmountPaid('')
      setDiscountAmount('0')
      setCustomerName('')
      setCustomerPhone('')
      setCustomerAddress('')
      setShowPaymentModal(false)
    },
    onError: (err: any) => {
      console.error(err)
      alert('Erreur lors de la vente. Vérifiez la console.')
    }
  })

  const handlePayment = () => {
    const paid = parseFloat(amountPaid) || 0
    const discount = parseFloat(discountAmount) || 0
    const expected = total - discount

    // Le téléphone est obligatoire : c'est lui qui permet de retrouver le client
    if (!customerPhone.trim()) {
      alert('Le numéro de téléphone du client est obligatoire.')
      return
    }

    if (paid === expected && cart.length > 0) {
      makeSaleMutation.mutate({
        channel: 'store',
        status: 'PAYE',
        customer_name: customerName.trim() || 'Client',
        customer_phone: customerPhone.trim(),
        customer_address: customerAddress.trim(),
        discount_amount: discount,
        lines: cart.map(item => ({
          product: item.product_id,
          variant: item.variant_id,
          quantity: item.quantity,
          unit_price: item.price,
          line_discount: 0
        }))
      })
    } else if (paid !== expected) {
      alert(`Erreur : Le montant payé (${paid} FCFA) + remise (${discount} FCFA) doit être égal au total (${total} FCFA).`)
    }
  }

  return (
    <div className="flex flex-col h-full text-foreground">
      <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8 pb-20 lg:pb-24">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* ── Gauche : catalogue produits ── */}
          <div className="lg:col-span-2 space-y-4">
            <div>
              <h1 className="text-3xl font-bold text-foreground">Caisse</h1>
              <p className="text-muted-foreground mt-1">Effectuez une vente</p>
            </div>

            {/* Barre de recherche */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher par nom ou SKU..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 h-11 rounded-xl border-border/60 focus:ring-primary/20"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs font-bold"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Filtre catégories */}
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
              <button
                onClick={() => handleCategoryChange('all')}
                className={`px-4 py-2 rounded-full font-medium whitespace-nowrap transition-colors text-sm ${
                  selectedCategoryId === 'all'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-foreground hover:bg-muted/80'
                }`}
              >
                Tous
              </button>
              {Array.isArray(categoriesData) && categoriesData.map((cat: any) => (
                <button
                  key={cat.id}
                  onClick={() => handleCategoryChange(cat.id)}
                  className={`px-4 py-2 rounded-full font-medium whitespace-nowrap transition-colors text-sm ${
                    selectedCategoryId === cat.id
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-foreground hover:bg-muted/80'
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>

            {/* Grille produits — 1 carte par produit */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 min-h-[200px]">
              {isLoading ? (
                <div className="col-span-full py-12 flex justify-center text-primary">
                  <Loader2 className="w-8 h-8 animate-spin" />
                </div>
              ) : rawProducts.length === 0 ? (
                <div className="col-span-full py-12 text-center text-muted-foreground">
                  {debouncedSearch
                    ? `Aucun résultat pour "${debouncedSearch}"`
                    : 'Aucun produit disponible à la vente'}
                </div>
              ) : (
                rawProducts.map(product => {
                  const stock = getProductTotalStock(product)
                  const price = getProductMinPrice(product)
                  const activeVariants = getActiveVariants(product)
                  const hasMultiple = activeVariants.length > 1
                  return (
                    <Card
                      key={product.id}
                      className={`overflow-hidden transition-all cursor-pointer ${
                        stock <= 0 ? 'opacity-50 grayscale cursor-not-allowed' : 'hover:shadow-lg'
                      }`}
                      onClick={() => stock > 0 && handleProductClick(product)}
                    >
                      <div className="aspect-square bg-muted overflow-hidden relative">
                        <img
                          src={product.product_images?.[0]?.image_url || '/placeholder.svg'}
                          alt={product.name}
                          className={`w-full h-full object-cover transition-transform ${stock > 0 ? 'hover:scale-110' : ''}`}
                        />
                        {stock <= 0 && (
                          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                            <span className="bg-destructive text-white px-2 py-1 rounded text-xs font-bold">Rupture</span>
                          </div>
                        )}
                        {stock > 0 && stock <= 5 && (
                          <div className="absolute top-2 right-2">
                            <span className="bg-orange-500 text-white px-2 py-1 rounded-full text-xs font-bold">{stock}</span>
                          </div>
                        )}
                        {hasMultiple && stock > 0 && (
                          <div className="absolute bottom-2 left-2">
                            <span className="bg-black/60 text-white px-2 py-1 rounded-full text-xs font-medium">
                              {activeVariants.length} variantes
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="p-3 space-y-2">
                        <div>
                          <p className="text-xs text-muted-foreground line-clamp-1">{product.category?.name || 'Non classé'}</p>
                          <h3 className="font-semibold text-sm line-clamp-2 leading-tight h-10">{product.name}</h3>
                        </div>
                        <div className="flex justify-between items-center pt-1 border-t border-border/50">
                          <p className="text-lg font-bold text-primary">
                            {hasMultiple ? 'Dès ' : ''}{price.toLocaleString()} FCFA
                          </p>
                          <Button size="icon" variant="outline" className="w-8 h-8 shrink-0" disabled={stock <= 0}>
                            <Plus className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </Card>
                  )
                })
              )}
            </div>

            {/* Pagination */}
            {rawProductsData && (
              <div className="flex items-center justify-between pt-2 border-t border-border/40">
                <p className="text-xs text-muted-foreground">
                  Page <span className="font-bold text-foreground">{productPage}</span> sur{' '}
                  <span className="font-bold text-foreground">{totalPages || 1}</span>
                  {' '}— <span className="font-bold text-foreground">{totalProducts}</span> produit(s)
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setProductPage(p => Math.max(1, p - 1))}
                    disabled={!hasPrevPage || isLoading}
                    className="h-9 px-3 rounded-lg gap-1 text-xs font-bold"
                  >
                    <ChevronLeft className="w-3 h-3" />
                    Précédent
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setProductPage(p => p + 1)}
                    disabled={!hasNextPage || isLoading}
                    className="h-9 px-3 rounded-lg gap-1 text-xs font-bold"
                  >
                    Suivant
                    <ChevronRight className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* ── Droite : panier ── */}
          <div className="space-y-4">
            <Card className="p-5 space-y-4 shadow-sm border border-border sticky top-0">
              <h2 className="text-xl font-bold flex items-center gap-2">
                Panier
                {cart.length > 0 && (
                  <span className="bg-primary text-primary-foreground text-xs px-2 py-1 rounded-full">
                    {cart.reduce((s, i) => s + i.quantity, 0)} items
                  </span>
                )}
              </h2>

              {cart.length === 0 ? (
                <div className="py-8 text-center bg-muted/30 rounded-lg border border-dashed border-border">
                  <p className="text-muted-foreground">Le panier est vide</p>
                </div>
              ) : (
                <>
                  <div className="space-y-3 max-h-[40vh] overflow-y-auto pr-2">
                    {cart.map(item => (
                      <div key={item.cart_id} className="space-y-2 pb-3 border-b border-border last:border-0 hover:bg-muted/30 p-2 -mx-2 rounded-lg transition-colors">
                        <div className="flex justify-between items-start">
                          <div className="flex-1 pr-2">
                            <p className="font-medium text-sm leading-tight">{item.name}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{item.price.toLocaleString()} FCFA</p>
                          </div>
                          <button
                            onClick={() => removeFromCart(item.cart_id)}
                            className="p-1.5 hover:bg-destructive/10 text-muted-foreground hover:text-destructive rounded transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1 bg-muted/60 border border-border rounded-lg p-0.5">
                            <button
                              onClick={() => updateQuantity(item.cart_id, -1, item.stock)}
                              className="p-1 hover:bg-background rounded shadow-sm transition-colors text-muted-foreground"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="w-8 text-center font-medium text-sm">{item.quantity}</span>
                            <button
                              onClick={() => updateQuantity(item.cart_id, 1, item.stock)}
                              disabled={item.quantity >= item.stock}
                              className="p-1 hover:bg-background rounded shadow-sm transition-colors disabled:opacity-30 disabled:hover:bg-transparent text-primary"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                          <p className="font-bold">{(item.price * item.quantity).toLocaleString()} FCFA</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex justify-between text-xl font-bold pt-3 pb-1 border-t border-border mt-1">
                    <span>Total</span>
                    <span className="text-primary">{total.toLocaleString()} FCFA</span>
                  </div>

                  <Button
                    onClick={() => setShowPaymentModal(true)}
                    className="w-full bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white h-12 rounded-lg font-bold text-lg shadow-md"
                  >
                    <DollarSign className="w-5 h-5 mr-2" />
                    Paiement
                  </Button>
                </>
              )}
            </Card>
          </div>
        </div>
      </main>

      {/* ── Modal sélection de variante ── */}
      {variantPickerProduct && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-sm shadow-2xl border-0">
            <div className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold">{variantPickerProduct.name}</h3>
                  <p className="text-xs text-muted-foreground">Choisir une variante</p>
                </div>
                <button
                  onClick={() => setVariantPickerProduct(null)}
                  className="p-2 hover:bg-muted rounded-lg transition-colors text-muted-foreground"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {getActiveVariants(variantPickerProduct).map(v => {
                  const label = `${v.size || ''} ${v.model || ''}`.trim() || `Variante #${v.id}`
                  const outOfStock = v.stock <= 0
                  return (
                    <button
                      key={v.id}
                      onClick={() => !outOfStock && addVariantToCart(variantPickerProduct, v)}
                      disabled={outOfStock}
                      className={`w-full flex items-center justify-between p-3 rounded-xl border transition-colors text-left ${
                        outOfStock
                          ? 'opacity-50 cursor-not-allowed border-border bg-muted/30'
                          : 'border-border hover:border-primary hover:bg-primary/5 cursor-pointer'
                      }`}
                    >
                      <div>
                        <p className="font-semibold text-sm">{label}</p>
                        {v.sku && <p className="text-xs text-muted-foreground font-mono">{v.sku}</p>}
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-primary">{(v.selling_price || 0).toLocaleString()} FCFA</p>
                        <p className={`text-xs ${outOfStock ? 'text-destructive' : 'text-muted-foreground'}`}>
                          {outOfStock ? 'Rupture' : `Stock : ${v.stock}`}
                        </p>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* ── Modal de paiement ── */}
      {showPaymentModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-md shadow-2xl border-0 max-h-[90vh] overflow-y-auto">
            <div className="p-6 space-y-6">
              <div className="text-center">
                <h3 className="text-2xl font-black text-foreground">Édition du Paiement</h3>
                <p className="text-muted-foreground mt-1">Terminer la transaction</p>
              </div>

              <div className="bg-primary/5 border border-primary/20 p-5 rounded-xl text-center">
                <p className="text-sm font-medium text-primary uppercase tracking-widest mb-1">Total Demandé</p>
                <p className="text-5xl font-black text-primary">{total.toLocaleString()} FCFA</p>
              </div>

              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Remise (FCFA)</label>
                    <Input
                      type="number"
                      placeholder="0"
                      value={discountAmount}
                      onChange={(e) => setDiscountAmount(e.target.value)}
                      className="h-12 bg-muted/30 border-2 font-bold focus-visible:ring-primary"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Net à Payer</label>
                    <div className="h-12 flex items-center justify-center bg-primary/10 rounded-md border-2 border-primary/20 text-primary font-black">
                      {(total - (parseFloat(discountAmount) || 0)).toLocaleString()} FCFA
                    </div>
                  </div>
                </div>

                <label className="text-sm font-semibold tracking-wide text-muted-foreground uppercase block pt-2">Montant reçu</label>
                <Input
                  type="number"
                  placeholder="0"
                  value={amountPaid}
                  onChange={(e) => setAmountPaid(e.target.value)}
                  className={`text-2xl h-14 text-center font-bold bg-muted/50 border-2 focus-visible:ring-primary ${
                    amountPaid && parseFloat(amountPaid) === (total - (parseFloat(discountAmount) || 0))
                      ? 'border-emerald-500 bg-emerald-50/50'
                      : amountPaid ? 'border-red-500' : ''
                  }`}
                  autoFocus
                />

                <label className="text-sm font-semibold tracking-wide text-muted-foreground uppercase pt-4 block">Nom du client (optionnel)</label>
                <Input
                  type="text"
                  placeholder="Ex: M. Jean"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="h-12 bg-muted/30 border-2 focus-visible:ring-primary"
                />

                <label className="text-sm font-semibold tracking-wide text-muted-foreground uppercase pt-4 block">Téléphone du client</label>
                <Input
                  type="tel"
                  placeholder="Ex: 07 00 00 00 00"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  className={`h-12 bg-muted/30 border-2 focus-visible:ring-primary ${
                    !customerPhone.trim() ? 'border-red-300' : ''
                  }`}
                />

                <label className="text-sm font-semibold tracking-wide text-muted-foreground uppercase pt-4 block">Adresse du client (optionnel)</label>
                <Input
                  type="text"
                  placeholder="Ex: Quartier, ville"
                  value={customerAddress}
                  onChange={(e) => setCustomerAddress(e.target.value)}
                  className="h-12 bg-muted/30 border-2 focus-visible:ring-primary"
                />
              </div>

              <div className="grid grid-cols-4 gap-2 pt-2">
                <Button variant="outline" className="h-12 font-bold" onClick={() => setAmountPaid(total.toFixed(0))}>Exact</Button>
                <Button variant="outline" className="h-12 font-bold text-muted-foreground" onClick={() => setAmountPaid((total + 5000).toFixed(0))}>+5 000</Button>
                <Button variant="outline" className="h-12 font-bold text-muted-foreground" onClick={() => setAmountPaid((total + 10000).toFixed(0))}>+10 000</Button>
                <Button variant="outline" className="h-12 font-bold text-muted-foreground" onClick={() => setAmountPaid((total + 20000).toFixed(0))}>+20 000</Button>
              </div>

              <div className="flex gap-3 pt-4 border-t border-border mt-6">
                <Button
                  variant="outline"
                  onClick={() => { setShowPaymentModal(false); setAmountPaid('') }}
                  className="flex-1 h-12"
                  disabled={makeSaleMutation.isPending}
                >
                  Retour
                </Button>
                <Button
                  onClick={handlePayment}
                  disabled={!amountPaid || !customerPhone.trim() || parseFloat(amountPaid) !== (total - (parseFloat(discountAmount) || 0)) || makeSaleMutation.isPending}
                  className="flex-1 h-12 bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                >
                  {makeSaleMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Valider'}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
