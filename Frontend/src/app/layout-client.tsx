'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { AuthProvider, useAuth } from '@/components/AuthContext';
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from '@/lib/queryClient'
import { ThemeProvider } from '@/components/theme-provider'
import { ThemeColorsProvider } from '@/components/theme-colors-context'
import { routeMap } from '@/components/sidebar'

// Retrouve la clé de page (ex: 'products') dont la route est un préfixe du
// chemin courant — matche la route la plus spécifique en premier (utile pour
// les sous-pages comme /admin/dashboard/inventory/5).
const routeEntriesByLength = Object.entries(routeMap).sort((a, b) => b[1].length - a[1].length)
function findPageKeyForPath(pathname: string): string | null {
  for (const [key, route] of routeEntriesByLength) {
    if (pathname === route || pathname.startsWith(route + '/')) return key
  }
  return null
}

// Composant pour les routes protégées
function ProtectedRoutes({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading, user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  // Les routes publiques qui ne nécessitent pas d'authentification
  const publicRoutes = ['/admin', '/signup'];
  const isPublicRoute = publicRoutes.includes(pathname);

  // RBAC par page : une page décochée pour cet utilisateur ne doit pas être
  // accessible juste en tapant son URL (avant, seul le lien de menu était caché).
  // 'dashboard' reste toujours accessible pour éviter une boucle de redirection
  // (c'est la page d'atterrissage par défaut après connexion).
  const pageKey = !isPublicRoute ? findPageKeyForPath(pathname) : null;
  const hasPageAccess =
    !pageKey || pageKey === 'dashboard' || !user
      ? true
      : !!user.is_superuser || (user.allowed_pages || []).includes(pageKey);

  useEffect(() => {
    if (!loading && !isAuthenticated && !isPublicRoute) {
      router.push('/admin');
      return;
    }
    if (!loading && isAuthenticated && !hasPageAccess) {
      router.push('/admin/dashboard');
    }
  }, [isAuthenticated, loading, isPublicRoute, hasPageAccess, router, pathname]);

  if (loading) {
    return <div className="flex h-screen items-center justify-center">Chargement...</div>;
  }

  if (isAuthenticated && !hasPageAccess) {
    return <div className="flex h-screen items-center justify-center">Redirection...</div>;
  }

  return <>{children}</>;
}

export function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
    <ThemeColorsProvider>
    <AuthProvider>
      <ProtectedRoutes>{children}</ProtectedRoutes>
    </AuthProvider>
    </ThemeColorsProvider>
    </ThemeProvider>
    </QueryClientProvider>
  );
}
