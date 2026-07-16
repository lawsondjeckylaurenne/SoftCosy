// Client HTTP centralisé avec axios + gestion token
// ────────────────────────────────────────────────

import axios from 'axios';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000/api',
  // Ne pas définir Content-Type ici :
  // - Pour les objets JSON, Axios le définit automatiquement à 'application/json'
  // - Pour FormData (upload fichier), le browser définit 'multipart/form-data; boundary=...'
  // Forcer 'application/json' globalement empêche les uploads multipart de fonctionner
});

// Ajoute automatiquement le token dans les headers si présent
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('token');
    // N'envoie pas le token pour l'endpoint de connexion
    if (token && !config.url?.includes('/token/')) {
      config.headers.Authorization = `Token ${token}`;
    }
  }
  return config;
});

// Gère les erreurs 401 → déconnexion automatique
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && typeof window !== 'undefined') {
      localStorage.removeItem('token');
      // Évite la boucle de redirection si on est déjà sur la page de login
      if (window.location.pathname !== '/admin') {
        window.location.href = '/admin';
      }
    }
    return Promise.reject(error);
  }
);

// Récupère toutes les pages d'un endpoint paginé DRF (utile pour les listes
// qu'on veut filtrer/agréger entièrement côté client, ex: stock par variante).
export async function fetchAllPages<T = any>(url: string, params: Record<string, any> = {}): Promise<T[]> {
  let results: T[] = [];
  let page = 1;

  while (true) {
    const res = await api.get(url, { params: { ...params, page, page_size: 100 } });
    const data = res.data;
    const pageResults: T[] = Array.isArray(data) ? data : (data.results || []);
    results = results.concat(pageResults);

    const hasNext = !Array.isArray(data) && !!data.next;
    if (!hasNext) break;
    page += 1;
  }

  return results;
}

export default api;