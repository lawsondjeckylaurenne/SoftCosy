'use client'

import React, { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ClipboardList,
  Plus,
  Search,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronUp,
  Globe,
  Store,
  Activity,
  Package,
} from 'lucide-react'
import api, { fetchAllPages } from '@/lib/api'

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
import AddOrderModal from '@/components/add-order-modal'

interface OrderLine {
  id: number
  quantity: number
  unit_price: number
  line_total: number
  variant_label?: string | null
  product_detail?: { name: string }
  variant_detail?: { size?: string; model?: string; sku?: string }
}

interface Order {
  id: number
  customer: { id: number; name: string; phone: string } | null
  customer_name: string
  customer_phone: string
  delivery_address: string | null
  channel: 'SITE_WEB' | 'APPLICATION'
  payment_mode: 'CASH_LIVRAISON' | 'MOBILE_MONEY'
  status: 'EN_ATTENTE' | 'EN_COURS' | 'LIVRE' | 'ANNULE'
  subtotal: number
  total: number
  items_count?: number
  created_at: string
  lines?: OrderLine[]
}

// Masque entièrement le numéro (même longueur, indice visuel sans révéler les chiffres)
function maskPhone(phone: string) {
  return (phone || '').replace(/./g, '•')
}

const STATUS_LABELS: Record<string, string> = {
  EN_ATTENTE: 'En attente',
  EN_COURS: 'En cours',
  LIVRE: 'Livré',
  ANNULE: 'Annulé',
}

const STATUS_STYLES: Record<string, string> = {
  EN_ATTENTE: 'bg-blue-100 text-blue-700 hover:bg-blue-100',
  EN_COURS: 'bg-orange-100 text-orange-700 hover:bg-orange-100',
  LIVRE: 'bg-green-100 text-green-700 hover:bg-green-100',
  ANNULE: 'bg-red-100 text-red-700 hover:bg-red-100',
}

const ALL_STATUSES = ['EN_ATTENTE', 'EN_COURS', 'LIVRE', 'ANNULE']

export default function OrdersPage() {
  const queryClient = useQueryClient()

  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [revealedPhoneIds, setRevealedPhoneIds] = useState<Set<number>>(new Set())
  const [expandedOrderId, setExpandedOrderId] = useState<number | null>(null)
  const [isAddOrderOpen, setIsAddOrderOpen] = useState(false)

  const { data: orders = [], isLoading } = useQuery<Order[]>({
    queryKey: ['orders'],
    queryFn: () => fetchAllPages<Order>('/orders/'),
  })

  // La liste n'inclut pas les articles (reste légère) : on charge le détail
  // uniquement pour la commande actuellement dépliée.
  const { data: expandedOrderDetail, isLoading: expandedLoading } = useQuery<Order>({
    queryKey: ['order-detail', expandedOrderId],
    queryFn: async () => {
      const res = await api.get(`/orders/${expandedOrderId}/`)
      return res.data
    },
    enabled: !!expandedOrderId,
  })

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => api.patch(`/orders/${id}/`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['orders'] }),
    onError: (err: any) => {
      const data = err?.response?.data
      const msg = data?.status?.[0] || data?.detail || 'Erreur inconnue'
      alert("Erreur lors du changement de statut : " + msg)
    },
  })

  const toggleReveal = (id: number) => {
    setRevealedPhoneIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const stats = useMemo(() => {
    const counts: Record<string, number> = { EN_ATTENTE: 0, EN_COURS: 0, LIVRE: 0, ANNULE: 0 }
    orders.forEach(o => { counts[o.status] = (counts[o.status] || 0) + 1 })
    return counts
  }, [orders])

  const filteredOrders = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    return orders.filter(o => {
      const matchesStatus = statusFilter === 'all' || o.status === statusFilter
      const matchesSearch = !term ||
        (o.customer_name || '').toLowerCase().includes(term) ||
        (o.customer_phone || '').includes(term) ||
        String(o.id).includes(term)
      return matchesStatus && matchesSearch
    })
  }, [orders, searchTerm, statusFilter])

  return (
    <div className="flex flex-col h-full text-foreground">
      <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 space-y-8">

        {/* HEADER */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-foreground flex items-center gap-3">
              <ClipboardList className="w-8 h-8 text-primary" />
              Gestion des Commandes
            </h1>
            <p className="text-muted-foreground mt-1 text-sm font-medium">
              Commandes du site web et saisies manuellement dans l'application
            </p>
          </div>
          <Button
            onClick={() => setIsAddOrderOpen(true)}
            className="rounded-xl px-6 h-12 shadow-lg shadow-primary/25 gap-2 font-bold transition-all hover:scale-[1.02] active:scale-95"
          >
            <Plus className="w-5 h-5" />
            Nouvelle Commande
          </Button>
        </div>

        {/* STATS */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {ALL_STATUSES.map(status => (
            <Card key={status} className="p-5 border border-border/50 shadow-sm bg-card">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{STATUS_LABELS[status]}</p>
              <p className="text-2xl font-black text-foreground mt-1">{stats[status] || 0}</p>
            </Card>
          ))}
        </div>

        {/* FILTERS */}
        <Card className="p-4 border-border/50 shadow-sm bg-card/50 backdrop-blur-sm">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1 group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
              <Input
                placeholder="Rechercher par client, téléphone ou n° de commande..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-11 h-12 bg-background/50 border-border/50 focus:border-primary/50 focus:ring-primary/20 rounded-xl transition-all"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-12 px-4 rounded-xl border border-border/50 bg-background/50 text-sm font-bold focus:ring-2 focus:ring-primary outline-none transition-all"
            >
              <option value="all">Tous les statuts</option>
              {ALL_STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
            </select>
          </div>
        </Card>

        {/* LISTE */}
        <div className="space-y-4">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center p-20 gap-4">
              <Activity className="w-8 h-8 text-primary animate-spin" />
              <p className="text-muted-foreground font-medium">Chargement des commandes...</p>
            </div>
          ) : filteredOrders.length === 0 ? (
            <Card className="p-20 border-dashed border-2 flex flex-col items-center justify-center text-center rounded-3xl opacity-60">
              <ClipboardList className="w-8 h-8 text-muted-foreground mb-3" />
              <h3 className="font-bold">Aucune commande trouvée</h3>
            </Card>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-border/50 bg-card shadow-xl">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-muted/50 border-b border-border/50">
                    <th className="p-4 text-xs font-bold text-muted-foreground uppercase tracking-wider">Commande</th>
                    <th className="p-4 text-xs font-bold text-muted-foreground uppercase tracking-wider">Client</th>
                    <th className="p-4 text-xs font-bold text-muted-foreground uppercase tracking-wider">Téléphone</th>
                    <th className="p-4 text-xs font-bold text-muted-foreground uppercase tracking-wider text-center">Origine</th>
                    <th className="p-4 text-xs font-bold text-muted-foreground uppercase tracking-wider text-center">Total</th>
                    <th className="p-4 text-xs font-bold text-muted-foreground uppercase tracking-wider text-center">Statut</th>
                    <th className="p-4 text-xs font-bold text-muted-foreground uppercase tracking-wider text-right">Détails</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {filteredOrders.map((order) => {
                    const isRevealed = revealedPhoneIds.has(order.id)
                    const isExpanded = expandedOrderId === order.id
                    return (
                      <React.Fragment key={order.id}>
                        <tr
                          className={`hover:bg-muted/30 transition-colors cursor-pointer ${isExpanded ? 'bg-primary/5 border-b-0' : ''}`}
                          onClick={() => setExpandedOrderId(isExpanded ? null : order.id)}
                        >
                          <td className="p-4">
                            <span className="font-mono font-bold text-xs text-muted-foreground bg-muted px-2 py-1 rounded">CMD-{order.id}</span>
                            <p className="text-[10px] text-muted-foreground mt-1">{new Date(order.created_at).toLocaleString()}</p>
                          </td>
                          <td className="p-4 font-bold text-sm text-foreground">{order.customer_name || order.customer?.name || 'Client'}</td>
                          <td className="p-4" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs">{isRevealed ? order.customer_phone : maskPhone(order.customer_phone)}</span>
                              <button
                                type="button"
                                onClick={() => toggleReveal(order.id)}
                                className="text-muted-foreground hover:text-primary transition-colors p-1 rounded-md hover:bg-muted"
                                title={isRevealed ? 'Masquer le numéro' : 'Afficher le numéro'}
                              >
                                {isRevealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                              </button>
                            </div>
                          </td>
                          <td className="p-4 text-center">
                            <Badge variant="outline" className="gap-1 text-[9px] font-bold uppercase">
                              {order.channel === 'SITE_WEB' ? <Globe className="w-3 h-3" /> : <Store className="w-3 h-3" />}
                              {order.channel === 'SITE_WEB' ? 'Site web' : 'Application'}
                            </Badge>
                          </td>
                          <td className="p-4 text-center font-black">{Number(order.total).toLocaleString()} FCFA</td>
                          <td className="p-4 text-center" onClick={(e) => e.stopPropagation()}>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button>
                                  <Badge className={`cursor-pointer rounded-lg px-2 py-1 text-[9px] font-black uppercase ${STATUS_STYLES[order.status]}`}>
                                    {STATUS_LABELS[order.status]}
                                  </Badge>
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="center" className="w-40 rounded-xl shadow-xl border-border/50">
                                {ALL_STATUSES.filter(s => s !== order.status).map(s => (
                                  <DropdownMenuItem
                                    key={s}
                                    onClick={() => statusMutation.mutate({ id: order.id, status: s })}
                                    className="text-xs cursor-pointer"
                                  >
                                    → {STATUS_LABELS[s]}
                                  </DropdownMenuItem>
                                ))}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </td>
                          <td className="p-4 text-right">
                            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg">
                              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </Button>
                          </td>
                        </tr>

                        {isExpanded && (
                          <tr>
                            <td colSpan={7} className="p-0 bg-muted/10">
                              <div className="ml-4 mr-4 mb-4 mt-2 rounded-2xl border border-border/50 bg-background/60 overflow-hidden shadow-inner p-4 space-y-3">
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-xs">
                                  <div>
                                    <p className="text-[10px] font-bold text-muted-foreground uppercase">Adresse de livraison</p>
                                    <p className="font-semibold mt-0.5">{order.delivery_address || '—'}</p>
                                  </div>
                                  <div>
                                    <p className="text-[10px] font-bold text-muted-foreground uppercase">Paiement</p>
                                    <p className="font-semibold mt-0.5">
                                      {order.payment_mode === 'MOBILE_MONEY' ? 'Mobile Money' : 'Paiement à la livraison'}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground pt-1">
                                  <Package className="w-3 h-3" />
                                  Articles
                                </div>
                                <div className="space-y-1">
                                  {expandedLoading || expandedOrderDetail?.id !== order.id ? (
                                    <p className="text-xs text-muted-foreground italic">Chargement des articles...</p>
                                  ) : expandedOrderDetail.lines?.length ? expandedOrderDetail.lines.map(line => (
                                    <div key={line.id} className="flex items-center justify-between text-xs bg-muted/30 rounded-lg px-3 py-2">
                                      <span className="font-semibold">
                                        {line.product_detail?.name || 'Produit'}
                                        {line.variant_detail?.size || line.variant_detail?.model ? (
                                          <span className="text-muted-foreground"> — {[line.variant_detail?.size, line.variant_detail?.model].filter(Boolean).join(' / ')}</span>
                                        ) : line.variant_label ? (
                                          <span className="text-muted-foreground"> — {line.variant_label}</span>
                                        ) : null}
                                      </span>
                                      <span className="text-muted-foreground">×{line.quantity}</span>
                                      <span className="font-bold">{Number(line.line_total).toLocaleString()} FCFA</span>
                                    </div>
                                  )) : (
                                    <p className="text-xs text-muted-foreground italic">Aucun article.</p>
                                  )}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      <AddOrderModal
        isOpen={isAddOrderOpen}
        onClose={() => setIsAddOrderOpen(false)}
        onSuccess={() => setIsAddOrderOpen(false)}
      />
    </div>
  )
}
