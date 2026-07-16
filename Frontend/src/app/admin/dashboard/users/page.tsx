'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Edit2, Trash2, Search, Loader2, Camera, Link as LinkIcon, User as UserIcon, Lock } from 'lucide-react'
import api from '@/lib/api'
import { useAuth } from '@/components/AuthContext'
import { menuItems } from '@/components/sidebar'

// Pages par défaut à l'attribution d'un rôle (miroir de DEFAULT_PAGES_BY_ROLE
// côté backend — Backend/user/models.py) : sert uniquement à préremplir les
// cases à cocher à la création, l'admin peut ensuite tout personnaliser.
const DEFAULT_PAGES_BY_ROLE: Record<string, string[]> = {
  ADMIN: menuItems.map(m => m.id),
  MANAGER: menuItems.map(m => m.id).filter(id => id !== 'users'),
  SELLER: ['cashier', 'products', 'stocks', 'sales', 'orders', 'customers', 'inventory', 'suppliers'],
}

export default function UsersPage() {
  const { user: currentUser } = useAuth()
  const [searchTerm, setSearchTerm] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<any>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  
  const router = useRouter()
  const queryClient = useQueryClient()

  // État initial du formulaire
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    password2: '',
    role: 'SELLER',
    image: null as File | null,
    image_url: '',
    allowed_pages: DEFAULT_PAGES_BY_ROLE.SELLER as string[],
  })

  // 1. Récupération des utilisateurs réels depuis le Backend Django
  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const res = await api.get('/users/')
      return res.data.results || res.data
    }
  })

  // 2. Mutations pour la gestion CRUD
  const createMutation = useMutation({
    mutationFn: (data: FormData) => api.post('/users/', data, {
      headers: { 'Content-Type': 'multipart/form-data' }
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      setIsModalOpen(false)
      resetForm()
      alert('Utilisateur créé avec succès !')
    },
    onError: (error: any) => {
      alert(`Erreur: ${JSON.stringify(error.response?.data) || 'Échec de la création'}`)
    }
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number, data: FormData }) => api.patch(`/users/${id}/`, data, {
      headers: { 'Content-Type': 'multipart/form-data' }
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      setEditingUser(null)
      setIsModalOpen(false)
      resetForm()
      alert('Utilisateur mis à jour !')
    },
    onError: (error: any) => {
      alert(`Erreur: ${JSON.stringify(error.response?.data) || 'Échec de la mise à jour'}`)
    }
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/users/${id}/`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      alert('Utilisateur supprimé !')
    }
  })

  // 3. Filtrage et Statistiques (Données Réelles)
  const filteredUsers = useMemo(() => {
    return users.filter((user: any) => 
      user.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email?.toLowerCase().includes(searchTerm.toLowerCase())
    )
  }, [users, searchTerm])

  const stats = useMemo(() => ({
    total: users.length,
    admins: users.filter((u: any) => u.role === 'ADMIN').length,
    sellers: users.filter((u: any) => u.role === 'SELLER').length
  }), [users])

  // 4. Gestionnaires d'Actions
  const resetForm = () => {
    setFormData({
      firstName: '',
      lastName: '',
      email: '',
      password: '',
      password2: '',
      role: 'SELLER',
      image: null,
      image_url: '',
      allowed_pages: DEFAULT_PAGES_BY_ROLE.SELLER,
    })
    setImagePreview(null)
  }

  const handleEdit = (user: any) => {
    setEditingUser(user)
    const names = (user.full_name || '').split(' ')
    setFormData({
      firstName: names[0] || '',
      lastName: names.slice(1).join(' ') || '',
      email: user.email,
      password: '',
      password2: '',
      role: user.role,
      image: null,
      image_url: user.image_url || '',
      allowed_pages: user.allowed_pages || DEFAULT_PAGES_BY_ROLE[user.role] || [],
    })
    setImagePreview(user.image || user.image_url || null)
    setIsModalOpen(true)
  }

  // Quand le rôle change À LA CRÉATION uniquement, repartir des pages par
  // défaut de ce rôle (l'admin peut ensuite tout personnaliser avant d'enregistrer).
  const handleRoleChange = (role: string) => {
    setFormData(prev => ({
      ...prev,
      role,
      allowed_pages: editingUser ? prev.allowed_pages : (DEFAULT_PAGES_BY_ROLE[role] || []),
    }))
  }

  const togglePage = (pageId: string) => {
    setFormData(prev => ({
      ...prev,
      allowed_pages: prev.allowed_pages.includes(pageId)
        ? prev.allowed_pages.filter(p => p !== pageId)
        : [...prev.allowed_pages, pageId],
    }))
  }

  // Un admin ne peut pas se retirer lui-même l'accès à la page "Utilisateurs"
  // (seul endroit permettant de rétablir des permissions) — miroir de la garde backend.
  const isEditingSelf = !!editingUser && !!currentUser && editingUser.id === currentUser.id
  const isUsersCheckboxLocked = isEditingSelf && currentUser?.role === 'ADMIN'

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    const data = new FormData()
    data.append('full_name', `${formData.firstName} ${formData.lastName}`.trim())
    data.append('email', formData.email)
    data.append('role', formData.role)
    data.append('username', formData.email.split('@')[0]) // Username requis par le backend
    data.append('allowed_pages', JSON.stringify(formData.allowed_pages))
    
    if (formData.image_url) data.append('image_url', formData.image_url)
    if (formData.image) data.append('image', formData.image)

    if (editingUser) {
        if (formData.password) {
            data.append('password', formData.password)
            data.append('password2', formData.password)
        }
        updateMutation.mutate({ id: editingUser.id, data })
    } else {
        if (!formData.password) return alert('Le mot de passe est requis.')
        data.append('password', formData.password)
        data.append('password2', formData.password2 || formData.password)
        createMutation.mutate(data)
    }
  }

  return (
    <div className="flex flex-col h-full text-foreground">
      <main className="flex-1 overflow-auto p-4 md:p-8">
          <div className="max-w-6xl mx-auto space-y-8 pb-12">
            
            {/* En-tête de Page */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h1 className="text-4xl font-black tracking-tight flex items-center gap-3">
                  <UserIcon className="w-9 h-9 text-primary" />
                  Utilisateurs
                </h1>
                <p className="text-muted-foreground font-medium mt-1">Gérez les accès et les profils de votre équipe</p>
              </div>
              <Button onClick={() => { resetForm(); setIsModalOpen(true); }} className="h-12 rounded-2xl px-8 font-black shadow-xl shadow-primary/20 hover:scale-105 transition-all">
                <Plus className="w-5 h-5 mr-2" />
                Nouveau Membre
              </Button>
            </div>

            {/* Cartes de Statistiques Sommaires */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card className="p-7 border-0 shadow-xl shadow-slate-200/50 dark:shadow-none bg-white dark:bg-zinc-900 rounded-3xl group transition-all">
                <p className="text-xs font-black text-muted-foreground uppercase tracking-widest mb-2">Total Employés</p>
                <p className="text-4xl font-black text-foreground">{stats.total}</p>
              </Card>
              <Card className="p-7 border-0 shadow-xl shadow-slate-200/50 dark:shadow-none bg-white dark:bg-zinc-900 rounded-3xl group transition-all">
                <p className="text-xs font-black text-primary uppercase tracking-widest mb-2">Administrateurs</p>
                <p className="text-4xl font-black text-primary">{stats.admins}</p>
              </Card>
              <Card className="p-7 border-0 shadow-xl shadow-slate-200/50 dark:shadow-none bg-white dark:bg-zinc-900 rounded-3xl group transition-all">
                <p className="text-xs font-black text-orange-500 uppercase tracking-widest mb-2">Vendeurs</p>
                <p className="text-4xl font-black text-orange-500">{stats.sellers}</p>
              </Card>
            </div>

            {/* Moteur de Recherche */}
            <div className="relative group">
              <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground group-focus-within:text-primary transition-colors" />
              <Input
                placeholder="Rechercher par nom, prénom ou email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-14 h-16 rounded-3xl border-0 shadow-2xl shadow-slate-200/40 dark:shadow-none bg-white dark:bg-zinc-900 text-lg font-semibold ring-primary focus-visible:ring-2 transition-all"
              />
            </div>


            {/* Grille d'Affichage des Membres d'Équipe */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {isLoading ? (
                <div className="col-span-full py-32 flex flex-col items-center justify-center">
                    <Loader2 className="w-16 h-16 animate-spin text-primary mb-6" />
                    <p className="font-black text-muted-foreground uppercase tracking-widest">Syncronisation avec le backend...</p>
                </div>
              ) : filteredUsers.length === 0 ? (
                <div className="col-span-full py-32 text-center bg-white dark:bg-zinc-900 rounded-[3rem] border-4 border-dashed border-slate-100 dark:border-zinc-800">
                    <UserIcon className="w-20 h-20 text-muted-foreground/10 mx-auto mb-6" />
                    <p className="text-muted-foreground font-black text-xl">Aucun collaborateur trouvé pour cette recherche.</p>
                </div>
              ) : (
                filteredUsers.map((user: any) => (
                  <Card key={user.id} className="p-8 border-0 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.05)] dark:shadow-none bg-white dark:bg-zinc-900 rounded-[2.5rem] group relative overflow-hidden transition-all duration-500 hover:-translate-y-2 hover:shadow-2xl">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-bl-full -mr-16 -mt-16 group-hover:bg-primary/10 transition-all duration-500" />
                    
                    <div className="flex items-start justify-between mb-8 relative z-10">
                        <div className="w-20 h-20 rounded-3xl bg-slate-50 dark:bg-zinc-800 overflow-hidden border-4 border-white dark:border-zinc-700 shadow-xl">
                            {user.image || user.image_url ? (
                                <img src={user.image || user.image_url} className="w-full h-full object-cover" alt={user.full_name} />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-3xl font-black text-primary/40">
                                    {user.full_name?.charAt(0)}
                                </div>
                            )}
                        </div>
                        <div className="flex gap-2">
                            <Button variant="ghost" size="sm" onClick={() => handleEdit(user)} className="rounded-2xl w-10 h-10 p-0 hover:bg-primary/10 hover:text-primary transition-colors">
                                <Edit2 className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => { if(confirm(`Voulez-vous vraiment révoquer l'accès de ${user.full_name} ?`)) deleteMutation.mutate(user.id) }} className="rounded-2xl w-10 h-10 p-0 hover:bg-destructive/10 hover:text-destructive transition-colors">
                                <Trash2 className="w-4 h-4" />
                            </Button>
                        </div>
                    </div>

                    <div className="space-y-1 relative z-10">
                        <h4 className="font-black text-2xl truncate tracking-tight text-foreground">{user.full_name}</h4>
                        <p className="text-sm text-muted-foreground font-bold truncate mb-6 pb-2 border-b border-slate-50 dark:border-zinc-800">{user.email}</p>
                    </div>

                    <div className="flex items-center justify-between mt-8 relative z-10">
                        <span className={`px-5 py-2 rounded-2xl text-[10px] font-black tracking-widest uppercase shadow-sm ${
                            user.role === 'ADMIN' ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-zinc-800 text-muted-foreground'
                        }`}>
                            {user.role === 'ADMIN' ? 'Administrateur' : 'Vendeur'}
                        </span>
                        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${user.is_active ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-50 text-slate-400'}`}>
                            <div className={`w-2.5 h-2.5 rounded-full animate-pulse ${user.is_active ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                            <span className="text-[10px] font-black uppercase tracking-tighter">{user.is_active ? 'Compte Actif' : 'Désactivé'}</span>
                        </div>
                    </div>
                  </Card>
                ))
              )}
            </div>
          </div>
    </main>

    {isModalOpen && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => { setIsModalOpen(false); setEditingUser(null); }} />
        <Card className="relative w-full max-w-4xl shadow-2xl bg-white dark:bg-zinc-900 rounded-[2.5rem] overflow-hidden animate-in zoom-in-95 duration-200">
          <div className="p-8 border-b border-slate-50 dark:border-zinc-800 flex items-center justify-between bg-slate-50/50 dark:bg-zinc-800/50">
            <div>
              <h2 className="text-3xl font-black text-foreground">
                {editingUser ? 'Modifier Profil' : 'Nouveau Collaborateur'}
              </h2>
              <p className="text-muted-foreground font-bold text-xs uppercase tracking-widest mt-1">
                {editingUser ? 'Mise à jour des accès et informations' : 'Définition des accès plateforme'}
              </p>
            </div>
            <Button variant="ghost" size="icon" onClick={() => { setIsModalOpen(false); setEditingUser(null); }} className="rounded-2xl hover:bg-slate-200 w-12 h-12">
              ✕
            </Button>
          </div>
          
          <form onSubmit={handleSubmit} className="p-8 space-y-8 max-h-[75vh] overflow-y-auto overflow-x-hidden">
            <div className="flex flex-col lg:flex-row gap-10 items-start">
                {/* Zone de Photo de Profil Dynamique */}
                <div className="flex flex-col items-center gap-4 w-full lg:w-auto shrink-0">
                    <div className="w-40 h-40 rounded-[2rem] bg-slate-100 dark:bg-zinc-800 overflow-hidden border-8 border-white dark:border-zinc-800 shadow-2xl flex items-center justify-center relative group transition-transform hover:scale-105">
                        {imagePreview ? (
                            <img src={imagePreview} className="w-full h-full object-cover" alt="Aperçu" />
                        ) : (
                            <UserIcon className="w-16 h-16 text-muted-foreground/20" />
                        )}
                        <label className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center cursor-pointer transition-opacity duration-300">
                            <Camera className="w-8 h-8 text-white mb-2" />
                            <span className="text-[10px] text-white font-black uppercase tracking-tighter">Changer</span>
                            <input 
                                type="file" 
                                className="hidden" 
                                accept="image/*"
                                onChange={(e) => {
                                    const file = e.target.files?.[0]
                                    if (file) {
                                        setFormData({ ...formData, image: file })
                                        setImagePreview(URL.createObjectURL(file))
                                    }
                                }} 
                            />
                        </label>
                    </div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">Identité visuelle</p>
                </div>

                {/* Grille des Informations Utilisateur */}
                <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
                    <div className="space-y-2">
                        <label className="text-[11px] font-black uppercase text-muted-foreground/70 px-1 tracking-widest">Prénom</label>
                        <Input required value={formData.firstName} onChange={(e) => setFormData({...formData, firstName: e.target.value})} className="h-14 rounded-2xl bg-slate-50 dark:bg-zinc-800 border-0 font-bold" />
                    </div>
                    <div className="space-y-2">
                        <label className="text-[11px] font-black uppercase text-muted-foreground/70 px-1 tracking-widest">Nom</label>
                        <Input required value={formData.lastName} onChange={(e) => setFormData({...formData, lastName: e.target.value})} className="h-14 rounded-2xl bg-slate-50 dark:bg-zinc-800 border-0 font-bold" />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                        <label className="text-[11px] font-black uppercase text-muted-foreground/70 px-1 tracking-widest">Email professionnel</label>
                        <Input required type="email" value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} className="h-14 rounded-2xl bg-slate-50 dark:bg-zinc-800 border-0 font-bold" />
                    </div>
                    
                    <div className="space-y-2">
                        <label className="text-[11px] font-black uppercase text-muted-foreground/70 px-1 tracking-widest">Rôle Système</label>
                        <select
                            value={formData.role}
                            onChange={(e) => handleRoleChange(e.target.value)}
                            className="w-full h-14 rounded-2xl bg-slate-50 dark:bg-zinc-800 border-0 px-5 font-black text-sm outline-none ring-primary focus:ring-2 transition-all appearance-none"
                        >
                            <option value="SELLER">🛒 Vendeur / Caissier</option>
                            <option value="ADMIN">👨‍💼 Administrateur</option>
                            <option value="MANAGER">📈 Gestionnaire de Stock</option>
                        </select>
                    </div>

                    <div className="space-y-2">
                        <label className="text-[11px] font-black uppercase text-muted-foreground/70 px-1 tracking-widest flex items-center gap-2">
                            <LinkIcon className="w-3 h-3" /> Lien Photo (Web)
                        </label>
                        <Input value={formData.image_url} onChange={(e) => { setFormData({...formData, image_url: e.target.value}); if(!formData.image) setImagePreview(e.target.value); }} className="h-14 rounded-2xl bg-slate-50 dark:bg-zinc-800 border-0" placeholder="https://..." />
                    </div>

                    <div className="space-y-2">
                        <label className="text-[11px] font-black uppercase text-muted-foreground/70 px-1 tracking-widest">Mot de passe</label>
                        <Input type="password" required={!editingUser} value={formData.password} onChange={(e) => setFormData({...formData, password: e.target.value})} className="h-14 rounded-2xl bg-slate-50 dark:bg-zinc-800 border-0" />
                    </div>
                    {!editingUser && (
                        <div className="space-y-2">
                            <label className="text-[11px] font-black uppercase text-muted-foreground/70 px-1 tracking-widest">Confirmer le passe</label>
                            <Input type="password" required value={formData.password2} onChange={(e) => setFormData({...formData, password2: e.target.value})} className="h-14 rounded-2xl bg-slate-50 dark:bg-zinc-800 border-0" />
                        </div>
                    )}
                </div>
            </div>

            {/* Pages autorisées — RBAC par page, par utilisateur */}
            <div className="space-y-3 pt-6 border-t border-border/50">
                <div>
                    <label className="text-[11px] font-black uppercase text-muted-foreground/70 px-1 tracking-widest">Pages autorisées</label>
                    <p className="text-xs text-muted-foreground px-1 mt-1">Détermine les pages visibles et utilisables par ce compte, dans l'application.</p>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                    {menuItems.map((item) => {
                        const Icon = item.icon
                        const checked = formData.allowed_pages.includes(item.id)
                        const locked = item.id === 'users' && isUsersCheckboxLocked
                        return (
                            <label
                                key={item.id}
                                className={`flex items-center gap-2 p-3 rounded-2xl border-2 transition-all ${
                                    checked ? 'border-primary bg-primary/5' : 'border-slate-100 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-800'
                                } ${locked ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
                                title={locked ? "Vous ne pouvez pas vous retirer vous-même l'accès à cette page" : undefined}
                            >
                                <input
                                    type="checkbox"
                                    checked={checked}
                                    disabled={locked}
                                    onChange={() => togglePage(item.id)}
                                    className="w-4 h-4 accent-primary shrink-0"
                                />
                                <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
                                <span className="text-xs font-bold truncate flex-1">{item.label}</span>
                                {locked && <Lock className="w-3 h-3 text-muted-foreground shrink-0" />}
                            </label>
                        )
                    })}
                </div>
            </div>

            <div className="flex gap-4 pt-6 border-t border-border/50">
              <Button variant="outline" type="button" onClick={() => { setIsModalOpen(false); setEditingUser(null); }} className="flex-1 h-14 rounded-[1.5rem] font-black uppercase tracking-widest text-xs border-2 border-slate-200 dark:border-zinc-800">
                Annuler
              </Button>
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending} className="flex-1 h-14 rounded-[1.5rem] font-black text-sm shadow-xl shadow-primary/30 active:scale-95 transition-all flex gap-3">
                {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="w-5 h-5 animate-spin" />}
                {editingUser ? 'Mettre à jour le profil' : 'Créer le Compte'}
              </Button>
            </div>
          </form>
        </Card>
      </div>
    )}
    </div>
  )
}
