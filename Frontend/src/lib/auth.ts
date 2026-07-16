// Fonctions d’authentification qui appellent le backend
// ────────────────────────────────────────────────

import api from './api';
import { jwtDecode } from 'jwt-decode'; // npm install jwt-decode

// Interface utilisateur attendue depuis le backend
export interface AuthUser {
  id: number;
  email: string;
  full_name: string;
  role: 'ADMIN' | 'SELLER' | 'MANAGER';
  is_active: boolean;
  is_superuser?: boolean;
  // Pages du menu que cet utilisateur peut voir/utiliser (RBAC par page, par utilisateur)
  allowed_pages?: string[];
  phone?: number;
  address?: string;
}

// Connexion → récupère le token et le stocke
export const login = async (email: string, password: string): Promise<AuthUser> => {
  const res = await api.post('/token/', { email, password });
  const { token } = res.data;

  // Stocke le token
  localStorage.setItem('token', token);

  // Récupère les infos utilisateur
  const userRes = await api.get('/users/me/');
  const user = userRes.data;

  // Stocke l'utilisateur (sans mot de passe)
  localStorage.setItem('user', JSON.stringify(user));

  return user;
};

// Déconnexion
export const logout = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  window.location.href = '/admin';
};

// Récupère l'utilisateur connecté depuis localStorage (ou null)
export const getCurrentUser = (): AuthUser | null => {
  if (typeof window === 'undefined') return null;
  const stored = localStorage.getItem('user');
  return stored ? JSON.parse(stored) : null;
};

// Vérifie si l'utilisateur est connecté (token présent)
export const isAuthenticated = (): boolean => {
  return !!localStorage.getItem('token');
};