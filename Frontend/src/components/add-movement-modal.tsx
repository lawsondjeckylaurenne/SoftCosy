'use client'

import React, { useState, useEffect, useMemo } from "react"
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { X, ArrowRight, Package, TrendingUp, TrendingDown, AlertTriangle, Search } from 'lucide-react'
import api, { fetchAllPages } from '@/lib/api'

interface Stock {
  id: number
  variant_sku: string
  product_name: string
  on_hand_qty: number
}

interface AddMovementModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
  movementToEdit?: any
  preselectedProductId?: number  // Pré-sélectionne les stocks d'un produit spécifique
  initialStockId?: number  // Pré-sélectionne directement une variante précise
}

const movementTypes = [
  { value: 'ENTREE', label: 'Entrée de stock', color: 'text-green-600', icon: TrendingUp },
  { value: 'SORTIE', label: 'Sortie de stock', color: 'text-red-600', icon: TrendingDown },
  { value: 'AJUSTEMENT', label: 'Ajustement', color: 'text-orange-600', icon: AlertTriangle },
]

/**
 * Définition des raisons de mouvement groupées par type.
 * Chaque raison possède une clé technique (value) synchronisée avec le backend
 * et un libellé (label) pour l'affichage utilisateur.
 */
const reasons = {
  ENTREE: [
    { value: 'ACHAT_FOURNISSEUR', label: 'Achat fournisseur' },
    { value: 'RETOUR_TEST', label: 'Retour de test' },
    { value: 'RETOUR_CLIENT', label: 'Retour client' },
    { value: 'REMBOURSEMENT', label: 'Remboursement' },
    { value: 'CORRECTION_INVENTAIRE', label: 'Correction inventaire' },
    { value: 'CADEAU_PROMO', label: 'Cadeau/Promotion' },
  ],
  SORTIE: [
    { value: 'VENTE', label: 'Vente' },
    { value: 'SORTIE_MAGASIN', label: 'Sortie magasin' },
    { value: 'CASSE_PERTE', label: 'Casse/Perte' },
    { value: 'ECHANTILLON', label: 'Echantillon' },
  ],
  AJUSTEMENT: [
    { value: 'INVENTAIRE_ANNUEL', label: 'Inventaire annuel' },
    { value: 'CORRECTION_MANUELLE', label: 'Correction manuelle' },
    { value: 'PEREMPTION', label: 'Péremption' },
    { value: 'AUTRE', label: 'Autre' },
  ],
}

export default function AddMovementModal({
  isOpen,
  onClose,
  onSuccess,
  movementToEdit,
  preselectedProductId,
  initialStockId,
}: AddMovementModalProps) {
  const queryClient = useQueryClient()
  
  const [formData, setFormData] = useState({
    stock: '',
    movement_type: 'ENTREE',
    quantite: '',
    reason: '',
    notes: '',
  })

  // ── Recherche de produit/variante (évite de parcourir toute la liste) ──
  const [stockSearchTerm, setStockSearchTerm] = useState('')
  const [showStockList, setShowStockList] = useState(false)

  // Pre-fill form when editing
  useEffect(() => {
    if (movementToEdit && isOpen) {
      setFormData({
        stock: String(movementToEdit.stock),
        movement_type: movementToEdit.movement_type,
        quantite: String(movementToEdit.quantite),
        reason: movementToEdit.reason,
        notes: movementToEdit.notes || '',
      })
      setStockSearchTerm('')
      setShowStockList(false)
    } else if (isOpen) {
      resetForm()
      if (initialStockId) {
        setFormData(prev => ({ ...prev, stock: String(initialStockId) }))
      }
    }
  }, [movementToEdit, isOpen, initialStockId])

  // ── Data Fetching ─────────────────────────────
  // On récupère TOUTES les pages : la recherche doit porter sur l'ensemble
  // des variantes, pas seulement les 20/100 premières renvoyées par l'API.
  const { data: allStocks = [], isLoading: stocksLoading } = useQuery<Stock[]>({
    queryKey: ['stocks'],
    queryFn: () => fetchAllPages<Stock>('/stocks/'),
    enabled: isOpen
  })

  // Filtrer par produit si preselectedProductId est fourni
  const stocks = preselectedProductId
    ? allStocks.filter(s => s.product_name && allStocks.find(
        a => a.id === s.id && (s as any).product_id === preselectedProductId
      ))
    : allStocks

  // Auto-sélectionner si un seul stock correspond au produit pré-sélectionné
  useEffect(() => {
    if (!preselectedProductId || movementToEdit || !isOpen) return
    const matching = allStocks.filter(s => (s as any).product_id === preselectedProductId)
    if (matching.length === 1) {
      setFormData(prev => ({ ...prev, stock: String(matching[0].id) }))
    }
  }, [preselectedProductId, allStocks, isOpen, movementToEdit])

  // ── Mutation ──────────────────────────────────
  const mutation = useMutation({
    mutationFn: (data: any) => {
      if (movementToEdit) {
        return api.patch(`/stock-movements/${movementToEdit.id}/`, data)
      }
      return api.post('/stock-movements/', data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stockMovements'] })
      queryClient.invalidateQueries({ queryKey: ['stocks'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-recent'] })
      if (onSuccess) onSuccess()
      onClose()
      resetForm()
    },
    onError: (err: any) => {
      alert("Erreur lors de l'enregistrement : " + (err.response?.data?.detail || JSON.stringify(err.response?.data)))
    }
  })

  const resetForm = () => {
    setFormData({
      stock: '',
      movement_type: 'ENTREE',
      quantite: '',
      reason: '',
      notes: '',
    })
    setStockSearchTerm('')
    setShowStockList(false)
  }

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }))
  }

  const selectedStock = stocks.find(s => s.id === Number(formData.stock))

  // Filtre la liste par nom de produit ou SKU de variante
  const filteredStocks = useMemo(() => {
    const term = stockSearchTerm.trim().toLowerCase()
    if (!term) return stocks
    return stocks.filter(s =>
      (s.product_name || '').toLowerCase().includes(term) ||
      (s.variant_sku || '').toLowerCase().includes(term)
    )
  }, [stocks, stockSearchTerm])

  const stockListOpen = showStockList || !formData.stock

  const handleSelectStock = (stockId: number) => {
    setFormData(prev => ({ ...prev, stock: String(stockId) }))
    setShowStockList(false)
    setStockSearchTerm('')
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.stock || !formData.quantite || !formData.reason) {
      alert('Veuillez remplir tous les champs obligatoires')
      return
    }

    let payload_type = formData.movement_type
    let payload_quantite = Number(formData.quantite)

    if (formData.movement_type === 'AJUSTEMENT' && !movementToEdit) {
      if (!selectedStock) return
      // L'utilisateur saisit le "nouveau stock réel" ; on enregistre l'écart
      // signé (peut être négatif), mais le type reste bien AJUSTEMENT —
      // jamais réécrit en Entrée/Sortie comme avant.
      const diff = payload_quantite - selectedStock.on_hand_qty
      if (diff === 0) {
        alert('Le stock est déjà à ce montant. Aucun ajustement nécessaire.')
        return
      }
      payload_quantite = diff
    }

    mutation.mutate({
      stock: Number(formData.stock),
      movement_type: payload_type,
      quantite: payload_quantite,
      reason: formData.reason,
      notes: formData.notes
    })
  }

  const currentType = formData.movement_type as keyof typeof reasons
  const availableReasons = reasons[currentType] || []
  
  const getQuantiteLabel = () => {
    if (movementToEdit) return "Nouvelle Quantité du Mouvement *"
    if (formData.movement_type === 'ENTREE') return "Quantité à Ajouter (+) *"
    if (formData.movement_type === 'SORTIE') return "Quantité à Retirer (-) *"
    if (formData.movement_type === 'AJUSTEMENT') return `Nouveau Stock Réel (Actuel: ${selectedStock?.on_hand_qty ?? '?'}) *`
    return "Quantité *"
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-xl bg-card shadow-2xl border-border flex flex-col max-h-[95vh] overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-border flex items-center justify-between bg-muted/20">
          <div className="flex items-center gap-3">
             <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-primary" />
             </div>
             <div>
                <h2 className="text-xl font-bold text-foreground">
                  {movementToEdit ? 'Modifier le Mouvement' : 'Nouveau Mouvement de Stock'}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {movementToEdit ? 'Ajustez les détails du mouvement sélectionné' : 'Enregistrez une entrée, sortie ou ajustement'}
                </p>
             </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-primary transition-colors p-2 rounded-full hover:bg-muted">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className="p-6 space-y-6">
            {/* Stock / Product Selection */}
            <div className="space-y-2">
              <label className="text-sm font-bold flex items-center gap-2">
                <Package className="w-4 h-4 text-muted-foreground" />
                Produit / Variantes *
                {preselectedProductId && (
                  <span className="ml-auto text-[10px] font-bold bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                    Pré-sélectionné depuis Produits
                  </span>
                )}
              </label>
              {!stockListOpen && selectedStock ? (
                <button
                  type="button"
                  onClick={() => setShowStockList(true)}
                  className="w-full h-11 px-3 flex items-center justify-between gap-2 rounded-xl border border-input bg-background text-sm text-left hover:border-primary/50 transition-all"
                >
                  <span className="font-medium truncate">
                    {selectedStock.product_name} — {selectedStock.variant_sku} (Stock actuel : {selectedStock.on_hand_qty})
                  </span>
                  <span className="text-xs text-primary font-bold shrink-0">Changer</span>
                </button>
              ) : (
                <div className="space-y-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      type="text"
                      value={stockSearchTerm}
                      onChange={(e) => setStockSearchTerm(e.target.value)}
                      placeholder="Rechercher un produit ou un SKU..."
                      className="h-11 pl-9 rounded-xl"
                      autoFocus={!!selectedStock}
                    />
                  </div>
                  <div className="max-h-52 overflow-y-auto rounded-xl border border-input divide-y divide-border">
                    {stocksLoading ? (
                      <div className="p-3 text-sm text-muted-foreground">Chargement des stocks...</div>
                    ) : filteredStocks.length === 0 ? (
                      <div className="p-3 text-sm text-muted-foreground">Aucun résultat.</div>
                    ) : (
                      filteredStocks.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => handleSelectStock(s.id)}
                          className={`w-full flex items-center justify-between gap-2 p-3 text-left text-sm hover:bg-muted transition-colors ${
                            String(s.id) === formData.stock ? 'bg-primary/5' : ''
                          }`}
                        >
                          <span className="truncate">
                            <span className="font-semibold">{s.product_name}</span>
                            <span className="text-muted-foreground"> — {s.variant_sku}</span>
                          </span>
                          <span className="text-xs font-bold text-muted-foreground shrink-0">Stock : {s.on_hand_qty}</span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Movement Type */}
              <div className="space-y-2">
                <label className="text-sm font-bold">Type de mouvement *</label>
                <div className="grid grid-cols-1 gap-2">
                  {movementTypes.map((type) => {
                    const Icon = type.icon
                    const isSelected = formData.movement_type === type.value
                    return (
                      <button
                        key={type.value}
                        type="button"
                        onClick={() => setFormData(prev => ({ ...prev, movement_type: type.value, reason: '' }))}
                        className={`flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${
                          isSelected 
                          ? 'border-primary bg-primary/5 ring-1 ring-primary' 
                          : 'border-border bg-background hover:bg-muted'
                        }`}
                      >
                        <div className={`p-2 rounded-lg ${isSelected ? 'bg-primary/10' : 'bg-muted'}`}>
                          <Icon className={`w-4 h-4 ${isSelected ? 'text-primary' : 'text-muted-foreground'}`} />
                        </div>
                        <span className={`text-sm font-medium ${isSelected ? 'text-foreground' : 'text-muted-foreground'}`}>
                          {type.label}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>

                <div className="space-y-4">
                {/* Quantity */}
                <div className="space-y-2">
                  <label className="text-sm font-bold text-primary">{getQuantiteLabel()}</label>
                  <Input
                    type="number"
                    name="quantite"
                    value={formData.quantite}
                    onChange={handleChange}
                    placeholder="ex: 10"
                    className="h-11 rounded-xl"
                    min={formData.movement_type === 'AJUSTEMENT' ? 0 : 1}
                    required
                  />
                </div>

                {/* Reason Selection */}
                <div className="space-y-2">
                  <label className="text-sm font-bold">Raison du mouvement *</label>
                  <select
                    name="reason"
                    value={formData.reason}
                    onChange={handleChange}
                    className="w-full h-11 px-3 py-2 rounded-xl border border-input bg-background text-sm focus:ring-2 focus:ring-primary outline-none transition-all"
                    required
                  >
                    <option value="">Sélectionnez une raison...</option>
                    {availableReasons.map((r) => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-2 pt-2">
              <label className="text-sm font-bold">Notes (optionnel)</label>
              <textarea
                name="notes"
                value={formData.notes}
                onChange={handleChange}
                placeholder="Précisions sur ce mouvement..."
                className="w-full min-h-[80px] p-3 rounded-xl border border-input bg-background text-sm focus:ring-2 focus:ring-primary outline-none transition-all"
              />
            </div>

            {/* Summary Box */}
            {selectedStock && formData.quantite && (
              <Card className="bg-muted p-4 border-none flex items-center justify-between rounded-2xl animate-in fade-in slide-in-from-bottom-2">
                 <div className="flex items-center gap-3">
                    <div className="text-center">
                       <p className="text-[10px] font-bold text-muted-foreground uppercase">Stock Actuel</p>
                       <p className="text-lg font-black">{selectedStock.on_hand_qty}</p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-muted-foreground" />
                    <div className="text-center">
                       <p className="text-[10px] font-bold text-muted-foreground uppercase">Nouveau Stock</p>
                       <p className="text-lg font-black text-primary">
                          {formData.movement_type === 'AJUSTEMENT' && !movementToEdit
                            ? Number(formData.quantite)
                            : formData.movement_type === 'ENTREE'
                              ? selectedStock.on_hand_qty + Number(formData.quantite)
                              : selectedStock.on_hand_qty - Number(formData.quantite)}
                       </p>
                    </div>
                 </div>
                 <div className="text-right">
                    <Badge className={
                      formData.movement_type === 'ENTREE' ? 'bg-green-100 text-green-700 hover:bg-green-100' :
                      formData.movement_type === 'SORTIE' ? 'bg-red-100 text-red-700 hover:bg-red-100' :
                      'bg-orange-100 text-orange-700 hover:bg-orange-100'
                    }>
                      {formData.movement_type}
                    </Badge>
                 </div>
              </Card>
            )}
          </div>

          {/* Footer */}
          <div className="p-6 border-t border-border bg-muted/10 flex gap-3 sticky bottom-0">
            <Button type="button" variant="ghost" onClick={onClose} className="flex-1 h-12 rounded-xl">
              Annuler
            </Button>
            <Button 
              type="submit" 
              disabled={mutation.isPending}
              className="flex-1 h-12 rounded-xl font-bold shadow-lg shadow-primary/20"
            >
              {mutation.isPending ? 'Enregistrement...' : movementToEdit ? 'Enregistrer les modifications' : 'Confirmer le mouvement'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}