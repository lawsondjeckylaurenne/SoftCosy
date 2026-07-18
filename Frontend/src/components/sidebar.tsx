'use client'

import { useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { LayoutDashboard, Package, TrendingUp, Settings, ShoppingCart, BarChart3, DollarSign, LogOut, Users, FileText, Truck, ShoppingBag, Contact, ClipboardList, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/components/AuthContext'  
import UserProfileModal from '@/components/user-profile-modal'

// ────────────────────────────────────────────────
// Types et interface des props (inchangés)
// ────────────────────────────────────────────────
interface SidebarProps {
  isOpen: boolean
  onLogout?: () => void
}

// ────────────────────────────────────────────────
// Mapping entre IDs et routes
// ────────────────────────────────────────────────
export const routeMap: Record<string, string> = {
  'dashboard': '/admin/dashboard',
  'products': '/admin/dashboard/products',
  'stocks': '/admin/dashboard/stocks',
  'cashier': '/admin/dashboard/cashier',
  'sales': '/admin/dashboard/sales',
  'orders': '/admin/dashboard/orders',
  'customers': '/admin/dashboard/customers',
  'inventory': '/admin/dashboard/inventory',
  'suppliers': '/admin/dashboard/suppliers',
  'purchases': '/admin/dashboard/purchases',
  'reports': '/admin/dashboard/reports',
  'users': '/admin/dashboard/users',
  'settings': '/admin/dashboard/settings',
}

// ────────────────────────────────────────────────
// Liste complète des éléments de menu (id, label, icône) — la visibilité
// réelle est décidée par allowed_pages (RBAC par page, par utilisateur)
// ────────────────────────────────────────────────
export const menuItems = [
  {
    id: 'dashboard',
    label: 'Tableau de bord',
    icon: LayoutDashboard,
  },
  {
    id: 'products',
    label: 'Produits',
    icon: Package,
  },
  {
    id: 'stocks',
    label: 'Stocks',
    icon: TrendingUp,
  },
  {
    id: 'cashier',
    label: 'Caisse',
    icon: DollarSign,
  },
  {
    id: 'orders',
    label: 'Commandes',
    icon: ClipboardList,
  },
  {
    id: 'sales',
    label: 'Ventes',
    icon: ShoppingCart,
  },
  {
    id: 'reports',
    label: 'Rapports',
    icon: BarChart3,
  },
  {
    id: 'inventory',
    label: 'Inventaire',
    icon: FileText,
  },
  {
    id: 'suppliers',
    label: 'Fournisseurs',
    icon: Truck,
  },
  {
    id: 'purchases',
    label: 'Achats',
    icon: ShoppingBag,
  },
  {
    id: 'customers',
    label: 'Clients',
    icon: Contact,
  },
  {
    id: 'users',
    label: 'Utilisateurs',
    icon: Users,
  },
  {
    id: 'settings',
    label: 'Paramètres',
    icon: Settings,
  },
]

// ────────────────────────────────────────────────
// Regroupement des pages en catégories repliables (accordéon) pour une
// sidebar plus lisible. "dashboard" reste seul, hors groupe, en haut.
// ────────────────────────────────────────────────
const menuGroups = [
  {
    id: 'group-products',
    label: 'Gestion des produits',
    icon: Package,
    items: ['products', 'stocks', 'cashier', 'orders'],
  },
  {
    id: 'group-sales',
    label: 'Ventes & Rapports',
    icon: ShoppingCart,
    items: ['sales', 'reports'],
  },
  {
    id: 'group-supply',
    label: 'Approvisionnement',
    icon: Truck,
    items: ['inventory', 'suppliers', 'purchases'],
  },
  {
    id: 'group-admin',
    label: 'Administration',
    icon: Settings,
    items: ['customers', 'users', 'settings'],
  },
]

export default function Sidebar({
  isOpen,
  onLogout,
}: SidebarProps) {
  const pathname = usePathname()
  // Récupère l'utilisateur connecté depuis le contexte réel (backend)
  const { user } = useAuth()
  const router = useRouter()
  
  // État pour afficher/masquer le modal de profil
  const [showProfileModal, setShowProfileModal] = useState(false)

  // ────────────────────────────────────────────────
  // Visibilité du menu = liste de pages autorisées (allowed_pages), gérée
  // par un admin depuis la page Utilisateurs (RBAC par page, par utilisateur).
  // Un superuser voit toujours tout (sécurité, ne jamais se bloquer soi-même).
  // ────────────────────────────────────────────────
  const getVisibleMenuItems = () => {
    if (!user) return []
    if (user.is_superuser) return menuItems
    const allowed = user.allowed_pages || []
    return menuItems.filter(item => allowed.includes(item.id))
  }

  // Liste filtrée des items à afficher
  const visibleItems = getVisibleMenuItems()
  const dashboardItem = visibleItems.find(item => item.id === 'dashboard')

  // Chaque groupe ne garde que ses items autorisés ; un groupe sans aucun
  // item visible n'est pas affiché du tout.
  const visibleGroups = menuGroups
    .map(group => ({
      ...group,
      children: visibleItems.filter(item => group.items.includes(item.id)),
    }))
    .filter(group => group.children.length > 0)

  // Groupes actuellement dépliés (accordéon à ouvertures multiples)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

  const toggleGroup = (groupId: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(groupId)) next.delete(groupId)
      else next.add(groupId)
      return next
    })
  }

  const isRouteActive = (id: string) => {
    const route = routeMap[id]
    if (!route) return false
    return pathname === route || (route !== '/admin/dashboard' && pathname.startsWith(route))
  }

  // Déplie automatiquement le groupe contenant la page actuellement affichée
  useEffect(() => {
    const activeGroup = menuGroups.find(group => group.items.some(id => isRouteActive(id)))
    if (activeGroup) {
      setExpandedGroups(prev => new Set(prev).add(activeGroup.id))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  return (
    <>
      {/* Overlay mobile quand sidebar ouverte */}
      {isOpen && (
        <div className="fixed inset-0 bg-black/50 z-30 md:hidden" onClick={() => { /* optionnel : fermer sidebar */ }} />
      )}

      {/* Sidebar principale */}
      <aside
        className={`fixed md:static inset-y-0 left-0 w-64 bg-sidebar border-r border-sidebar-border transform transition-transform duration-300 z-40 ${
          isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        <div className="flex flex-col h-full">
          {/* En-tête : logo + nom app */}
          <div className="flex items-center justify-between h-16 px-4 border-b border-sidebar-border">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-sidebar-primary flex items-center justify-center">
                <span className="text-sidebar-primary-foreground font-bold text-sm">
                  S&C
                </span>
              </div>
              <span className="font-bold text-sidebar-foreground hidden sm:inline">
                SoftCosy
              </span>
            </div>
          </div>

          {/* Navigation : Tableau de bord seul, puis catégories repliables */}
          <nav className="flex-1 overflow-y-auto px-3 py-6 space-y-2">
            {dashboardItem && (
              <Button
                variant={isRouteActive('dashboard') ? 'default' : 'ghost'}
                className={`w-full justify-start gap-3 text-base ${
                  isRouteActive('dashboard')
                    ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                }`}
                onClick={() => router.push(routeMap.dashboard)}
              >
                <dashboardItem.icon className="w-5 h-5" />
                <span>{dashboardItem.label}</span>
              </Button>
            )}

            {visibleGroups.map((group) => {
              const GroupIcon = group.icon
              const isExpanded = expandedGroups.has(group.id)
              const hasActiveChild = group.children.some(item => isRouteActive(item.id))

              return (
                <div key={group.id}>
                  <Button
                    variant="ghost"
                    className={`w-full justify-start gap-3 text-base ${
                      hasActiveChild
                        ? 'text-sidebar-primary font-semibold'
                        : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                    }`}
                    onClick={() => toggleGroup(group.id)}
                  >
                    <GroupIcon className="w-5 h-5" />
                    <span className="flex-1 text-left">{group.label}</span>
                    <ChevronDown
                      className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                    />
                  </Button>

                  {isExpanded && (
                    <div className="mt-1 ml-4 pl-3 border-l border-sidebar-border space-y-1">
                      {group.children.map((item) => {
                        const Icon = item.icon
                        const isActive = isRouteActive(item.id)

                        return (
                          <Button
                            key={item.id}
                            variant={isActive ? 'default' : 'ghost'}
                            className={`w-full justify-start gap-3 text-sm ${
                              isActive
                                ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                                : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                            }`}
                            onClick={() => router.push(routeMap[item.id])}
                          >
                            <Icon className="w-4 h-4" />
                            <span>{item.label}</span>
                          </Button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </nav>

          {/* Pied de sidebar : profil + déconnexion */}
          <div className="p-4 border-t border-sidebar-border space-y-3">
            {/* Bouton profil (ouvre le modal) */}
            <Button
              variant="ghost"
              className="w-full justify-start gap-3 text-sm h-auto py-3 px-4 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              onClick={() => setShowProfileModal(true)}
            >
              <div className="flex-1 text-left">
                <p className="font-medium truncate">
                  {user?.full_name || 'Utilisateur'}
                </p>
                <p className="text-xs text-sidebar-foreground/70">
                  {user?.role === 'ADMIN' ? 'Administrateur' :
                   user?.role === 'MANAGER' ? 'Manager' :
                   user?.role === 'SELLER' ? 'Vendeur' : 'Connecté'}
                </p>
              </div>
            </Button>

            {/* Bouton déconnexion */}
            <Button
              variant="outline"
              className="w-full justify-center gap-2 text-sm bg-transparent border-sidebar-border hover:bg-destructive/10 hover:text-destructive"
              onClick={onLogout}
            >
              <LogOut className="w-4 h-4" />
              Déconnexion
            </Button>
          </div>

          {/* Modal de profil (celui que tu as adapté précédemment) */}
          <UserProfileModal 
            isOpen={showProfileModal} 
            onClose={() => setShowProfileModal(false)} 
          />
        </div>
      </aside>
    </>
  )
}