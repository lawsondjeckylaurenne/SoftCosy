'use client'

import { useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { LayoutDashboard, Package, TrendingUp, Settings, ShoppingCart, BarChart3, DollarSign, LogOut, Users, FileText, Truck, ShoppingBag, Contact, ClipboardList } from 'lucide-react'
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
// Liste complète des éléments de menu
// Chaque item a un id, un label, une icône, et optionnellement "adminOnly"
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
    id: 'sales',
    label: 'Ventes',
    icon: ShoppingCart,
  },
  {
    id: 'orders',
    label: 'Commandes',
    icon: ClipboardList,
  },
  {
    id: 'customers',
    label: 'Clients',
    icon: Contact,
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
    id: 'reports',
    label: 'Rapports',
    icon: BarChart3,
    adminOnly: true,  // ← visible uniquement pour ADMIN et MANAGER
  },
  {
    id: 'users',
    label: 'Utilisateurs',
    icon: Users,
    adminOnly: true,  // ← visible uniquement pour ADMIN
  },
  {
    id: 'settings',
    label: 'Paramètres',
    icon: Settings,
    adminOnly: true,  // ← visible uniquement pour ADMIN
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

          {/* Navigation : liste des menus filtrés par rôle */}
          <nav className="flex-1 overflow-y-auto px-3 py-6 space-y-2">
            {visibleItems.map((item) => {
              const Icon = item.icon
              const route = routeMap[item.id]
              const isActive = pathname === route || (route !== '/admin/dashboard' && pathname.startsWith(route))

              return (
                <Button
                  key={item.id}
                  variant={isActive ? 'default' : 'ghost'}
                  className={`w-full justify-start gap-3 text-base ${
                    isActive
                      ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                      : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                  }`}
                  onClick={() => {
                    if (route) {
                      router.push(route)
                    }
                  }}
                >
                  <Icon className="w-5 h-5" />
                  <span>{item.label}</span>
                </Button>
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