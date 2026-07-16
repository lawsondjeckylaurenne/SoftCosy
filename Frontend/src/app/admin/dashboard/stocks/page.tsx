'use client'

import React, { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus,
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  Package,
  Search,
  Activity,
  FileText,
  Calendar,
  Edit2,
  Trash2,
  MoreHorizontal,
  ChevronDown,
  ChevronUp,
  Layers,
  Boxes,
  Wrench,
} from 'lucide-react'
import api, { fetchAllPages } from '@/lib/api'

// UI Components
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

// Custom Components
import AddMovementModal from '@/components/add-movement-modal'

// ── Interfaces ────────────────────────────────
interface StockMovement {
  id: number
  stock: number | null
  product: number | null
  variant_sku: string | null
  product_name: string | null
  product_id: number | null
  movement_type: 'ENTREE' | 'SORTIE' | 'AJUSTEMENT'
  quantite: number
  reason: string
  reason_display?: string
  date: string
  notes?: string
  user?: string
}

interface StockLine {
  id: number
  variant: number
  variant_sku: string
  product_name: string
  on_hand_qty: number
  reserved_qty: number
  available_qty: number
}

interface ProductGroup {
  product_id: number
  product_name: string
  total_stock: number     // sum of all ENTREE - SORTIE for this product
  movements: StockMovement[]
}

// ── Calcule le stock "affiché" d'un groupe produit ─────────────────────────
function computeProductStock(movements: StockMovement[]): number {
  return movements.reduce((sum, m) => {
    if (m.movement_type === 'ENTREE' || m.movement_type === 'AJUSTEMENT') return sum + m.quantite
    return sum - m.quantite
  }, 0)
}

export default function StocksPage() {
  const queryClient = useQueryClient()

  // ── States ────────────────────────────────────
  const [isAddMovementOpen, setIsAddMovementOpen] = useState(false)
  const [page, setPage] = useState(1)
  const [hasNextPage, setHasNextPage] = useState(false)
  const [hasPrevPage, setHasPrevPage] = useState(false)
  const [totalItems, setTotalItems] = useState(0)
  const [searchTerm, setSearchTerm] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [movementToEdit, setMovementToEdit] = useState<StockMovement | null>(null)
  const [expandedProductId, setExpandedProductId] = useState<number | null>(null)
  const [stockSearchTerm, setStockSearchTerm] = useState('')
  const [stockToAdjustId, setStockToAdjustId] = useState<number | null>(null)

  // ── Mutations ─────────────────────────────────
  const deleteMovementMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/stock-movements/${id}/`),
    onSuccess: () => {
       queryClient.invalidateQueries({ queryKey: ['stockMovements'] })
       queryClient.invalidateQueries({ queryKey: ['stocks'] })
    },
    onError: (err: any) => {
       alert("Erreur lors de la suppression : " + (err.response?.data?.detail || "Erreur inconnue"))
    }
  })

  // ── Queries ───────────────────────────────────
  // On récupère TOUTES les pages : avec 122+ variantes, se limiter à la
  // première page fausserait à la fois les stats et la liste "Stock actuel".
  const { data: stocks = [], isLoading: stocksLoading } = useQuery<StockLine[]>({
    queryKey: ['stocks'],
    queryFn: () => fetchAllPages<StockLine>('/stocks/'),
  })

  const filteredStockLines = useMemo(() => {
    const term = stockSearchTerm.trim().toLowerCase()
    if (!term) return stocks
    return stocks.filter(s =>
      (s.product_name || '').toLowerCase().includes(term) ||
      (s.variant_sku || '').toLowerCase().includes(term)
    )
  }, [stocks, stockSearchTerm])

  const { data: movements = [], isLoading: movementsLoading } = useQuery<StockMovement[]>({
    queryKey: ['stockMovements', page],
    queryFn: async () => {
      const res = await api.get(`/stock-movements/?page=${page}`)
      setHasNextPage(!!res.data.next)
      setHasPrevPage(!!res.data.previous)
      setTotalItems(res.data.count || 0)
      return res.data.results || res.data
    }
  })

  // ── Grouper les mouvements par produit ─────────────────────────────────
  const productGroups = useMemo((): ProductGroup[] => {
    const groupMap = new Map<number, ProductGroup>()

    movements.forEach(m => {
      const pId = m.product_id
      const pName = m.product_name || 'Produit inconnu'

      if (!pId) return

      if (!groupMap.has(pId)) {
        groupMap.set(pId, {
          product_id: pId,
          product_name: pName,
          total_stock: 0,
          movements: []
        })
      }

      const group = groupMap.get(pId)!
      group.movements.push(m)
    })

    // Calculer le stock total par produit + appliquer les filtres recherche
    return Array.from(groupMap.values())
      .map(g => ({
        ...g,
        total_stock: computeProductStock(g.movements),
      }))
      .filter(g => {
        if (!searchTerm) return true
        return g.product_name.toLowerCase().includes(searchTerm.toLowerCase())
      })
  }, [movements, searchTerm])

  // ── Stats ─────────────────────────────────────
  const stats = useMemo(() => {
    const totalQty = stocks.reduce((sum: number, s: any) => sum + (s.on_hand_qty || 0), 0)
    const lowStockItems = stocks.filter((s: any) => s.on_hand_qty < 10).length
    const criticalItems = stocks.filter((s: any) => s.available_qty <= 5).length
    const todayMovements = movements.filter(m =>
      new Date(m.date).toDateString() === new Date().toDateString()
    ).length

    return [
      { label: 'Total Pièces', value: totalQty, icon: Package, color: 'text-primary', bg: 'bg-primary/10' },
      { label: 'Stock Faible', value: lowStockItems, icon: AlertTriangle, color: 'text-orange-500', bg: 'bg-orange-500/10' },
      { label: 'Alertes Critiques', value: criticalItems, icon: Activity, color: 'text-red-500', bg: 'bg-red-500/10' },
      { label: 'Mouvements (Auj.)', value: todayMovements, icon: Calendar, color: 'text-blue-500', bg: 'bg-blue-500/10' },
    ]
  }, [stocks, movements])

  const isLoading = stocksLoading || movementsLoading

  return (
    <div className="flex flex-col h-full">
      <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 space-y-8">
          
          {/* HEADER */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight text-foreground flex items-center gap-3">
                <TrendingUp className="w-8 h-8 text-primary" />
                Gestion des Stocks
              </h1>
              <p className="text-muted-foreground mt-1 text-sm font-medium">
                Mouvements groupés par produit — Stock total en temps réel
              </p>
            </div>
            <Button 
              onClick={() => setIsAddMovementOpen(true)} 
              className="rounded-xl px-6 h-12 shadow-lg shadow-primary/25 gap-2 font-bold transition-all hover:scale-[1.02] active:scale-95"
            >
              <Plus className="w-5 h-5" />
              Nouveau Mouvement
            </Button>
          </div>

          {/* STATS CARDS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <Card key={i} className="p-6 border border-border/50 bg-card overflow-hidden">
                   <div className="flex items-center gap-4 animate-pulse">
                      <div className="w-12 h-12 rounded-xl bg-muted" />
                      <div className="space-y-2">
                        <div className="h-2 w-16 bg-muted rounded" />
                        <div className="h-6 w-24 bg-muted rounded" />
                      </div>
                   </div>
                </Card>
              ))
            ) : (
              stats.map((stat, idx) => {
                const Icon = stat.icon
                return (
                  <Card key={idx} className="p-6 border border-border/50 shadow-sm bg-card hover:border-primary/30 transition-all group overflow-hidden relative">
                    <div className="absolute top-0 right-0 w-24 h-24 -mr-8 -mt-8 bg-primary/5 rounded-full group-hover:scale-150 transition-transform duration-500" />
                    <div className="flex items-center gap-4 relative">
                        <div className={`w-12 h-12 rounded-xl ${stat.bg} flex items-center justify-center`}>
                          <Icon className={`w-6 h-6 ${stat.color}`} />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{stat.label}</p>
                          <p className="text-2xl font-black text-foreground">{stat.value}</p>
                        </div>
                    </div>
                  </Card>
                )
              })
            )}
          </div>

          {/* STOCK ACTUEL PAR VARIANTE */}
          <div className="space-y-4">
            <div className="flex items-center justify-between px-2">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Boxes className="w-5 h-5 text-primary" />
                Stock Actuel par Variante
              </h2>
              <Badge variant="secondary" className="font-bold text-[10px] uppercase">
                {filteredStockLines.length} variante(s)
              </Badge>
            </div>

            <Card className="p-4 border-border/50 shadow-sm bg-card/50 backdrop-blur-sm">
              <div className="relative group">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                <Input
                  placeholder="Rechercher une variante par produit ou SKU..."
                  value={stockSearchTerm}
                  onChange={(e) => setStockSearchTerm(e.target.value)}
                  className="pl-11 h-12 bg-background/50 border-border/50 focus:border-primary/50 focus:ring-primary/20 rounded-xl transition-all"
                />
              </div>
            </Card>

            {stocksLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-14 w-full rounded-2xl bg-muted/40 animate-pulse" />
                ))}
              </div>
            ) : filteredStockLines.length === 0 ? (
              <Card className="p-16 border-dashed border-2 flex flex-col items-center justify-center text-center rounded-3xl opacity-60">
                <Boxes className="w-8 h-8 text-muted-foreground mb-3" />
                <h3 className="font-bold">Aucune variante trouvée</h3>
              </Card>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-border/50 bg-card shadow-xl max-h-[420px] overflow-y-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="sticky top-0 bg-muted/90 backdrop-blur-sm z-10">
                    <tr className="border-b border-border/50">
                      <th className="p-3 text-xs font-bold text-muted-foreground uppercase tracking-wider">Produit</th>
                      <th className="p-3 text-xs font-bold text-muted-foreground uppercase tracking-wider">SKU</th>
                      <th className="p-3 text-xs font-bold text-muted-foreground uppercase tracking-wider text-center">Stock Disponible</th>
                      <th className="p-3 text-xs font-bold text-muted-foreground uppercase tracking-wider text-center">Statut</th>
                      <th className="p-3 text-xs font-bold text-muted-foreground uppercase tracking-wider text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {filteredStockLines.map((s) => {
                      const qty = s.available_qty ?? s.on_hand_qty
                      const status = qty <= 0
                        ? { label: 'Épuisé', color: 'text-destructive' }
                        : qty <= 5
                          ? { label: 'Critique', color: 'text-red-500' }
                          : qty < 10
                            ? { label: 'Stock faible', color: 'text-orange-500' }
                            : { label: 'En stock', color: 'text-green-600' }
                      return (
                        <tr key={s.id} className="hover:bg-muted/30 transition-colors">
                          <td className="p-3 font-bold text-foreground text-sm">{s.product_name || 'Produit inconnu'}</td>
                          <td className="p-3">
                            <span className="font-mono font-bold text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                              {s.variant_sku}
                            </span>
                          </td>
                          <td className="p-3 text-center font-black">{qty}</td>
                          <td className={`p-3 text-center text-[10px] font-bold uppercase ${status.color}`}>{status.label}</td>
                          <td className="p-3 text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 rounded-lg text-xs font-bold gap-1.5"
                              onClick={() => setStockToAdjustId(s.id)}
                            >
                              <Wrench className="w-3 h-3" />
                              Ajuster
                            </Button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* FILTERS */}
          <Card className="p-4 border-border/50 shadow-sm bg-card/50 backdrop-blur-sm">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="relative flex-1 group">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                <Input
                  placeholder="Rechercher par produit..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-11 h-12 bg-background/50 border-border/50 focus:border-primary/50 focus:ring-primary/20 rounded-xl transition-all"
                />
              </div>
              <div className="flex gap-3">
                <select 
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className="h-12 px-4 rounded-xl border border-border/50 bg-background/50 text-sm font-bold focus:ring-2 focus:ring-primary outline-none transition-all"
                >
                  <option value="all">Tous les types</option>
                  <option value="ENTREE">Entrées</option>
                  <option value="SORTIE">Sorties</option>
                  <option value="AJUSTEMENT">Ajustements</option>
                </select>
              </div>
            </div>
          </Card>

          {/* MOVEMENTS GROUPED BY PRODUCT */}
          <div className="space-y-4">
             <div className="flex items-center justify-between px-2">
                <h2 className="text-lg font-bold flex items-center gap-2">
                   <Layers className="w-5 h-5 text-primary" />
                   Mouvements par Produit
                </h2>
                <Badge variant="secondary" className="font-bold text-[10px] uppercase">{productGroups.length} Produit(s)</Badge>
             </div>

             {movementsLoading ? (
               <div className="space-y-3">
                 {Array.from({ length: 4 }).map((_, i) => (
                   <div key={i} className="h-20 w-full rounded-2xl bg-muted/40 animate-pulse" />
                 ))}
               </div>
             ) : productGroups.length === 0 ? (
               <Card className="p-20 border-dashed border-2 flex flex-col items-center justify-center text-center rounded-3xl opacity-60">
                  <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                     <FileText className="w-8 h-8 text-muted-foreground" />
                  </div>
                  <h3 className="font-bold">Aucun mouvement trouvé</h3>
                  <p className="text-sm text-muted-foreground">Aucun produit avec des mouvements de stock.</p>
               </Card>
             ) : (
               <div className="overflow-hidden rounded-2xl border border-border/50 bg-card shadow-xl">
                 <table className="w-full text-left border-collapse">
                   <thead>
                     <tr className="bg-muted/50 border-b border-border/50">
                       <th className="p-4 text-xs font-bold text-muted-foreground uppercase tracking-wider">Produit</th>
                       <th className="p-4 text-xs font-bold text-muted-foreground uppercase tracking-wider text-center">Stock Total</th>
                       <th className="p-4 text-xs font-bold text-muted-foreground uppercase tracking-wider text-center">Mouvements</th>
                       <th className="p-4 text-xs font-bold text-muted-foreground uppercase tracking-wider text-right">Détails</th>
                     </tr>
                   </thead>
                   <tbody className="divide-y divide-border/40">
                     {productGroups.map((group) => (
                       <React.Fragment key={group.product_id}>
                         {/* Product Row */}
                         <tr
                           className={`hover:bg-muted/30 transition-colors cursor-pointer ${expandedProductId === group.product_id ? 'bg-primary/5 border-b-0' : ''}`}
                           onClick={() => setExpandedProductId(expandedProductId === group.product_id ? null : group.product_id)}
                         >
                           <td className="p-4">
                             <div className="flex items-center gap-3">
                               <div className="w-10 h-10 rounded-xl bg-primary/5 border border-primary/10 flex items-center justify-center shrink-0">
                                 <Package className="w-5 h-5 text-primary/50" />
                               </div>
                               <div className="font-bold text-foreground text-sm">{group.product_name}</div>
                             </div>
                           </td>
                           <td className="p-4 text-center">
                             <span className={`text-lg font-black ${group.total_stock > 0 ? 'text-green-600' : group.total_stock < 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                               {group.total_stock}
                             </span>
                             <div className={`text-[9px] uppercase font-bold mt-0.5 ${group.total_stock > 0 ? 'text-green-500' : 'text-destructive'}`}>
                               {group.total_stock > 0 ? 'En Stock' : 'Épuisé'}
                             </div>
                           </td>
                           <td className="p-4 text-center">
                             <Badge variant="secondary" className="font-bold text-xs">
                               {group.movements.length} mouv.
                             </Badge>
                           </td>
                           <td className="p-4 text-right">
                             <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg">
                               {expandedProductId === group.product_id
                                 ? <ChevronUp className="w-4 h-4" />
                                 : <ChevronDown className="w-4 h-4" />
                               }
                             </Button>
                           </td>
                         </tr>

                         {/* Expanded Movements Sub-Table */}
                         {expandedProductId === group.product_id && (
                           <tr>
                             <td colSpan={4} className="p-0 bg-muted/10">
                               <div className="ml-14 mr-4 mb-4 mt-2 rounded-2xl border border-border/50 bg-background/60 overflow-hidden shadow-inner">
                                 <div className="p-3 bg-muted/30 border-b border-border/40 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-2">
                                   <Activity className="w-3 h-3" />
                                   Historique des mouvements — {group.product_name}
                                 </div>
                                 <table className="w-full text-xs text-left">
                                   <thead>
                                     <tr className="border-b border-border/30 bg-muted/20">
                                       <th className="p-3 font-bold text-muted-foreground">SKU / Variante</th>
                                       <th className="p-3 font-bold text-muted-foreground text-center">Type</th>
                                       <th className="p-3 font-bold text-muted-foreground text-center">Qté</th>
                                       <th className="p-3 font-bold text-muted-foreground">Raison</th>
                                       <th className="p-3 font-bold text-muted-foreground">Date</th>
                                       <th className="p-3 font-bold text-muted-foreground">Notes</th>
                                       <th className="p-3 font-bold text-muted-foreground text-right">Actions</th>
                                     </tr>
                                   </thead>
                                   <tbody className="divide-y divide-border/20">
                                     {group.movements
                                       .filter(m => typeFilter === 'all' || m.movement_type === typeFilter)
                                       .map(m => (
                                       <tr key={m.id} className="hover:bg-muted/30 transition-colors">
                                         <td className="p-3">
                                           <span className="font-mono font-bold text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                             {m.variant_sku || 'PRODUIT'}
                                           </span>
                                         </td>
                                         <td className="p-3 text-center">
                                           <Badge className={`rounded-lg px-2 py-0.5 text-[9px] font-black uppercase ${
                                             m.movement_type === 'ENTREE' ? 'bg-green-100 text-green-700 hover:bg-green-100' :
                                             m.movement_type === 'SORTIE' ? 'bg-red-100 text-red-700 hover:bg-red-100' :
                                             'bg-orange-100 text-orange-700 hover:bg-orange-100'
                                           }`}>
                                             {m.movement_type === 'ENTREE' ? <TrendingUp className="w-3 h-3 mr-1 inline" /> :
                                              m.movement_type === 'SORTIE' ? <TrendingDown className="w-3 h-3 mr-1 inline" /> :
                                              <AlertTriangle className="w-3 h-3 mr-1 inline" />}
                                             {m.movement_type}
                                           </Badge>
                                         </td>
                                         <td className="p-3 text-center">
                                           <span className={`font-black ${m.movement_type === 'ENTREE' ? 'text-green-600' : m.movement_type === 'SORTIE' ? 'text-red-600' : 'text-orange-600'}`}>
                                             {m.movement_type === 'SORTIE'
                                               ? `-${m.quantite}`
                                               : m.movement_type === 'AJUSTEMENT'
                                                 ? (m.quantite > 0 ? `+${m.quantite}` : m.quantite)
                                                 : `+${m.quantite}`}
                                           </span>
                                         </td>
                                         <td className="p-3">
                                           <span className="font-semibold text-foreground/80">{m.reason_display || m.reason || '—'}</span>
                                         </td>
                                         <td className="p-3">
                                           <span className="font-bold text-foreground">{new Date(m.date).toLocaleDateString()}</span>
                                         </td>
                                         <td className="p-3 max-w-[160px]">
                                           {m.notes ? (
                                             <span className="text-[9px] italic text-muted-foreground truncate block">{m.notes}</span>
                                           ) : '—'}
                                         </td>
                                         <td className="p-3 text-right">
                                           <div className="flex items-center justify-end gap-1">
                                             <Button 
                                               variant="ghost" 
                                               size="icon" 
                                               onClick={() => setMovementToEdit(m)}
                                               className="h-7 w-7 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg"
                                             >
                                               <Edit2 className="w-3 h-3" />
                                             </Button>
                                             <DropdownMenu>
                                               <DropdownMenuTrigger asChild>
                                                 <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:bg-muted rounded-lg">
                                                   <MoreHorizontal className="w-3 h-3" />
                                                 </Button>
                                               </DropdownMenuTrigger>
                                               <DropdownMenuContent align="end" className="w-40 rounded-xl shadow-xl border-border/50">
                                                 <DropdownMenuItem 
                                                   onClick={() => { if(confirm('Supprimer ce mouvement ?')) deleteMovementMutation.mutate(m.id) }}
                                                   className="text-destructive gap-2 focus:bg-destructive/5 focus:text-destructive cursor-pointer text-xs"
                                                 >
                                                   <Trash2 className="w-3 h-3" />
                                                   Supprimer
                                                 </DropdownMenuItem>
                                               </DropdownMenuContent>
                                             </DropdownMenu>
                                           </div>
                                         </td>
                                       </tr>
                                     ))}
                                   </tbody>
                                 </table>
                               </div>
                             </td>
                           </tr>
                         )}
                       </React.Fragment>
                     ))}
                   </tbody>
                 </table>
               </div>
             )}
          </div>

          {/* FOOTER - Pagination */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-10 border-t border-border/50 text-muted-foreground mt-8">
            <div className="flex flex-col gap-1">
              <p className="text-xs font-medium bg-muted/50 px-4 py-2 rounded-full border border-border/30 inline-block">
                <span className="text-foreground font-black">{productGroups.length}</span> produit(s) — <span className="text-foreground font-black">{totalItems}</span> mouvements au total
              </p>
              {totalItems > 20 && (
                <p className="text-[10px] uppercase tracking-tighter font-bold px-4">
                  Page {page} sur {Math.ceil(totalItems / 20)}
                </p>
              )}
            </div>
            
            <div className="flex items-center gap-3">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => {
                  setPage(p => Math.max(1, p - 1))
                  window.scrollTo({ top: 0, behavior: 'smooth' })
                }}
                disabled={!hasPrevPage}
                className="rounded-xl h-10 px-4 border-border/50 text-xs font-bold gap-2"
              >
                Précédent
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => {
                  setPage(p => p + 1)
                  window.scrollTo({ top: 0, behavior: 'smooth' })
                }}
                disabled={!hasNextPage}
                className="rounded-xl h-10 px-4 border-border/50 text-xs font-bold gap-2"
              >
                Suivant
              </Button>
            </div>

            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest">
               <Activity className="w-3 h-3" />
               Mise à jour : {new Date().toLocaleTimeString()}
            </div>
          </div>
        </main>

      <AddMovementModal
        isOpen={isAddMovementOpen || !!movementToEdit || !!stockToAdjustId}
        onClose={() => {
           setIsAddMovementOpen(false)
           setMovementToEdit(null)
           setStockToAdjustId(null)
        }}
        movementToEdit={movementToEdit}
        initialStockId={stockToAdjustId ?? undefined}
        onSuccess={() => {
           queryClient.invalidateQueries({ queryKey: ['stockMovements'] })
           queryClient.invalidateQueries({ queryKey: ['stocks'] })
           setMovementToEdit(null)
           setStockToAdjustId(null)
        }}
      />
    </div>
  )
}