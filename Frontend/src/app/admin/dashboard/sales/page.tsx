'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Search, Download, Eye, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'

export default function SalesPage() {
  const [currentPage, setCurrentPage] = useState('sales')
  const router = useRouter()

  const [searchTerm, setSearchTerm] = useState('')
  const [selectedSaleId, setSelectedSaleId] = useState<number | null>(null)
  const [filterPeriod, setFilterPeriod] = useState('all')
  const queryClient = useQueryClient()

  // ─────────────────────────────────────────────────────────────
  // Récupération de toutes les ventes depuis l'API backend
  // ─────────────────────────────────────────────────────────────
  const { data: rawSales, isLoading } = useQuery({
    queryKey: ['sales'],
    queryFn: async () => {
      const res = await api.get('/sales/')
      return res.data.results || res.data
    }
  })

  // Récupération du résumé dashboard pour les KPIs globaux (dont remboursements)
  const { data: dashboardSummary } = useQuery({
    queryKey: ['dashboard-summary'],
    queryFn: async () => {
      const res = await api.get('/dashboard/summary/')
      return res.data
    }
  })

  // ─────────────────────────────────────────────────────────────
  // Récupération des détails d'une vente sélectionnée
  // ─────────────────────────────────────────────────────────────
  const { data: selectedSaleDetail, isLoading: isDetailLoading } = useQuery({
    queryKey: ['sales', selectedSaleId],
    queryFn: async () => {
      const res = await api.get(`/sales/${selectedSaleId}/`)
      return res.data
    },
    enabled: !!selectedSaleId,
  })

  // Mutation pour rembourser (modifier la vente)
  const refundMutation = useMutation({
    mutationFn: async (updatedLines: any[]) => {
      const refundNote = `Retour client effectué le ${new Date().toLocaleString()}`
      const newNotes = selectedSaleDetail?.notes 
        ? `${selectedSaleDetail.notes}\n${refundNote}`
        : refundNote

      return api.patch(`/sales/${selectedSaleId}/`, { 
        lines: updatedLines,
        notes: newNotes
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales'] })
      queryClient.invalidateQueries({ queryKey: ['products'] }) // Pour le stock
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] })
      alert("Retour enregistré avec succès. Le stock a été mis à jour.")
    },
    onError: () => {
      alert("Erreur lors du remboursement.")
    }
  })

  const handleRefundLine = (lineId: number) => {
    if (!selectedSaleDetail) return
    if (!confirm("Voulez-vous vraiment rembourser cet article ? Cela le remettra en stock et recalculera le total de la vente.")) return

    const updatedLines = selectedSaleDetail.lines
      .filter((l: any) => l.id !== lineId)
      .map((l: any) => ({
        product: l.product,
        variant: l.variant,
        quantity: l.quantity,
        unit_price: l.unit_price,
        line_discount: l.line_discount
      }))

    refundMutation.mutate(updatedLines)
  }

  // ─────────────────────────────────────────────────────────────
  // Formatage et préparation des données de ventes pour l'affichage
  // ─────────────────────────────────────────────────────────────
  const salesData = useMemo(() => {
    if (!rawSales) return []
    return rawSales.map((s: any) => ({
      id: s.id,
      ref: s.invoice_number ? `INV-${s.invoice_number}` : `VNT-${s.id}`,
      rawDate: new Date(s.sold_at || s.created_at),
      date: new Date(s.sold_at || s.created_at).toLocaleString(),
      seller: s.user || 'Admin',
      total: parseFloat(s.total) || 0,
      payment: s.channel === 'enLigne' ? 'Carte' : 'Espèces',
      status: s.status,
      items: s.items_count || 0,
      customer: s.customer?.name || s.customer_name || 'Client anonyme',
    }))
  }, [rawSales])

  // ─────────────────────────────────────────────────────────────
  // Filtrage des ventes selon la barre de recherche et la période
  // ─────────────────────────────────────────────────────────────
  const filteredSales = useMemo(() => {
    let filtered = salesData.filter((sale: any) =>
      sale.ref.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sale.seller.toLowerCase().includes(searchTerm.toLowerCase())
    )

    const now = new Date()
    if (filterPeriod === 'today') {
      filtered = filtered.filter((s: any) => s.rawDate.toDateString() === now.toDateString())
    } else if (filterPeriod === 'week') {
      const oneWeekAgo = new Date()
      oneWeekAgo.setDate(now.getDate() - 7)
      filtered = filtered.filter((s: any) => s.rawDate >= oneWeekAgo)
    } else if (filterPeriod === 'month') {
      filtered = filtered.filter((s: any) => s.rawDate.getMonth() === now.getMonth() && s.rawDate.getFullYear() === now.getFullYear())
    }

    return filtered
  }, [salesData, searchTerm, filterPeriod])

  // ─────────────────────────────────────────────────────────────
  // Calculs des KPIs (Indicateurs Clés de Performance)
  // ─────────────────────────────────────────────────────────────
  const todayData = salesData.filter((s: any) => s.rawDate.toDateString() === new Date().toDateString())
  const totalSalesDay = todayData.reduce((sum: number, s: any) => sum + s.total, 0)
  const transactionsToday = todayData.length
  const averageCart = transactionsToday > 0 ? Math.round(totalSalesDay / transactionsToday) : 0
  const refunds = todayData.filter((s: any) => s.status === 'REMBOURSE').length

  // Helper pour les couleurs du badge de statut
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PAYE':
        return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400'
      case 'PARTIEL':
        return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400'
      case 'NONPAYE':
      case 'REMBOURSE':
        return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700/30 dark:text-gray-400'
    }
  }

  const getPaymentColor = (payment: string) => {
    switch (payment) {
      case 'Carte':
        return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
      case 'Espèces':
        return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
      default:
        return 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400'
    }
  }

  return (
    <div className="flex flex-col h-full text-foreground">
      <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8">
        <div className="space-y-6">
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-bold text-foreground">Ventes</h1>
            <p className="text-muted-foreground">Historique et suivi des ventes</p>
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 flex-none">
            {/* KPI 1: Ventes du Jour */}
            <Card className="p-4 border-l-4 border-l-primary flex items-start justify-between bg-card hover:bg-muted/10 transition-colors">
              <div className="flex-1">
                <p className="text-sm text-muted-foreground font-medium uppercase tracking-wider">Ventes du jour</p>
                {isLoading ? (
                  <div className="h-9 w-32 bg-muted rounded animate-pulse mt-2" />
                ) : (
                  <p className="text-3xl font-black mt-2 text-foreground">{totalSalesDay.toFixed(2)} FCFA</p>
                )}
              </div>
              <div className="p-3 bg-primary/10 rounded-xl">
                <svg className="w-6 h-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8L5.257 19.243M5 7H3v10a2 2 0 002 2h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2z" />
                </svg>
              </div>
            </Card>

            <Card className="p-4 flex items-start justify-between bg-card hover:bg-muted/10 transition-colors">
              <div>
                <p className="text-sm text-muted-foreground font-medium uppercase tracking-wider">Transactions</p>
                <p className="text-3xl font-black mt-2 text-foreground">{transactionsToday}</p>
                <p className="text-xs text-primary font-bold mt-1">aujourd'hui</p>
              </div>
              <div className="p-3 bg-primary/10 rounded-xl">
                <svg className="w-6 h-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
            </Card>

            <Card className="p-4 flex items-start justify-between bg-card hover:bg-muted/10 transition-colors">
              <div>
                <p className="text-sm text-muted-foreground font-medium uppercase tracking-wider">Panier moyen</p>
                <p className="text-3xl font-black mt-2 text-foreground">{averageCart.toFixed(2)} FCFA</p>
                <p className="text-xs text-primary font-bold mt-1">aujourd'hui</p>
              </div>
              <div className="p-3 bg-primary/10 rounded-xl">
                <svg className="w-6 h-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </Card>

            <Card className="p-4 flex items-start justify-between bg-card hover:bg-muted/10 transition-colors border-l-4 border-l-destructive/50">
              <div>
                <p className="text-sm text-muted-foreground font-medium uppercase tracking-wider">Remboursements</p>
                <p className="text-3xl font-black mt-2 text-foreground">{dashboardSummary?.today_refunds ?? refunds}</p>
              </div>
              <div className="p-3 bg-destructive/10 rounded-xl">
                <svg className="w-6 h-6 text-destructive" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9l10.5-10.5M9 9l-10.5 10.5M9 9L3 15m6-6l6 6" />
                </svg>
              </div>
            </Card>
          </div>

          {/* Sales History Table */}
          <Card className="p-4 md:p-6 shadow-sm flex flex-col flex-1 h-full min-h-[500px]">
            <div className="space-y-4">
              <div className="flex justify-between items-end">
                <div>
                  <h2 className="text-xl font-bold flex items-center gap-2">Historique des transactions</h2>
                  <p className="text-sm text-muted-foreground font-medium mt-1">{filteredSales.length} ventes affichées</p>
                </div>
              </div>

              <div className="flex flex-col md:flex-row gap-3">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Rechercher..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 h-11"
                  />
                </div>
                <select
                  value={filterPeriod}
                  onChange={(e) => setFilterPeriod(e.target.value)}
                  className="px-4 py-2 border border-border rounded-lg bg-background text-foreground text-sm font-medium h-11 focus:outline-none focus:ring-2 focus:ring-primary/20"
                >
                  <option value="all">Historique Complet</option>
                  <option value="today">Aujourd'hui</option>
                  <option value="week">Cette semaine</option>
                  <option value="month">Ce mois-ci</option>
                </select>
                <Button variant="outline" size="icon" className="h-11 w-11 shrink-0">
                  <Download className="w-4 h-4" />
                </Button>
              </div>

              {isLoading ? (
                <div className="space-y-3 mt-4">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="h-12 w-full bg-muted/40 animate-pulse rounded-lg" />
                  ))}
                </div>
              ) : filteredSales.length === 0 ? (
                <div className="py-16 text-center text-muted-foreground">Aucune transaction trouvée</div>
              ) : (
                <>
                  <div className="hidden md:block overflow-x-auto rounded-lg border border-border mt-4">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/40">
                        <tr className="border-b border-border">
                          <th className="text-left py-4 px-4 font-semibold text-muted-foreground">Réf.</th>
                          <th className="text-left py-4 px-4 font-semibold text-muted-foreground">Date</th>
                          <th className="text-left py-4 px-4 font-semibold text-muted-foreground">Vendeur</th>
                          <th className="text-left py-4 px-4 font-semibold text-muted-foreground">Total</th>
                          <th className="text-left py-4 px-4 font-semibold text-muted-foreground">Paiement</th>
                          <th className="text-left py-4 px-4 font-semibold text-muted-foreground">Statut</th>
                          <th className="text-left py-4 px-4 font-semibold text-muted-foreground">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredSales.map((sale: any) => (
                          <tr key={sale.id} className="border-b border-border hover:bg-muted/30 transition-colors last:border-0">
                            <td className="py-3 px-4 font-bold text-primary">{sale.ref}</td>
                            <td className="py-3 px-4 text-xs font-medium text-muted-foreground">{sale.date}</td>
                            <td className="py-3 px-4 text-sm font-medium">{sale.seller}</td>
                            <td className="py-3 px-4 font-black">{sale.total.toFixed(2)} FCFA</td>
                            <td className="py-3 px-4">
                              <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-bold ${getPaymentColor(sale.payment)}`}>
                                {sale.payment}
                              </span>
                            </td>
                            <td className="py-3 px-4">
                              <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-bold ${getStatusColor(sale.status)}`}>
                                {sale.status}
                              </span>
                            </td>
                            <td className="py-3 px-4">
                              <button
                                onClick={() => setSelectedSaleId(sale.id)}
                                className="w-8 h-8 flex items-center justify-center hover:bg-primary/10 text-muted-foreground hover:text-primary rounded-full transition-colors"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="md:hidden space-y-3 mt-4">
                    {filteredSales.map((sale: any) => (
                      <Card key={sale.id} className="p-4 space-y-3 border border-border shadow-sm">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-bold text-primary">{sale.ref}</p>
                            <p className="text-xs font-medium text-muted-foreground">{sale.date}</p>
                          </div>
                          <p className="text-xl font-black">{sale.total.toFixed(2)} FCFA</p>
                        </div>
                        <div className="flex justify-between items-center text-sm">
                          <span className="font-medium text-muted-foreground">{sale.seller}</span>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${getPaymentColor(sale.payment)}`}>
                            {sale.payment}
                          </span>
                        </div>
                        <div className="flex justify-between items-center gap-2 pt-2 border-t border-border/50">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${getStatusColor(sale.status)}`}>
                            {sale.status}
                          </span>
                          <Button size="sm" variant="ghost" className="h-8" onClick={() => setSelectedSaleId(sale.id)}>
                            <Eye className="w-4 h-4 mr-2" /> Détails
                          </Button>
                        </div>
                      </Card>
                    ))}
                  </div>
                </>
              )}
            </div>
          </Card>
        </div>
      </main>

      {/* Details Modal */}
      {selectedSaleId && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
            <div className="p-5 border-b border-border flex justify-between items-center bg-muted/20">
              <h3 className="text-xl font-black">
                Détails de la transaction
              </h3>
              <button
                onClick={() => setSelectedSaleId(null)}
                className="w-8 h-8 flex items-center justify-center hover:bg-black/10 rounded-full transition-colors"
              >
                <svg className="w-5 h-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="overflow-y-auto p-6 flex-1 min-h-[200px]">
              {isDetailLoading ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
              ) : selectedSaleDetail ? (
                <div className="space-y-6">
                  {/* Grid of info */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-muted/30 rounded-xl border border-border">
                    <div>
                      <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Date</p>
                      <p className="font-semibold text-sm mt-0.5">{new Date(selectedSaleDetail.sold_at || selectedSaleDetail.created_at).toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Vendeur</p>
                      <p className="font-semibold text-sm mt-0.5">{selectedSaleDetail.user || 'Admin'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Client</p>
                      <p className="font-semibold text-sm mt-0.5">{selectedSaleDetail.customer?.name || selectedSaleDetail.customer_name || 'Anonyme'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Téléphone</p>
                      <p className="font-semibold text-sm mt-0.5">{selectedSaleDetail.customer?.phone || '—'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Total</p>
                      <p className="font-black text-lg text-primary mt-0.5">{parseFloat(selectedSaleDetail.total).toFixed(2)} FCFA</p>
                    </div>
                  </div>

                  {/* Lines */}
                  <div>
                    <h4 className="font-black text-sm uppercase text-muted-foreground tracking-widest mb-3 px-1 border-b border-border pb-2">Articles commandés</h4>
                    <div className="space-y-2">
                      {/* Boucle sur chaque produit vendu (ligne de facture) */}
                      {selectedSaleDetail.lines?.map((line: any) => (
                        <div key={line.id} className="flex justify-between items-center py-2 px-3 rounded-lg hover:bg-muted/20 border border-transparent hover:border-border transition-colors">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-muted rounded-md overflow-hidden shrink-0">
                              <img 
                                src={line.product_detail?.image || line.product_detail?.image_url || '/placeholder.svg'} 
                                className="w-full h-full object-cover" 
                              />
                            </div>
                            <div>
                              <p className="font-bold text-sm leading-none">{line.product_detail?.name || 'Produit inconnu'}</p>
                              {line.variant_detail && (
                                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mt-1 border inline-block px-1 rounded">
                                  {line.variant_detail.size || line.variant_detail.model || line.variant_detail.sku}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="text-right mr-4">
                              <p className="font-black">{parseFloat(line.line_total).toFixed(2)} FCFA</p>
                              <p className="text-xs text-muted-foreground font-medium">{line.quantity} x {parseFloat(line.unit_price).toFixed(2)} FCFA</p>
                            </div>
                            {selectedSaleDetail.status !== 'ANNULE' && (
                              <Button 
                                variant="outline" 
                                size="sm" 
                                onClick={() => handleRefundLine(line.id)}
                                disabled={refundMutation.isPending}
                                className="h-8 text-xs border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 font-bold"
                              >
                                {refundMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Rembourser"}
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                      {!selectedSaleDetail.lines?.length && (
                        <p className="text-center text-muted-foreground text-sm italic py-4">Aucun détail d'article disponible.</p>
                      )}
                    </div>
                  </div>

                </div>
              ) : (
                <p className="text-center text-muted-foreground text-sm py-4">Impossible de récupérer les détails.</p>
              )}
            </div>
            
            <div className="p-4 border-t border-border bg-muted/10 text-right">
              <Button onClick={() => setSelectedSaleId(null)} className="font-bold">Fermer</Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}