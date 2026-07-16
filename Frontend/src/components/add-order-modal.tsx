'use client'

import React, { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { X, Search, Plus, Minus, Trash2, Loader2, Save } from 'lucide-react'
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
  variants: Variant[]
}

interface OrderLineDraft {
  product_id: number
  variant_id: number
  label: string
  unit_price: number
  quantity: number
  maxStock: number
}

interface AddOrderModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}

export default function AddOrderModal({ isOpen, onClose, onSuccess }: AddOrderModalProps) {
  const queryClient = useQueryClient()

  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [deliveryAddress, setDeliveryAddress] = useState('')
  const [paymentMode, setPaymentMode] = useState('CASH_LIVRAISON')
  const [notes, setNotes] = useState('')
  const [productSearch, setProductSearch] = useState('')
  const [lines, setLines] = useState<OrderLineDraft[]>([])

  // ── Recherche produit (pour ajouter des articles à la commande) ──
  const { data: productsData, isLoading: productsLoading } = useQuery({
    queryKey: ['order-products-search', productSearch],
    queryFn: async () => {
      const params = new URLSearchParams()
      params.append('page_size', '20')
      if (productSearch) params.append('search', productSearch)
      const res = await api.get(`/products/?${params}`)
      return res.data
    },
    enabled: isOpen,
  })
  const products: RawProduct[] = useMemo(() => {
    const data = productsData?.results || productsData
    return Array.isArray(data) ? data : []
  }, [productsData])

  const total = useMemo(() => lines.reduce((s, l) => s + l.unit_price * l.quantity, 0), [lines])

  const addLine = (product: RawProduct, variant: Variant) => {
    if (variant.stock <= 0) return
    setLines(prev => {
      const existing = prev.find(l => l.variant_id === variant.id)
      if (existing) {
        if (existing.quantity >= variant.stock) return prev
        return prev.map(l => l.variant_id === variant.id ? { ...l, quantity: l.quantity + 1 } : l)
      }
      const activeVariants = product.variants.filter(v => v.is_active !== false)
      const label = activeVariants.length > 1
        ? `${product.name} ${[variant.size, variant.model].filter(Boolean).join(' / ')}`.trim()
        : product.name
      return [...prev, {
        product_id: product.id,
        variant_id: variant.id,
        label,
        unit_price: variant.selling_price || 0,
        quantity: 1,
        maxStock: variant.stock,
      }]
    })
  }

  const updateQty = (variant_id: number, delta: number) => {
    setLines(prev => prev
      .map(l => l.variant_id === variant_id ? { ...l, quantity: Math.max(0, Math.min(l.maxStock, l.quantity + delta)) } : l)
      .filter(l => l.quantity > 0)
    )
  }

  const removeLine = (variant_id: number) => {
    setLines(prev => prev.filter(l => l.variant_id !== variant_id))
  }

  const resetForm = () => {
    setCustomerName('')
    setCustomerPhone('')
    setDeliveryAddress('')
    setPaymentMode('CASH_LIVRAISON')
    setNotes('')
    setProductSearch('')
    setLines([])
  }

  const handleClose = () => {
    onClose()
    resetForm()
  }

  const mutation = useMutation({
    mutationFn: (payload: any) => api.post('/orders/', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      resetForm()
      onClose()
      if (onSuccess) onSuccess()
    },
    onError: (err: any) => {
      const data = err?.response?.data
      const msg = data?.customer_phone?.[0] || data?.lines?.[0] || data?.detail || "Erreur lors de la création de la commande."
      alert(msg)
    }
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!customerPhone.trim()) {
      alert('Le numéro de téléphone du client est obligatoire.')
      return
    }
    if (lines.length === 0) {
      alert('Ajoutez au moins un article à la commande.')
      return
    }
    mutation.mutate({
      customer_name: customerName.trim() || 'Client',
      customer_phone: customerPhone.trim(),
      delivery_address: deliveryAddress.trim(),
      payment_mode: paymentMode,
      notes,
      lines: lines.map(l => ({
        product: l.product_id,
        variant: l.variant_id,
        quantity: l.quantity,
        unit_price: l.unit_price,
      }))
    })
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl bg-card shadow-2xl border-border flex flex-col max-h-[95vh] overflow-hidden">
        <div className="p-6 border-b border-border flex items-center justify-between bg-muted/20">
          <div>
            <h2 className="text-xl font-bold text-foreground">Nouvelle Commande</h2>
            <p className="text-xs text-muted-foreground">Saisie manuelle (commande téléphonique, retrait ou livraison)</p>
          </div>
          <button onClick={handleClose} className="text-muted-foreground hover:text-primary transition-colors p-2 rounded-full hover:bg-muted">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className="p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-muted-foreground uppercase">Nom du client</label>
                <Input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Ex: M. Jean" className="h-11 rounded-xl" />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-muted-foreground uppercase">Téléphone *</label>
                <Input required type="tel" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} placeholder="+228 90 00 00 00" className="h-11 rounded-xl" />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-muted-foreground uppercase">Adresse de livraison</label>
                <Input value={deliveryAddress} onChange={e => setDeliveryAddress(e.target.value)} placeholder="Quartier, ville" className="h-11 rounded-xl" />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-muted-foreground uppercase">Mode de paiement</label>
                <select
                  value={paymentMode}
                  onChange={e => setPaymentMode(e.target.value)}
                  className="w-full h-11 px-3 rounded-xl border border-input bg-background text-sm focus:ring-2 focus:ring-primary outline-none transition-all"
                >
                  <option value="CASH_LIVRAISON">Paiement à la livraison</option>
                  <option value="MOBILE_MONEY">Mobile Money</option>
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground uppercase">Articles</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  value={productSearch}
                  onChange={e => setProductSearch(e.target.value)}
                  placeholder="Rechercher un produit..."
                  className="h-11 pl-9 rounded-xl"
                />
              </div>
              <div className="max-h-40 overflow-y-auto rounded-xl border border-input divide-y divide-border">
                {productsLoading ? (
                  <div className="p-3 text-sm text-muted-foreground">Chargement...</div>
                ) : products.length === 0 ? (
                  <div className="p-3 text-sm text-muted-foreground">Aucun résultat.</div>
                ) : (
                  products.flatMap(p =>
                    p.variants.filter(v => v.is_active !== false).map(v => (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => addLine(p, v)}
                        disabled={v.stock <= 0}
                        className="w-full flex items-center justify-between gap-2 p-3 text-left text-sm hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <span className="truncate">
                          <span className="font-semibold">{p.name}</span>
                          {(v.size || v.model) && (
                            <span className="text-muted-foreground"> — {[v.size, v.model].filter(Boolean).join(' / ')}</span>
                          )}
                        </span>
                        <span className="text-xs font-bold text-muted-foreground shrink-0">
                          {(v.selling_price || 0).toLocaleString()} FCFA · Stock : {v.stock}
                        </span>
                      </button>
                    ))
                  )
                )}
              </div>
            </div>

            {lines.length > 0 && (
              <div className="space-y-2">
                <label className="text-xs font-bold text-muted-foreground uppercase">Panier de la commande</label>
                <div className="rounded-xl border border-border divide-y divide-border">
                  {lines.map(l => (
                    <div key={l.variant_id} className="flex items-center justify-between gap-2 p-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{l.label}</p>
                        <p className="text-xs text-muted-foreground">{l.unit_price.toLocaleString()} FCFA / unité</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button type="button" variant="outline" size="icon" className="h-7 w-7" onClick={() => updateQty(l.variant_id, -1)}>
                          <Minus className="w-3 h-3" />
                        </Button>
                        <span className="w-8 text-center font-bold text-sm">{l.quantity}</span>
                        <Button type="button" variant="outline" size="icon" className="h-7 w-7" onClick={() => updateQty(l.variant_id, 1)} disabled={l.quantity >= l.maxStock}>
                          <Plus className="w-3 h-3" />
                        </Button>
                      </div>
                      <p className="w-24 text-right font-bold text-sm shrink-0">{(l.unit_price * l.quantity).toLocaleString()}</p>
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive shrink-0" onClick={() => removeLine(l.variant_id)}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                </div>
                <div className="flex justify-end">
                  <p className="text-lg font-black">Total : {total.toLocaleString()} FCFA</p>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground uppercase">Notes (optionnel)</label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                className="w-full min-h-[70px] p-3 rounded-xl border border-input bg-background text-sm focus:ring-2 focus:ring-primary outline-none transition-all"
                placeholder="Précisions sur la commande..."
              />
            </div>
          </div>

          <div className="p-6 border-t border-border bg-muted/10 flex gap-3 sticky bottom-0">
            <Button type="button" variant="ghost" onClick={handleClose} className="flex-1 h-12 rounded-xl">Annuler</Button>
            <Button type="submit" disabled={mutation.isPending} className="flex-1 h-12 rounded-xl font-bold shadow-lg shadow-primary/20 gap-2">
              {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Créer la commande
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
