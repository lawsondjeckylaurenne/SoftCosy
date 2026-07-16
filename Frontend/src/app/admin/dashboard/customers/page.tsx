'use client'

import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Contact,
  Plus,
  Search,
  Edit2,
  Trash2,
  Phone,
  MapPin,
  MoreHorizontal,
  Activity,
  X,
  Save,
  Loader2,
  Eye,
  EyeOff,
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

interface Customer {
  id: number
  name: string
  phone: string
  address: string | null
  created_at: string | null
}

// Masque entièrement le numéro (même longueur, pour donner un indice visuel sans révéler les chiffres)
function maskPhone(phone: string) {
  return phone.replace(/./g, '•')
}

export default function CustomersPage() {
  const queryClient = useQueryClient()
  const [searchTerm, setSearchTerm] = useState('')
  const [revealedIds, setRevealedIds] = useState<Set<number>>(new Set())

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null)
  const [formData, setFormData] = useState({ name: '', phone: '', address: '' })
  const [formError, setFormError] = useState('')

  // Queries — toutes les pages, pour ne jamais rater un client dans la recherche
  const { data: customers = [], isLoading } = useQuery<Customer[]>({
    queryKey: ['customers'],
    queryFn: () => fetchAllPages<Customer>('/customers/'),
  })

  const extractErrorMessage = (err: any) => {
    const data = err?.response?.data
    if (data?.phone) return Array.isArray(data.phone) ? data.phone[0] : data.phone
    if (data?.detail) return data.detail
    return "Erreur lors de l'enregistrement du client."
  }

  // Mutations
  const createMutation = useMutation({
    mutationFn: (newCust: any) => api.post('/customers/', newCust),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      closeModal()
    },
    onError: (err: any) => setFormError(extractErrorMessage(err)),
  })

  const updateMutation = useMutation({
    mutationFn: (cust: any) => api.patch(`/customers/${cust.id}/`, cust),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      closeModal()
    },
    onError: (err: any) => setFormError(extractErrorMessage(err)),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/customers/${id}/`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] })
    },
  })

  const openModal = (customer?: Customer) => {
    setFormError('')
    if (customer) {
      setEditingCustomer(customer)
      setFormData({ name: customer.name, phone: customer.phone, address: customer.address || '' })
    } else {
      setEditingCustomer(null)
      setFormData({ name: '', phone: '', address: '' })
    }
    setIsModalOpen(true)
  }

  const closeModal = () => {
    setIsModalOpen(false)
    setEditingCustomer(null)
    setFormData({ name: '', phone: '', address: '' })
    setFormError('')
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')
    if (editingCustomer) {
      updateMutation.mutate({ ...formData, id: editingCustomer.id })
    } else {
      createMutation.mutate(formData)
    }
  }

  const toggleReveal = (id: number) => {
    setRevealedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const filteredCustomers = customers.filter(c =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (c.phone && c.phone.includes(searchTerm))
  )

  return (
    <div className="flex flex-col h-full text-foreground">
      <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 space-y-8">
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight text-foreground flex items-center gap-3">
                <Contact className="w-8 h-8 text-primary" />
                Gestion des Clients
              </h1>
              <p className="text-muted-foreground mt-1 text-sm font-medium">
                Retrouvez vos clients pour les recontacter facilement
              </p>
            </div>
            <Button
              onClick={() => openModal()}
              className="rounded-xl px-6 h-12 shadow-lg shadow-primary/25 gap-2 font-bold transition-all hover:scale-[1.02] active:scale-95"
            >
              <Plus className="w-5 h-5" />
              Nouveau Client
            </Button>
          </div>

          {/* Search bar */}
          <Card className="p-4 border-border/50 shadow-sm bg-card/50 backdrop-blur-sm">
            <div className="relative group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
              <Input
                placeholder="Rechercher par nom ou téléphone..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-11 h-12 bg-background/50 border-border/50 focus:border-primary/50 focus:ring-primary/20 rounded-xl transition-all"
              />
            </div>
          </Card>

          {/* Liste */}
          <div className="space-y-4">
             {isLoading ? (
                <div className="flex flex-col items-center justify-center p-20 gap-4">
                  <Activity className="w-8 h-8 text-primary animate-spin" />
                  <p className="text-muted-foreground font-medium">Chargement des clients...</p>
                </div>
             ) : filteredCustomers.length === 0 ? (
                <Card className="p-20 border-dashed border-2 flex flex-col items-center justify-center text-center rounded-3xl opacity-60">
                   <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                      <Contact className="w-8 h-8 text-muted-foreground" />
                   </div>
                   <h3 className="font-bold">Aucun client trouvé</h3>
                   <p className="text-sm text-muted-foreground">Les clients sont automatiquement ajoutés lors d'une vente, ou créez-en un ici.</p>
                </Card>
             ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredCustomers.map((customer) => {
                    const isRevealed = revealedIds.has(customer.id)
                    return (
                    <Card key={customer.id} className="group hover:border-primary/50 transition-all border-border/50 shadow-sm bg-card overflow-hidden">
                       <div className="p-6 space-y-4">
                          <div className="flex items-start justify-between">
                             <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                                   <Contact className="w-5 h-5 text-primary" />
                                </div>
                                <div>
                                   <h3 className="font-bold text-foreground">{customer.name}</h3>
                                   <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">CLI-{customer.id}</p>
                                </div>
                             </div>
                             <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                   <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:bg-muted rounded-lg">
                                      <MoreHorizontal className="w-4 h-4" />
                                   </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-48 rounded-xl shadow-xl border-border/50">
                                   <DropdownMenuItem onClick={() => openModal(customer)} className="gap-2 cursor-pointer">
                                      <Edit2 className="w-4 h-4" /> Modifier
                                   </DropdownMenuItem>
                                   <DropdownMenuItem
                                      onClick={() => { if(confirm('Supprimer ce client ?')) deleteMutation.mutate(customer.id) }}
                                      className="text-destructive gap-2 focus:bg-destructive/5 focus:text-destructive cursor-pointer"
                                   >
                                      <Trash2 className="w-4 h-4" /> Supprimer
                                   </DropdownMenuItem>
                                </DropdownMenuContent>
                             </DropdownMenu>
                          </div>

                          <div className="space-y-2">
                             <div className="flex items-center gap-2 text-sm text-foreground/80">
                                <Phone className="w-4 h-4 text-primary/60 shrink-0" />
                                <span className="font-mono font-medium flex-1">
                                  {isRevealed ? customer.phone : maskPhone(customer.phone)}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => toggleReveal(customer.id)}
                                  className="text-muted-foreground hover:text-primary transition-colors p-1 rounded-md hover:bg-muted"
                                  title={isRevealed ? 'Masquer le numéro' : 'Afficher le numéro'}
                                >
                                  {isRevealed ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                             </div>
                             <div className="flex items-center gap-2 text-sm text-foreground/80">
                                <MapPin className="w-4 h-4 text-primary/60 shrink-0" />
                                <span className="font-medium line-clamp-1">{customer.address || 'Pas d\'adresse'}</span>
                             </div>
                          </div>

                          <div className="pt-4 border-t border-border/40 flex items-center justify-between">
                             <Badge variant="outline" className="text-[9px] font-bold border-border/50 text-muted-foreground uppercase">
                                {customer.created_at ? `Ajouté le ${new Date(customer.created_at).toLocaleDateString()}` : 'Date inconnue'}
                             </Badge>
                          </div>
                       </div>
                    </Card>
                  )})}
                </div>
             )}
          </div>
    </main>

      {/* Modal Créer/Modifier */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={closeModal} />
          <Card className="relative w-full max-w-md shadow-2xl border-border/50 overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-border/50 flex items-center justify-between">
              <h2 className="text-xl font-black text-foreground">
                {editingCustomer ? 'Modifier Client' : 'Nouveau Client'}
              </h2>
              <Button variant="ghost" size="icon" onClick={closeModal} className="rounded-full">
                <X className="w-5 h-5" />
              </Button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-muted-foreground uppercase">Nom du Client</label>
                <Input
                  required
                  value={formData.name}
                  onChange={e => setFormData({...formData, name: e.target.value})}
                  placeholder="Ex: M. Jean"
                  className="h-11 rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-muted-foreground uppercase">Téléphone</label>
                <Input
                  required
                  type="tel"
                  value={formData.phone}
                  onChange={e => setFormData({...formData, phone: e.target.value})}
                  placeholder="+228 90 00 00 00"
                  className="h-11 rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-muted-foreground uppercase">Adresse (optionnel)</label>
                <Input
                  value={formData.address}
                  onChange={e => setFormData({...formData, address: e.target.value})}
                  placeholder="Lomé, Togo"
                  className="h-11 rounded-xl"
                />
              </div>
              {formError && (
                <p className="text-xs font-medium text-destructive bg-destructive/10 rounded-lg px-3 py-2">{formError}</p>
              )}
              <div className="pt-4 flex gap-3">
                <Button variant="outline" type="button" onClick={closeModal} className="flex-1 rounded-xl h-11 font-bold">Annuler</Button>
                <Button disabled={createMutation.isPending || updateMutation.isPending} className="flex-1 rounded-xl h-11 font-bold gap-2">
                  {(createMutation.isPending || updateMutation.isPending) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Enregistrer
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  )
}
