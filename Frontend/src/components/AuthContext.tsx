// Contexte d’authentification moderne avec backend réel
// ────────────────────────────────────────────────

'use client';

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { login, logout, getCurrentUser, isAuthenticated, AuthUser } from '@/lib/auth';
import api from '@/lib/api';

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasToken, setHasToken] = useState(false);

  // Charge l’utilisateur au montage (depuis le cache local, pour un affichage immédiat)
  useEffect(() => {
    const storedUser = getCurrentUser();
    if (storedUser && isAuthenticated()) {
      setUser(storedUser);
    }
    setHasToken(isAuthenticated());
    setLoading(false);
  }, []);

  // Resynchronise le profil (rôle, pages autorisées) depuis le serveur en
  // arrière-plan : quand un admin change les permissions d'un utilisateur
  // déjà connecté, ça doit s'appliquer sans qu'il ait à se déconnecter/
  // reconnecter — la sidebar et le garde de route lisent tous deux
  // user.allowed_pages, donc les rafraîchir ici suffit à tout mettre à jour.
  useQuery({
    queryKey: ['auth-me-sync'],
    queryFn: async () => {
      const res = await api.get('/users/me/');
      const fresh: AuthUser = res.data;
      localStorage.setItem('user', JSON.stringify(fresh));
      setUser(fresh);
      return fresh;
    },
    enabled: hasToken,
    refetchInterval: 15000,
    refetchOnWindowFocus: true,
    refetchOnMount: false,
    retry: false,
  });

  const signIn = async (email: string, password: string) => {
    setLoading(true);
    try {
      const loggedUser = await login(email, password);
      setUser(loggedUser);
      setHasToken(true);
    } catch (error) {
      console.error('Échec connexion:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const signOut = () => {
    logout();
    setUser(null);
    setHasToken(false);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        signIn,
        signOut,
        isAuthenticated: !!user && isAuthenticated(),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth doit être utilisé dans AuthProvider');
  }
  return context;
}