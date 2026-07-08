# SoftCosy — Documentation Technique Complète

> Plateforme unifiée Soft&Cosy : boutique en ligne (vêtements de sport, marché de Lomé, Togo)
> **et** système de gestion commerciale (POS, stocks, achats, inventaires, rapports), servis
> depuis un seul frontend et un seul backend.
> Version : 2.0 — Dernière mise à jour : Juillet 2026 (fusion frontend site + app)

---

## Table des matières

1. [Vue d'ensemble](#1-vue-densemble)
2. [Architecture générale](#2-architecture-générale)
3. [Backend — Django](#3-backend--django)
4. [Frontend — Next.js (site vitrine + application de gestion)](#4-frontend--nextjs-site-vitrine--application-de-gestion)
5. [Base de données — PostgreSQL / Supabase](#5-base-de-données--postgresql--supabase)
6. [Stockage des images](#6-stockage-des-images)
7. [Fonctionnalités détaillées](#7-fonctionnalités-détaillées)
8. [Déploiement](#8-déploiement)
9. [Rôles et permissions](#9-rôles-et-permissions)
10. [Flux de travail principaux](#10-flux-de-travail-principaux)
11. [Sécurité](#11-sécurité)
12. [Maintenance et opérations](#12-maintenance-et-opérations)
13. [Guide de développement local](#13-guide-de-développement-local)
14. [Historique des fusions](#14-historique-des-fusions)

---

## 1. Vue d'ensemble

**SoftCosy** est désormais un projet unique qui réunit deux produits historiquement séparés :

- **Soft&Cosy**, la boutique en ligne (vêtements de sport Nike, Adidas, Under Armour) — servie
  à la racine du domaine.
- **SoftCosy**, l'application de gestion commerciale interne (caisse, stocks, achats,
  inventaires, rapports) — servie sous `/admin`.

Les deux partagent **un seul frontend Next.js**, **un seul backend Django** et **une seule base
de données Supabase**. Django est la source unique de vérité pour les produits : un produit créé
dans l'application de gestion apparaît automatiquement sur la boutique.

**Application en production** :
- Site + Application (unifiés) : `https://softcosy.store` (`/` = boutique, `/admin` = gestion)
- Backend API : `https://softcosy-backend.onrender.com/api`
- Documentation API : `https://softcosy-backend.onrender.com/api/docs/`

**Créé par** : [Virkas](https://wa.me/+22893953658)

---

## 2. Architecture générale

```
┌───────────────────────────────────────────────────────────────────┐
│                      UTILISATEUR (Browser)                        │
│        softcosy.store/          softcosy.store/admin              │
└───────────────┬───────────────────────────┬───────────────────────┘
                │                            │
                ▼                            ▼
┌───────────────────────────────────────────────────────────────────┐
│         FRONTEND UNIFIÉ — Next.js 16 (Vercel)                      │
│                                                                     │
│  '/'  → Route Handler (src/app/route.ts)                          │
│         sert le HTML/CSS/JS statique de la boutique (site/)       │
│         AUCUN provider React, AUCUNE auth — vitrine 100% publique  │
│                                                                     │
│  '/admin', '/admin/dashboard/**' → App Router React                │
│         Login + application de gestion (Tailwind, shadcn/ui,       │
│         React Query, AuthContext)                                  │
└───────────────┬───────────────────────────┬───────────────────────┘
                │ fetch('/api/site/...')     │ axios + Token DRF
                │ (public, sans auth)        │ Authorization: Token xxx
                ▼                            ▼
┌───────────────────────────────────────────────────────────────────┐
│           BACKEND — Django 6 (Render.com)                         │
│    DRF · Gunicorn · WhiteNoise · django-axes · boto3 · Cloudinary  │
│             softcosy-backend.onrender.com                          │
└──────────┬──────────────────────┬───────────────────┬─────────────┘
           │ PostgreSQL SSL       │ S3 API              │ API Cloudinary
┌──────────▼──────────┐  ┌────────▼────────────┐  ┌─────▼─────────────┐
│  Supabase Database  │  │ Supabase Storage     │  │ Cloudinary         │
│  PostgreSQL 15       │  │ (S3-compat., photos  │  │ (photos produits   │
│  (source unique)     │  │  profils utilisateurs)│  │  boutique/gestion) │
└──────────────────────┘  └───────────────────────┘  └────────────────────┘
```

**Point clé de l'architecture** : la boutique (`/`) n'est **pas** une page React. C'est un
document HTML statique (index.html + style.css + un unique `<script>` inline vanilla JS) servi
tel quel par un Route Handler Next.js, afin de garantir un comportement identique à l'ancien
site indépendant (panier, modal produit, checkout WhatsApp) — voir [section 4](#4-frontend--nextjs-site-vitrine--application-de-gestion)
pour le détail technique et pourquoi une page React classique (`dangerouslySetInnerHTML`) a été
écartée.

---

## 3. Backend — Django

### 3.1 Stack et dépendances

| Package | Version | Rôle |
|---------|---------|------|
| **Django** | 6.0.2 | Framework web principal |
| **djangorestframework** | 3.16.1 | API REST |
| **drf-spectacular** | 0.29.0 | Documentation API (Swagger/ReDoc) |
| **django-cors-headers** | 4.9.0 | Gestion des headers CORS |
| **django-axes** | 8.3.1 | Protection brute-force (lockout) |
| **django-filter** | latest | Filtres avancés sur les ViewSets |
| **psycopg2-binary** | 2.9.11 | Driver PostgreSQL |
| **Pillow** | 12.2.0 | Traitement des images |
| **argon2-cffi** | 23.1.0 | Hachage des mots de passe (Argon2) |
| **gunicorn** | latest | Serveur WSGI en production |
| **whitenoise** | latest | Serveur de fichiers statiques |
| **django-storages[s3]** | latest | Stockage S3 (Supabase) |
| **boto3** | latest | Client AWS/S3 |
| **cloudinary** | latest | Upload/suppression d'images produits (boutique) |
| **reportlab** | 4.2.5 | Génération de PDFs |
| **google-api-python-client** | 2.162.0 | API Google Drive (backups) |
| **python-dotenv** | 1.0.1 | Chargement du fichier `.env` |
| **APScheduler** | 3.11.2 | Planification de tâches |

### 3.2 Structure des applications

Le projet Django contient **7 applications** :

```
Backend/
├── gestion_softcosy/        # Projet principal (settings, urls, wsgi)
│   ├── settings.py          # Configuration globale (CORS, ALLOWED_HOSTS, storage...)
│   ├── urls.py               # URLs racines (inclut /api/site/ pour la boutique)
│   ├── pagination.py         # FlexiblePagination (défaut 20, max 100)
│   └── utils.py              # axes_lockout_json (réponse 403 JSON)
├── user/                    # Gestion des utilisateurs
├── product/                 # Catalogue produits, catégories, images, endpoints boutique
├── sale/                    # Ventes et clients
├── purchase/                # Achats et fournisseurs
├── stockmouvement/          # Stocks, mouvements, paramètres système
├── inventorycount/          # Inventaires physiques
└── dashboard/                # Analytics et rapports
```

**Middleware actif (dans l'ordre d'exécution)** :

1. `corsheaders.CorsMiddleware` — Headers CORS (doit être en premier)
2. `axes.AxesMiddleware` — Protection brute-force
3. `SecurityMiddleware` — Headers de sécurité HTTP
4. `whitenoise.WhiteNoiseMiddleware` — Fichiers statiques compressés
5. `SessionMiddleware` — Gestion des sessions
6. `CommonMiddleware` — Utilitaires HTTP standard
7. `CsrfViewMiddleware` — Protection CSRF
8. `AuthenticationMiddleware` — Injection de `request.user`
9. `MessageMiddleware` — Flash messages
10. `XFrameOptionsMiddleware` — Protection clickjacking
11. `DebugToolbarMiddleware` — *(uniquement si `DEBUG=True`)*

### 3.3 Modèles de données (Base de données)

#### Table `user` (application `user`)

| Champ | Type | Description |
|-------|------|-------------|
| `id` | AutoField PK | Identifiant |
| `email` | EmailField UNIQUE | **Identifiant principal** (pas le username) |
| `username` | CharField UNIQUE nullable | Optionnel |
| `full_name` | CharField(50) | Nom complet |
| `phone` | IntegerField nullable | Téléphone |
| `address` | TextField nullable | Adresse |
| `role` | CharField | `ADMIN` \| `SELLER` \| `MANAGER` |
| `is_active` | BooleanField | `False` par défaut — l'admin doit activer |
| `is_staff` | BooleanField | Accès à l'admin Django |
| `is_superuser` | BooleanField | Super-administrateur |
| `image` | ImageField nullable | Photo de profil (stockée S3 ou local) |
| `image_url` | URLField nullable | URL externe de la photo |
| `created_at` | DateField auto | Date de création |

#### Table `category` (application `product`)

| Champ | Type | Description |
|-------|------|-------------|
| `id` | AutoField PK | Identifiant |
| `name` | CharField(255) | Nom de la catégorie |
| `description` | TextField nullable | Description |
| `image_url` | CharField nullable | URL de l'image |
| `created_at` | DateTimeField auto | Date de création |

#### Table `product` (application `product`)

| Champ | Type | Description |
|-------|------|-------------|
| `id` | AutoField PK | Identifiant |
| `name` | CharField(255) | Nom du produit |
| `description` | TextField nullable | Description |
| `code_produit` | CharField | Code auto-généré : `PROD-00001` |
| `image` | ImageField nullable | Image principale historique (S3 ou local, conservée pour compat.) |
| `image_url` | CharField nullable | URL externe historique (conservée pour compat.) |
| `category` | FK → Category | Catégorie (SET_NULL si supprimée) |
| `brand` | CharField(100) | Marque (Nike, Adidas...) — filtrage boutique |
| `badge` | CharField(20) nullable | `NEW` \| `BESTSELLER` \| `HOT` \| `SET` \| `CLASSIC` |
| `icon` | CharField(10) | Emoji affiché si pas d'image (défaut `👕`) |
| `fabric` | TextField | Composition du tissu |
| `colors` | JSONField | Tableau de codes hex : `["#111111", "#ffffff"]` |
| `is_published` | BooleanField | Contrôle l'affichage sur la boutique (défaut `True`) |

> Les champs `brand`, `badge`, `icon`, `fabric`, `colors`, `is_published` ont été ajoutés lors de
> la fusion backend (voir [section 14.1](#141-fusion-backend--django-source-unique-de-vérité))
> pour que Django puisse alimenter la boutique en plus de l'application de gestion.

#### Table `productimage` (application `product`)

| Champ | Type | Description |
|-------|------|-------------|
| `id` | AutoField PK | Identifiant |
| `product` | FK → Product (`related_name='product_images'`) | Produit parent (CASCADE) |
| `image_url` | CharField(500) | URL Cloudinary |
| `cloudinary_public_id` | CharField(255) | Identifiant public Cloudinary (pour suppression) |
| `order` | PositiveIntegerField | Ordre d'affichage (1ère image = photo principale) |

Un produit peut avoir plusieurs photos (galerie), affichées dans cet ordre sur la boutique et
dans le formulaire produit de l'application de gestion.

#### Table `variant` (application `product`)

| Champ | Type | Description |
|-------|------|-------------|
| `id` | AutoField PK | Identifiant |
| `product` | FK → Product | Produit parent (CASCADE) |
| `sku` | CharField | Code auto-généré : `SKU-00001` |
| `barcode` | CharField nullable | Code-barres |
| `model` | CharField nullable | Modèle/référence |
| `size` | CharField nullable | Taille/pointure |
| `selling_price` | DecimalField(10,2) | Prix de vente |
| `cost_price` | DecimalField nullable | Prix de revient |
| `attributes` | JSONField nullable | Attributs libres (couleur, spec, etc.) |
| `is_active` | BooleanField | Actif/inactif |
| `created_or_updated_at` | DateField auto | Date MAJ |

#### Table `stock` (application `stockmouvement`)

| Champ | Type | Description |
|-------|------|-------------|
| `id` | AutoField PK | Identifiant |
| `variant` | FK → Variant | Variante concernée (CASCADE) |
| `on_hand_qty` | IntegerField | Quantité physique en stock |
| `reserved_qty` | IntegerField | Quantité réservée pour commandes |
| `available_qty` | IntegerField | Calculé : `on_hand_qty - reserved_qty` |
| `last_counted_at` | DateField nullable | Dernier inventaire |
| `created_or_updated_at` | DateTimeField auto | Date MAJ |

> **Note** : Un enregistrement Stock est créé automatiquement (via signal) quand une variante est créée.

#### Table `stockmovement` (application `stockmouvement`)

| Champ | Type | Description |
|-------|------|-------------|
| `id` | AutoField PK | Identifiant |
| `stock` | FK → Stock nullable | Stock concerné |
| `product` | FK → Product nullable | Produit (SET_NULL) |
| `sale_line` | FK → SaleLine nullable | Lien vers la ligne de vente (SET_NULL) |
| `purchase_line` | FK → PurchaseLine nullable | Lien vers la ligne d'achat (SET_NULL) |
| `user` | FK → User nullable | Utilisateur responsable (SET_NULL) |
| `movement_type` | CharField | `ENTREE` \| `SORTIE` \| `AJUSTEMENT` |
| `quantite` | IntegerField | Quantité déplacée |
| `reason` | CharField | Motif (voir liste complète ci-dessous) |
| `date` | DateField auto | Date du mouvement |
| `notes` | TextField nullable | Notes libres |

**Motifs disponibles** :
- `ACHAT_FOURNISSEUR` — Réception achat
- `RETOUR_TEST` — Retour test
- `CORRECTION_INVENTAIRE` — Correction après inventaire
- `CADEAU_PROMO` — Cadeau/promotion
- `VENTE` — Vente en caisse (automatique)
- `SORTIE_MAGASIN` — Sortie physique
- `CASSE_PERTE` — Casse ou perte
- `ECHANTILLON` — Échantillon
- `INVENTAIRE_ANNUEL` — Inventaire annuel
- `CORRECTION_MANUELLE` — Correction manuelle
- `PEREMPTION` — Péremption
- `RETOUR_CLIENT` — Retour client (remboursement)
- `REMBOURSEMENT` — Remboursement
- `AUTRE` — Autre motif

#### Table `systemsettings` (application `stockmouvement`)

Singleton — une seule ligne avec `id=1`.

| Champ | Type | Description |
|-------|------|-------------|
| `low_stock_threshold` | IntegerField | Seuil d'alerte stock bas (défaut : 10) |
| `critical_stock_threshold` | IntegerField | Seuil critique (défaut : 5) |
| `notify_low_stock` | BooleanField | Activer alertes stock bas |
| `notify_system_updates` | BooleanField | Alertes mises à jour système |
| `notify_weekly_report` | BooleanField | Rapport hebdomadaire |

#### Table `customer` (application `sale`)

| Champ | Type | Description |
|-------|------|-------------|
| `id` | AutoField PK | Identifiant |
| `name` | CharField(255) | Nom du client |
| `phone` | CharField nullable | Téléphone |
| `address` | CharField nullable | Adresse |
| `created_at` | DateField nullable | Date création |

#### Table `sale` (application `sale`)

| Champ | Type | Description |
|-------|------|-------------|
| `id` | AutoField PK | Identifiant |
| `invoice_number` | IntegerField nullable | Numéro de facture séquentiel |
| `user` | FK → User nullable | Vendeur qui a effectué la vente (SET_NULL) |
| `customer` | FK → Customer nullable | Client enregistré (SET_NULL) |
| `customer_name` | CharField nullable | Nom client rapide (sans fiche) |
| `sold_at` | DateTimeField nullable | Horodatage de la vente |
| `channel` | CharField | `store` (magasin) \| `enLigne` (en ligne) |
| `subtotal` | DecimalField | Sous-total calculé |
| `discount_amount` | DecimalField | Remise globale (défaut : 0) |
| `total` | DecimalField | Total : `subtotal - discount_amount` |
| `status` | CharField | `PAYE` \| `NONPAYE` \| `PARTIEL` |
| `notes` | TextField nullable | Notes |
| `created_at` | DateTimeField auto | Date création |

#### Table `saleline` (application `sale`)

| Champ | Type | Description |
|-------|------|-------------|
| `id` | AutoField PK | Identifiant |
| `sale` | FK → Sale | Vente parente (CASCADE) |
| `product` | FK → Product | Produit (PROTECT) |
| `variant` | FK → Variant nullable | Variante choisie (SET_NULL) |
| `quantity` | IntegerField | Quantité vendue |
| `unit_price` | DecimalField | Prix unitaire au moment de la vente |
| `line_discount` | DecimalField | Remise sur la ligne (défaut : 0) |
| `line_total` | DecimalField | `(qty × prix_unit) - remise_ligne` |
| `created_at` | DateTimeField auto | Date création |

> **Signal** : La création d'une SaleLine crée automatiquement un StockMovement SORTIE. La suppression crée un StockMovement ENTREE (retour client).

#### Table `supplier` (application `purchase`)

| Champ | Type | Description |
|-------|------|-------------|
| `id` | AutoField PK | Identifiant |
| `name` | CharField(255) | Nom du fournisseur |
| `phone` | CharField nullable | Téléphone |
| `address` | CharField nullable | Adresse |
| `created_at` | DateField nullable | Date création |

#### Table `purchase` (application `purchase`)

| Champ | Type | Description |
|-------|------|-------------|
| `id` | AutoField PK | Identifiant |
| `reference` | CharField | Référence auto : `CMD-2025-0001` |
| `supplier` | FK → Supplier nullable | Fournisseur (SET_NULL) |
| `sub_total` | DecimalField | Sous-total calculé |
| `purchase_cost` | DecimalField | Coût total d'achat |
| `total` | DecimalField | Total calculé |
| `purchased_at` | DateField nullable | Date de commande |
| `status` | CharField nullable | Statut (`RECU` déclenche l'entrée en stock) |
| `notes` | TextField nullable | Notes |
| `created_at` | DateTimeField auto | Date création |

#### Table `purchaseline` (application `purchase`)

| Champ | Type | Description |
|-------|------|-------------|
| `id` | AutoField PK | Identifiant |
| `purchase` | FK → Purchase | Achat parent (CASCADE) |
| `product` | FK → Product | Produit (PROTECT) |
| `variant` | FK → Variant nullable | Variante (SET_NULL) |
| `quantity` | IntegerField | Quantité commandée |
| `unit_cost` | DecimalField | Prix unitaire d'achat |
| `line_cost` | DecimalField | `qty × unit_cost` |
| `note` | CharField nullable | Note de ligne |
| `created_at` | DateTimeField auto | Date création |

#### Table `inventorycount` (application `inventorycount`)

| Champ | Type | Description |
|-------|------|-------------|
| `id` | AutoField PK | Identifiant |
| `user` | FK → User nullable | Utilisateur responsable (CASCADE) |
| `status` | CharField | `ENCOURS` \| `FINI` |
| `notes` | TextField nullable | Notes |
| `created_at` | DateField auto | Date création |
| `total_variantes` | IntegerField | Nombre de variantes comptées |
| `quantite_comptee` | IntegerField nullable | Total unités comptées |
| `ecart` | IntegerField nullable | Écart : `comptée - attendue` |

#### Table `inventoryline` (application `inventorycount`)

| Champ | Type | Description |
|-------|------|-------------|
| `id` | AutoField PK | Identifiant |
| `inventory_count` | FK → InventoryCount | Inventaire parent (CASCADE) |
| `product` | FK → Product | Produit (PROTECT) |
| `variant` | FK → Variant nullable | Variante (PROTECT) |
| `expected_qty` | IntegerField nullable | Quantité théorique (depuis Stock) |
| `counted_qty` | IntegerField nullable | Quantité comptée physiquement |
| `discrepancy` | CharField nullable | Écart en chaîne de caractères |
| `created_or_updated_at` | DateTimeField auto | Date MAJ |

### 3.4 API REST — Endpoints

**URL de base** : `/api/`
**Authentification requise** pour tous les endpoints sauf `/api/token/` et les endpoints publics `/api/site/*`
**Header** : `Authorization: Token <votre_token>`

#### Authentification

| Méthode | URL | Description |
|---------|-----|-------------|
| `POST` | `/api/token/` | Connexion — retourne un token |

**Corps de la requête** :
```json
{
  "email": "admin@softcosy.com",
  "password": "votre_mot_de_passe"
}
```
**Réponse** :
```json
{
  "token": "abc123def456...",
  "user_id": 1,
  "email": "admin@softcosy.com"
}
```

#### Utilisateurs

| Méthode | URL | Description | Rôle requis |
|---------|-----|-------------|-------------|
| `GET` | `/api/users/` | Liste tous les utilisateurs | ADMIN |
| `POST` | `/api/users/` | Créer un utilisateur | ADMIN |
| `GET` | `/api/users/{id}/` | Détail d'un utilisateur | ADMIN ou soi-même |
| `PATCH` | `/api/users/{id}/` | Modifier un utilisateur | ADMIN ou soi-même |
| `DELETE` | `/api/users/{id}/` | Supprimer un utilisateur | ADMIN |
| `GET` | `/api/users/me/` | Profil de l'utilisateur connecté | Tous |
| `PATCH` | `/api/users/me/` | Modifier son propre profil | Tous |
| `POST` | `/api/users/change_password/` | Changer son mot de passe | Tous |
| `POST` | `/api/users/{id}/activate/` | Activer un compte | ADMIN |
| `POST` | `/api/users/{id}/deactivate/` | Désactiver un compte | ADMIN |

#### Catégories

| Méthode | URL | Description |
|---------|-----|-------------|
| `GET` | `/api/categories/` | Liste toutes les catégories |
| `POST` | `/api/categories/` | Créer une catégorie |
| `GET` | `/api/categories/{id}/` | Détail d'une catégorie |
| `PATCH` | `/api/categories/{id}/` | Modifier une catégorie |
| `DELETE` | `/api/categories/{id}/` | Supprimer une catégorie |

#### Produits (application de gestion — auth requise)

| Méthode | URL | Description |
|---------|-----|-------------|
| `GET` | `/api/products/` | Liste produits (filtre: `category_id`, search: `name/code/SKU`) |
| `POST` | `/api/products/` | Créer un produit avec variantes, images de galerie, couleurs |
| `GET` | `/api/products/{id}/` | Détail produit avec variantes et galerie d'images |
| `PATCH` | `/api/products/{id}/` | Modifier produit et variantes |
| `DELETE` | `/api/products/{id}/` | Supprimer un produit |
| `POST` | `/api/products/upload-image/` | Upload une image vers Cloudinary (`products/images/`), retourne `{url, public_id}` |
| `DELETE` | `/api/products/delete-image/` | Supprime une image Cloudinary par `public_id` |

#### Produits — boutique publique (sans authentification)

Endpoints dédiés à la vitrine, créés lors de la fusion backend pour ne pas exposer le format
interne (variantes, coûts d'achat...) au public. Retournent uniquement les produits
`is_published=True`, transformés au format attendu par le JavaScript de la boutique.

| Méthode | URL | Description |
|---------|-----|-------------|
| `GET` | `/api/site/products/` | Liste paginée des produits publiés (accepte `?page_size=100`) |
| `GET` | `/api/site/products/{id}/` | Détail d'un produit publié |

**Format de réponse d'un produit (`SiteProductSerializer`)** :
```json
{
  "id": 1,
  "sku": "PROD-00001",
  "name": "Nike Air Force",
  "brand": "Nike",
  "category": ["Hauts"],
  "price": 15000,
  "sizes": ["S", "M", "L"],
  "colors": ["#111111"],
  "fabric": "100% Polyester",
  "description": "...",
  "images": ["https://res.cloudinary.com/..."],
  "icon": "👕",
  "badge": "NEW",
  "is_published": true
}
```

#### Variantes

| Méthode | URL | Description |
|---------|-----|-------------|
| `GET` | `/api/variants/` | Liste variantes (filtre: `product`, `is_active`, `size`) |
| `POST` | `/api/variants/` | Créer une variante |
| `GET` | `/api/variants/{id}/` | Détail d'une variante |
| `PATCH` | `/api/variants/{id}/` | Modifier une variante |
| `DELETE` | `/api/variants/{id}/` | Supprimer une variante |

#### Clients

| Méthode | URL | Description |
|---------|-----|-------------|
| `GET` | `/api/customers/` | Liste des clients |
| `POST` | `/api/customers/` | Créer un client |
| `GET` | `/api/customers/{id}/` | Détail d'un client |
| `PATCH` | `/api/customers/{id}/` | Modifier un client |
| `DELETE` | `/api/customers/{id}/` | Supprimer un client |

#### Ventes

| Méthode | URL | Description |
|---------|-----|-------------|
| `GET` | `/api/sales/` | Liste ventes (search: `invoice_number`, `customer_name`) |
| `POST` | `/api/sales/` | Créer une vente avec lignes |
| `GET` | `/api/sales/{id}/` | Détail d'une vente avec lignes |
| `PATCH` | `/api/sales/{id}/` | Modifier une vente |
| `DELETE` | `/api/sales/{id}/` | Supprimer une vente |

#### Lignes de vente

| Méthode | URL | Description |
|---------|-----|-------------|
| `GET` | `/api/sale-lines/` | Liste lignes (filtre: `sale`, `product`, `variant`) |
| `POST` | `/api/sale-lines/` | Créer une ligne |
| `GET` | `/api/sale-lines/{id}/` | Détail d'une ligne |
| `PATCH` | `/api/sale-lines/{id}/` | Modifier une ligne |
| `DELETE` | `/api/sale-lines/{id}/` | Supprimer une ligne (rembourse le stock) |

#### Fournisseurs

| Méthode | URL | Description |
|---------|-----|-------------|
| `GET` | `/api/suppliers/` | Liste des fournisseurs |
| `POST` | `/api/suppliers/` | Créer un fournisseur |
| `GET` | `/api/suppliers/{id}/` | Détail d'un fournisseur |
| `PATCH` | `/api/suppliers/{id}/` | Modifier un fournisseur |
| `DELETE` | `/api/suppliers/{id}/` | Supprimer un fournisseur |

#### Achats

| Méthode | URL | Description |
|---------|-----|-------------|
| `GET` | `/api/purchases/` | Liste achats (tri: `-id`) |
| `POST` | `/api/purchases/` | Créer un achat avec lignes |
| `GET` | `/api/purchases/{id}/` | Détail d'un achat |
| `PATCH` | `/api/purchases/{id}/` | Modifier (status=`RECU` → entrée stock automatique) |
| `DELETE` | `/api/purchases/{id}/` | Supprimer un achat |

#### Lignes d'achat

| Méthode | URL | Description |
|---------|-----|-------------|
| `GET` | `/api/purchase-lines/` | Liste des lignes d'achat |
| `POST` | `/api/purchase-lines/` | Créer une ligne |
| `GET` | `/api/purchase-lines/{id}/` | Détail d'une ligne |
| `PATCH` | `/api/purchase-lines/{id}/` | Modifier une ligne |
| `DELETE` | `/api/purchase-lines/{id}/` | Supprimer une ligne |

#### Stocks

| Méthode | URL | Description |
|---------|-----|-------------|
| `GET` | `/api/stocks/` | Liste stocks (filtre: `variant`, search: `SKU/nom`) |
| `PATCH` | `/api/stocks/{id}/` | Modifier un stock manuellement |

#### Mouvements de stock

| Méthode | URL | Description |
|---------|-----|-------------|
| `GET` | `/api/stock-movements/` | Liste mouvements (filtre: `movement_type`, `reason`, `stock`, `product`) |
| `POST` | `/api/stock-movements/` | Créer un mouvement manuel |
| `GET` | `/api/stock-movements/{id}/` | Détail d'un mouvement |
| `PATCH` | `/api/stock-movements/{id}/` | Modifier un mouvement |
| `DELETE` | `/api/stock-movements/{id}/` | Supprimer un mouvement |

#### Inventaires physiques

| Méthode | URL | Description |
|---------|-----|-------------|
| `GET` | `/api/inventory-counts/` | Liste des inventaires |
| `POST` | `/api/inventory-counts/` | Démarrer un inventaire |
| `GET` | `/api/inventory-counts/{id}/` | Détail avec lignes |
| `PATCH` | `/api/inventory-counts/{id}/` | Modifier et saisir les comptages |
| `POST` | `/api/inventory-counts/{id}/finish/` | Marquer comme terminé |
| `DELETE` | `/api/inventory-counts/{id}/` | Supprimer un inventaire |

#### Lignes d'inventaire

| Méthode | URL | Description |
|---------|-----|-------------|
| `GET` | `/api/inventory-lines/` | Liste des lignes |
| `POST` | `/api/inventory-lines/` | Créer une ligne |
| `PATCH` | `/api/inventory-lines/{id}/` | Saisir la quantité comptée |
| `DELETE` | `/api/inventory-lines/{id}/` | Supprimer une ligne |

#### Paramètres système

| Méthode | URL | Description |
|---------|-----|-------------|
| `GET` | `/api/settings/current/` | Lire les paramètres actuels |
| `PATCH` | `/api/settings/current/` | Modifier les seuils d'alerte |

#### Dashboard Analytics

| Méthode | URL | Description |
|---------|-----|-------------|
| `GET` | `/api/dashboard/summary/` | Métriques clés (produits, stock, alertes, ventes) |
| `GET` | `/api/dashboard/charts/` | Tendances 6 mois (ventes + entrées) |
| `GET` | `/api/dashboard/categories/` | Répartition par catégorie (camembert) |
| `GET` | `/api/dashboard/product_performance/` | Top 5 produits + taux de rotation |
| `GET` | `/api/dashboard/recent_data/` | Alertes stock bas + derniers mouvements |

#### Documentation API interactive

| URL | Description |
|-----|-------------|
| `/api/docs/` | Swagger UI — tester les endpoints directement |
| `/api/redoc/` | ReDoc — documentation lisible |
| `/api/schema/` | Schéma OpenAPI 3.0 (JSON) |

### 3.5 Authentification et sécurité

**Système d'authentification** :
- Basé sur l'email (pas le username standard Django)
- Classe backend : `user.backends.EmailBackend`
- Token DRF : `rest_framework.authtoken` — token fixe par utilisateur
- Session Django pour l'admin back-office (le back-office Django lui-même, distinct de la
  page `/admin` du frontend Next.js — voir l'encadré en [section 12](#12-maintenance-et-opérations))

**Protection brute-force (django-axes)** :
- Verrouillage après **3 tentatives échouées**
- Durée de verrouillage : **5 minutes** (AXES_COOLOFF_TIME = 0.0833)
- Champ d'identification : email
- Réponse 403 en JSON (compatible API)
- Réinitialisation automatique après succès

**Hachage des mots de passe** (par ordre de priorité) :
1. **Argon2** (recommandé 2026, résistant aux GPU)
2. PBKDF2SHA256
3. PBKDF2SHA1
4. BCryptSHA256
5. Scrypt

**Validation des mots de passe** :
- Pas similaire aux attributs utilisateur
- Longueur minimale (défaut Django : 8 caractères)
- Pas dans la liste des mots de passe communs
- Pas 100% numérique

**Rate Limiting** :
- Anonymes : 100 requêtes/jour
- Authentifiés : 1000 requêtes/heure

**CORS** — origines autorisées (`gestion_softcosy/settings.py`) :
```python
CORS_ALLOWED_ORIGINS = [
    'http://localhost:3000', 'http://127.0.0.1:3000',

    'http://localhost:3001', 'http://127.0.0.1:3001',
    'https://softcosy.store', 'https://www.softcosy.store',
] + [o.strip() for o in os.getenv('CORS_ALLOWED_ORIGINS', '').split(',') if o.strip()]
```

### 3.6 Système de signaux (Signals)

Les signaux Django permettent des actions automatiques sans modifier le code des ViewSets.

**Fichier** : `Backend/stockmouvement/signals.py`

| Signal | Déclencheur | Action |
|--------|-------------|--------|
| `post_save` sur `Variant` (création) | Nouvelle variante créée | Crée automatiquement un `Stock` avec `on_hand_qty=0` |
| `post_save` sur `SaleLine` (création) | Ligne ajoutée à une vente | Crée un `StockMovement` SORTIE, motif VENTE |
| `pre_delete` sur `SaleLine` | Ligne supprimée (remboursement) | Crée un `StockMovement` ENTREE, motif RETOUR_CLIENT |
| `post_save` sur `StockMovement` (création) | Nouveau mouvement | Met à jour `Stock.on_hand_qty` (+/−) |
| `post_delete` sur `StockMovement` | Mouvement supprimé | Annule l'effet sur `Stock.on_hand_qty` |
| `pre_save` sur `StockMovement` (update) | Mouvement modifié | Mémorise anciens valeurs pour recalcul |
| `post_save` sur `StockMovement` (update) | Mouvement modifié | Annule ancien effet + applique nouvel effet |
| `pre_save` sur `Stock` | Avant sauvegarde Stock | Recalcule `available_qty = on_hand_qty - reserved_qty` |

### 3.7 Stockage des médias

Voir [section 6](#6-stockage-des-images) pour le détail complet (Supabase Storage + Cloudinary).

### 3.8 Commandes de gestion

Lancer avec : `python manage.py <commande> [options]`

| Commande | Description |
|----------|-------------|
| `ensure_admin --email x --password y [--full_name "Nom"]` | Crée le super-admin s'il n'existe pas encore |
| `flush_test_data --confirm` | Vide toutes les données de test (garde les utilisateurs) |
| `backup_and_cleanup [--date YYYY-MM-DD] [--dry-run]` | Génère PDFs des mouvements/ventes et uploade sur Google Drive |
| `clean_old_stock_movements` | Supprime les mouvements de stock de plus de 180 jours |
| `setup_google_drive` | Configure les credentials OAuth Google Drive |
| `migrate_site_products [--dry-run] [--force-update] [--url ...]` | Commande historique à usage unique, utilisée lors de la fusion pour importer les produits de l'ancienne API Express vers Django (voir [14.1](#141-fusion-backend--django-source-unique-de-vérité)) |

**Création auto de l'admin au démarrage** :
Dans `user/apps.py`, la méthode `ready()` appelle `_ensure_default_admin()` qui lit les variables d'environnement `DEFAULT_ADMIN_EMAIL`, `DEFAULT_ADMIN_PASSWORD`, `DEFAULT_ADMIN_FULL_NAME` et crée l'admin s'il n'existe aucun superuser.

### 3.9 Variables d'environnement Backend

Fichier : `Backend/.env`

```env
# ───── Django ─────────────────────────────────────────────
SECRET_KEY=votre_cle_secrete_longue_et_aleatoire
DEBUG=False
ALLOWED_HOSTS=softcosy-backend.onrender.com,softcosy.store,www.softcosy.store

# ───── Base de données PostgreSQL (Supabase) ──────────────
DB_NAME=postgres
DB_USER=postgres
DB_PASSWORD=votre_mot_de_passe_db
DB_HOST=db.xxxx.supabase.co
DB_PORT=5432

# ───── CORS (domaines additionnels, en plus de la liste codée en dur) ──
CORS_ALLOWED_ORIGINS=

# ───── Admin par défaut (création automatique) ────────────
DEFAULT_ADMIN_EMAIL=admin@softcosy.com
DEFAULT_ADMIN_PASSWORD=VotreMotDePasseSecurise!
DEFAULT_ADMIN_FULL_NAME=Super Admin

# ───── Supabase Storage (S3) — médias en production ───────
SUPABASE_S3_ENDPOINT=https://xxxx.supabase.co/storage/v1/s3
SUPABASE_ACCESS_KEY_ID=votre_access_key_id
SUPABASE_SECRET_ACCESS_KEY=votre_secret_access_key
SUPABASE_BUCKET_NAME=media
SUPABASE_REGION=eu-west-2

# ───── Cloudinary — photos produits (boutique + gestion) ──
CLOUDINARY_URL=cloudinary://api_key:api_secret@cloud_name

# ───── Google Drive (backup quotidien) ───────────────────
GOOGLE_OAUTH_CLIENT_SECRETS_PATH=/chemin/vers/client_secrets.json
GOOGLE_DRIVE_PARENT_FOLDER_ID=votre_folder_id_drive
```

---

## 4. Frontend — Next.js (site vitrine + application de gestion)

Depuis juillet 2026, le frontend Soft&Cosy (boutique) et le frontend SoftCosy (application de
gestion) sont **un seul projet Next.js** (`Frontend/`), déployé une seule fois. Voir
[14.2](#142-fusion-frontend--un-seul-déploiement-sous-un-seul-domaine) pour l'historique de
cette fusion.

### 4.1 Stack et dépendances

| Package | Version | Rôle |
|---------|---------|------|
| **Next.js** | 16.1.6 | Framework React (App Router) |
| **React** | 19.2.3 | Bibliothèque UI |
| **TypeScript** | 5.x | Typage statique |
| **Tailwind CSS** | 4.x | Framework CSS utilitaire (application de gestion uniquement) |
| **@tanstack/react-query** | 5.90.21 | Gestion état serveur (cache, refetch) |
| **axios** | 1.13.6 | Client HTTP (appels API) |
| **react-hook-form** | 7.75.0 | Gestion des formulaires |
| **recharts** | 3.7.0 | Graphiques (ligne, camembert, barres) |
| **lucide-react** | 0.576.0 | Icônes (500+) |
| **next-themes** | 0.4.6 | Mode sombre/clair |
| **@radix-ui/react-*** | 1.x–2.x | Composants UI accessibles (27 packages) |
| **date-fns** | 4.1.0 | Manipulation des dates |
| **react-resizable-panels** | 4.11.0 | Panneaux redimensionnables |
| **sonner** | 2.0.7 | Notifications toast |
| **vaul** | 1.1.2 | Drawer mobile |
| **cmdk** | 1.1.1 | Palette de commandes (Command Menu) |
| **jwt-decode** | 4.0.0 | Décodage JWT (inspection, pas vérification) |

La boutique (`site/index.html`) n'utilise **aucune** de ces dépendances : c'est du HTML/CSS/JS
vanilla pur, indépendant de React et de Tailwind (voir 4.3).

### 4.2 Structure des routes

```
Frontend/
├── site/
│   └── index.html            # Document HTML complet de la boutique (vanilla JS inline)
├── public/
│   ├── style.css              # Styles de la boutique
│   ├── favicon.svg             # Favicon de la boutique
│   ├── robots.txt              # SEO — Disallow: /admin/
│   └── sitemap.xml             # SEO — https://softcosy.store/
└── src/app/
    ├── route.ts                # GET '/' → sert site/index.html en HTML brut
    ├── layout.tsx               # Root layout React (n'enveloppe QUE les pages ci-dessous)
    ├── layout-client.tsx        # Providers (Auth, QueryClient, Theme) + garde de routes protégées
    ├── globals.css              # Styles Tailwind (application de gestion uniquement)
    └── admin/
        ├── page.tsx             # '/admin' — Login (garde d'auth + formulaire)
        └── dashboard/
            ├── layout.tsx       # Sidebar + Navbar + footer (toutes les pages ci-dessous)
            ├── page.tsx         # '/admin/dashboard' — Tableau de bord
            ├── products/page.tsx
            ├── stocks/page.tsx
            ├── cashier/page.tsx
            ├── sales/page.tsx
            ├── inventory/{page.tsx,[id]/page.tsx}
            ├── suppliers/page.tsx
            ├── purchases/{page.tsx,[id]/page.tsx}
            ├── reports/page.tsx
            ├── users/page.tsx
            └── settings/page.tsx
```

**Pourquoi un Route Handler (`route.ts`) et pas une page React pour la boutique ?**
Le HTML original de la boutique contient un unique `<script>` inline qui gère tout (panier,
modal produit, appels API, checkout WhatsApp). Si ce HTML était injecté dans une page React via
`dangerouslySetInnerHTML`, ce `<script>` **ne s'exécuterait jamais** — c'est une règle du DOM :
assigner du HTML à `innerHTML` n'exécute pas les balises `<script>` qu'il contient. Un Route
Handler App Router, en revanche, renvoie une réponse HTTP brute (`Content-Type: text/html`) que
le navigateur parse comme un document normal, exactement comme l'ancien site statique — le
script s'exécute normalement. Un Route Handler n'est par ailleurs jamais enveloppé par
`layout.tsx` : la boutique ne charge donc ni Tailwind, ni les providers React (Auth, React
Query, thème) de l'application de gestion.

### 4.3 Site vitrine (boutique Soft&Cosy) — `/`

**Fichiers** : [site/index.html](Frontend/site/index.html) | [public/style.css](Frontend/public/style.css)

Le frontend de la boutique est entièrement en **Vanilla JavaScript**, sans framework, sans
bundler, sans dépendances npm — hérité tel quel de l'ancien projet indépendant `site_softcosy`.

| Technologie | Rôle |
|---|---|
| HTML5 | Structure de la page (SPA à page unique) |
| CSS3 (variables, flexbox, grid) | Mise en page et thème |
| JavaScript ES6+ natif | Logique panier/modal, appels `fetch` vers l'API Django |
| Google Fonts | Polices : DM Sans + Bebas Neue |
| Font Awesome (CDN) | Icônes (panier, flèches, menus) |
| `localStorage` | *(non utilisé côté boutique — pas de session admin locale)* |

#### Sections de la page (de haut en bas)

| Section | Description |
|---|---|
| **Header fixe** | Logo Soft&Cosy (Bebas Neue), bouton panier avec compteur, fond flouté (`backdrop-filter: blur`) |
| **Section Hero** | Titre principal « DÉPASSE TES LIMITES », sous-titre, 2 boutons CTA (Acheter, Parcourir), image de fond |
| **Bande de stats** | 4 indicateurs : 50+ Produits, 3 Marques, Taille XS→4XL, Livraison Lomé |
| **Grille de produits** | Filtres (marques + catégories), grille responsive 4 colonnes |
| **Footer** | Logo, slogan, icônes de paiement |

#### Fonctionnalités détaillées

**Chargement des produits**
- Requête `GET {API}/api/site/products/?page_size=100` au chargement de la page (voir
  [3.4](#34-api-rest--endpoints) pour le format de réponse)
- Rendu dynamique des cartes produit et des boutons de filtre (par marque et par catégorie,
  extraits des produits reçus)

**Carte produit**
- Photo principale (première image de la galerie `ProductImage`, triée par `order`), badge
  (`NEW`, `BESTSELLER`, `HOT`...)
- Nom, marque, prix en FCFA
- Pastilles de couleurs disponibles
- Bouton « Ajouter au panier »

**Modal de détail produit**
- Galerie d'images avec navigation (flèches gauche/droite + points de pagination + miniatures cliquables)
- Support navigation clavier (← →, Échap)
- Sélecteur de taille (boutons cliquables, alimentés par les tailles des variantes actives)
- Sélecteur de couleur (pastilles avec noms traduits en français)
- Description détaillée, tissu/matière

**Traduction des couleurs (hex → nom français)**
```
#000000 → Noir         #ffffff → Blanc
#ff0000 → Rouge        #0000ff → Bleu
#808080 → Gris         #333333 → Anthracite
#1a1a1a → Noir charbon #navy   → Marine
... (20 couleurs mappées)
```

**Panier**
- Panneau latéral droit (slide-in)
- Affiche les articles avec nom, taille, couleur, prix
- Compteur dans le header mis à jour en temps réel
- Calcul automatique du sous-total

**Formulaire de commande**
- Champ prénom + téléphone obligatoires
- Sélection du mode de livraison : Récupération en boutique / Livraison à domicile
- Champ adresse affiché conditionnellement si livraison domicile
- Options de paiement : **Flooz** (Moov) et **T-Money** (Togocel) — Mobile Money local
- Validation côté client avant envoi

**Intégration WhatsApp**
- À la validation de la commande, génère un message formaté (détail des articles, sous-total,
  infos client, mode de livraison)
- Ouvre directement WhatsApp avec le numéro de la boutique : **+228 92 40 98 78**
- URL format : `https://wa.me/22892409878?text=...`

**SEO**
- `robots.txt` : indexation autorisée, `/admin/` bloqué
- `sitemap.xml` : URL racine du site
- `favicon.svg` : logo Soft&Cosy dans l'onglet

> **Pas de backend dédié** : contrairement à l'ancien projet `site_softcosy` (qui avait son
> propre serveur Express avec routes `/api/products`, `/api/upload`, etc.), la boutique n'a
> désormais **aucun backend propre**. Elle ne fait que lire l'API publique Django
> (`/api/site/products/`). La gestion du catalogue (créer/modifier un produit, uploader des
> photos) se fait exclusiv'ement depuis l'application de gestion, sous `/admin`.

### 4.4 Application de gestion — `/admin`

#### Authentification côté frontend

**Flux de connexion** :
```
1. Utilisateur va sur /admin, saisit email + mot de passe
           ↓
2. POST /api/token/ → token reçu
           ↓
3. localStorage.setItem('token', token)
           ↓
4. GET /api/users/me/ → profil utilisateur
           ↓
5. localStorage.setItem('user', JSON.stringify(user))
           ↓
6. Redirection vers /admin/dashboard
```

**Déconnexion** :
```
1. localStorage.removeItem('token')
2. localStorage.removeItem('user')
3. Redirection vers /admin
```

**Auto-déconnexion** : L'intercepteur Axios détecte les erreurs 401 et redirige automatiquement vers `/admin`.

**Garde de routes protégées** (`src/app/layout-client.tsx`) : toute page React sous `layout.tsx`
qui n'est pas dans `publicRoutes = ['/admin', '/signup']` redirige vers `/admin` si l'utilisateur
n'est pas authentifié.

**AuthContext** (`src/components/AuthContext.tsx`) :
```typescript
interface AuthUser {
  id: number;
  email: string;
  full_name: string;
  role: 'ADMIN' | 'SELLER' | 'MANAGER';
  is_active: boolean;
  phone?: number;
  address?: string;
}

// Hook d'accès depuis n'importe quel composant :
const { user, loading, signIn, signOut, isAuthenticated } = useAuth();
```

#### Communication avec l'API

**Instance Axios** (`src/lib/api.ts`) :
```typescript
const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000/api',
  // Ne pas définir Content-Type ici :
  // - Pour les objets JSON, Axios le définit automatiquement à 'application/json'
  // - Pour FormData (upload fichier), le browser définit 'multipart/form-data; boundary=...'
});

// Injection automatique du token sur chaque requête
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token && !config.url?.includes('/token/')) {
    config.headers.Authorization = `Token ${token}`;
  }
  return config;
});

// Déconnexion automatique si 401 → redirection vers /admin
api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      if (window.location.pathname !== '/admin') {
        window.location.href = '/admin';
      }
    }
    return Promise.reject(error);
  }
);
```

**React Query — Exemple de pattern** :
```typescript
const { data: products, isLoading } = useQuery({
  queryKey: ['products', page, search],
  queryFn: () => api.get(`/products/?page=${page}&search=${search}`).then(r => r.data),
});

const deleteProduct = useMutation({
  mutationFn: (id: number) => api.delete(`/products/${id}/`),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ['products'] }),
});
```

#### Composants principaux

**Sidebar** (`src/components/sidebar.tsx`) :
- Menu de navigation latéral avec **filtrage par rôle**, routes préfixées `/admin/dashboard/*`
- ADMIN : 11 éléments (tout)
- MANAGER : tout sauf « Utilisateurs »
- SELLER : Caisse, Produits, Stocks, Ventes, Inventaire, Fournisseurs
- Surlignage de l'élément actif (basé sur `usePathname()`)
- Section profil en bas avec nom + badge de rôle + bouton déconnexion

**Navbar** (`src/components/navbar.tsx`) :
- Logo « S&C »
- Bouton menu mobile
- Cloche de notifications (alertes stock bas)
- Bouton thème sombre/clair

**NotificationBell** (`src/components/notification-bell.tsx`) :
- Polling toutes les **60 secondes** vers `/api/dashboard/recent_data/`
- Badge rouge avec compteur (≥ 10 : affiche « 9+ »)
- Liste déroulante des produits en stock bas
- Code couleur : orange (avertissement), rouge (critique)

**AddEditProductModal** (`src/components/add-product-modal.tsx`) :
- Formulaire de création/modification produit en 4 sections : Informations générales (nom,
  code produit, catégorie, marque, badge, icône, composition, publié sur site), Couleurs
  (palette + saisie hex), Galerie d'images (upload multiple avec suivi par `tempId`, réordonner,
  supprimer), Variantes (SKU auto, taille, prix, stock)
- Upload vers `/api/products/upload-image/`, chaque image affiche un aperçu `blob://` immédiat
  puis est remplacée par l'URL Cloudinary définitive une fois l'upload terminé

**AddMovementModal** (`src/components/add-movement-modal.tsx`) :
- Création/modification de mouvements de stock manuels
- Sélection type (ENTREE/SORTIE/AJUSTEMENT) + motif
- Validation : empêche le stock négatif

**CategoryManagementModal** (`src/components/category-management-modal.tsx`) :
- CRUD complet des catégories en modal

**UserProfileModal** (`src/components/user-profile-modal.tsx`) :
- Modifier son profil (nom, téléphone, adresse, photo) — `PATCH /api/users/me/`

**Composants UI (shadcn/ui)** :
Plus de 70 composants pré-construits dans `src/components/ui/` : Button, Card, Input, Select,
Dialog, Dropdown, Badge, Table, Pagination, Tabs, Accordion, Alert, Avatar, Calendar, Checkbox,
Command, DatePicker, Form, Progress, RadioGroup, ScrollArea, Sheet, Skeleton, Slider, Switch,
Textarea, Toast, Toggle, Tooltip, Resizable panels, etc.

#### Thème et styles

**Tailwind CSS 4** avec mode sombre (`class`-based) :
- Couleur primaire : Bleu
- Mode sombre : persisté dans `localStorage` via `next-themes`
- Breakpoints responsive : `sm` (640px), `md` (768px), `lg` (1024px), `xl` (1280px)

**Détection mobile** (`src/hooks/use-mobile.ts`) :
```typescript
export function useIsMobile() {
  // Retourne true si largeur < 768px, via matchMedia pour les mises à jour temps réel
}
```

**Copyright footer** (dans `admin/dashboard/layout.tsx`) :
```
© 2026 SoftCosy — Tous droits réservés. Réalisé par Virkas [lien WhatsApp]
```

### 4.5 Variables d'environnement Frontend

Fichier : `Frontend/.env.local`

```env
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000/api    # Développement local
# NEXT_PUBLIC_API_URL=https://softcosy-backend.onrender.com/api  # Production
```

---

## 5. Base de données — PostgreSQL / Supabase

### 5.1 Schéma des tables

**Base de données** : PostgreSQL 15 hébergée sur Supabase
**Connexion** : SSL obligatoire (`sslmode=require`)

| Table | App | Lignes estimées |
|-------|-----|----------------|
| `user` | user | ~10–100 |
| `category` | product | ~5–50 |
| `product` | product | ~50–5000 |
| `productimage` | product | ~100–20000 |
| `variant` | product | ~100–20000 |
| `stock` | stockmouvement | ~100–20000 (1:1 avec variant) |
| `stockmovement` | stockmouvement | ~10000+ (audit trail complet) |
| `systemsettings` | stockmouvement | 1 (singleton) |
| `customer` | sale | ~50–5000 |
| `sale` | sale | ~1000–100000 |
| `saleline` | sale | ~3000–500000 |
| `supplier` | purchase | ~5–100 |
| `purchase` | purchase | ~100–10000 |
| `purchaseline` | purchase | ~300–50000 |
| `inventorycount` | inventorycount | ~10–500 |
| `inventoryline` | inventorycount | ~500–100000 |

### 5.2 Relations entre tables

```
User ─────────────────────────────────── Sale (vendeur)
  └── InventoryCount (compteur)

Category ────────────────────────────── Product (appartient à)

Product ──────┬──────────────────────── Variant (a plusieurs)
              ├── ProductImage (galerie de photos)
              ├── SaleLine (produit vendu)
              ├── PurchaseLine (produit acheté)
              ├── StockMovement (mouvement lié)
              └── InventoryLine (ligne inventaire)

Variant ──────┬──────────────────────── Stock (1 pour 1)
              ├── SaleLine (variante vendue)
              ├── PurchaseLine (variante achetée)
              └── InventoryLine (ligne inventaire)

Stock ─────────────────────────────────── StockMovement (historique)

Sale ─────────┬──────────────────────── SaleLine (articles)
              └── Customer (client)

Purchase ──────┬─────────────────────── PurchaseLine (articles)
               └── Supplier (fournisseur)

InventoryCount ──────────────────────── InventoryLine (articles comptés)
```

---

## 6. Stockage des images

Deux systèmes de stockage coexistent, pour des usages différents :

### 6.1 Supabase Storage (S3) — utilisateurs et historique produit

**Ce qui est enregistré dans la base de données** : jamais l'image elle-même — uniquement le
chemin relatif du fichier (ex. `products/images/mon_produit.jpg`).

**Développement local** :
```
MEDIA_URL  = http://localhost:8000/media/
MEDIA_ROOT = Backend/media/
```
Django sert les fichiers directement en mode `DEBUG=True`.

**Production (Supabase Storage S3)** — activé automatiquement quand les 3 variables
d'environnement Supabase sont présentes :
```
SUPABASE_S3_ENDPOINT      = https://[project-id].supabase.co/storage/v1/s3
SUPABASE_ACCESS_KEY_ID    = [votre_access_key]
SUPABASE_SECRET_ACCESS_KEY = [votre_secret_key]
```

```python
DEFAULT_FILE_STORAGE = 'storages.backends.s3boto3.S3Boto3Storage'
AWS_DEFAULT_ACL      = 'public-read'
AWS_QUERYSTRING_AUTH = False
AWS_S3_FILE_OVERWRITE = False
MEDIA_URL = f"{SUPABASE_S3_ENDPOINT}/{SUPABASE_BUCKET_NAME}/"
```

**Point critique — endpoint S3 vs URL publique** : Supabase a deux chemins différents,
souvent confondus :

| Chemin | Usage | Exemple |
|--------|-------|---------|
| `/storage/v1/s3` | API S3 (upload/download via boto3) | `https://xxx.supabase.co/storage/v1/s3` |
| `/storage/v1/object/public` | URL publique HTTP (afficher l'image) | `https://xxx.supabase.co/storage/v1/object/public/media/...` |

`django-storages` utilise `AWS_S3_CUSTOM_DOMAIN` pour générer les URLs publiques :
```python
AWS_S3_ENDPOINT_URL = os.getenv('SUPABASE_S3_ENDPOINT')
_supabase_domain = AWS_S3_ENDPOINT_URL.split('/storage/')[0].replace('https://', '')
AWS_S3_CUSTOM_DOMAIN = f"{_supabase_domain}/storage/v1/object/public/{AWS_STORAGE_BUCKET_NAME}"
MEDIA_URL = f"https://{AWS_S3_CUSTOM_DOMAIN}/"
```

**Fichiers concernés** : photos de profil utilisateur (`user.image` → `users/`), champ historique
`product.image` (conservé pour compatibilité, non utilisé pour les nouvelles galeries).

**Impact de la mise en pause Supabase** : sur le plan gratuit, le projet est mis en pause après
une semaine d'inactivité (base de données ET storage). À la réactivation, tout revient intact.
Si les images ne s'affichent toujours pas, vérifier les 3 variables d'environnement Render, que
le bucket `media` est public, et que le backend a été redéployé après modification.

### 6.2 Cloudinary — galerie produits (boutique + application de gestion)

**Flux complet d'ajout d'une image produit depuis l'application de gestion** :
```
Utilisateur sélectionne un fichier dans le navigateur
              │
              ▼ (immédiat)
Aperçu blob:// affiché dans la galerie (tempId = "temp_...")
              │
              ▼ (asynchrone, en arrière-plan)
POST /api/products/upload-image/     ← React (avec token DRF)
              │
              ▼
Django reçoit le fichier (multipart/form-data)
              │
              ▼
cloudinary.uploader.upload(file, folder='products/images/')
              │
              ▼
Cloudinary retourne {"url": "...", "public_id": "..."}
              │
              ▼
React remplace le blob:// par l'URL Cloudinary définitive
(retrouvé par tempId pour éviter les conditions de course)
              │
              ▼
À la soumission du formulaire :
POST /api/products/  avec product_images_data: JSON.stringify([...])
              │
              ▼
Django crée les entrées ProductImage en base de données
```

**Suppression d'une image** :
```
Clic "Supprimer" sur une miniature
   → DELETE /api/products/delete-image/  {public_id: "..."}
   → Django appelle cloudinary.uploader.destroy(public_id)
   → React retire l'image de la galerie, révoque le blob:// si nécessaire
```

Ces URLs Cloudinary sont ensuite lues telles quelles par la boutique (`/api/site/products/`) —
aucune duplication ni retraitement d'image entre l'application de gestion et la boutique.

---

## 7. Fonctionnalités détaillées

### 7.1 Boutique en ligne

Voir [4.3](#43-site-vitrine-boutique-softcosy--) pour le détail complet (grille produits,
panier, checkout WhatsApp, filtres marque/catégorie).

### 7.2 Tableau de bord (Dashboard)

**Route** : `/admin/dashboard`

**Métriques affichées** (depuis `/api/dashboard/summary/`) :
- Nombre total de produits actifs
- Valeur totale du stock
- Nombre d'alertes stock bas actives
- Total des ventes

**Graphiques** (depuis `/api/dashboard/charts/`) :
- Courbe des ventes sur 6 mois
- Courbe des entrées de stock sur 6 mois

**Répartition par catégorie** (depuis `/api/dashboard/categories/`) : camembert.

**Produits haute rotation** (depuis `/api/dashboard/product_performance/`) : Top 5 + taux de rotation.

**Activité récente** (depuis `/api/dashboard/recent_data/`) : 5 derniers mouvements + produits en stock bas.

### 7.3 Gestion des produits

**Route** : `/admin/dashboard/products`

**Fonctionnalités** :
- Catalogue paginé (20 par page) avec recherche par nom/code/SKU
- Filtre par catégorie
- Vue desktop : tableau avec rangées expansibles montrant les variantes ; vue mobile : grille de cartes
- Création/modification via modal avec variantes imbriquées, galerie multi-images, couleurs,
  marque, badge, icône, composition, statut « publié sur le site »
- Gestion des catégories dans une modal dédiée
- Auto-génération du code produit (`PROD-00001`) et des SKUs (`SKU-00001`)

**Champs d'une variante** : SKU (auto), code-barres (optionnel), taille/modèle, prix de vente
(obligatoire), prix de revient (optionnel), attributs JSON libres, statut actif/inactif.

### 7.4 Gestion des stocks

**Route** : `/admin/dashboard/stocks`

**Fonctionnalités** :
- Vue groupée par produit
- Statistiques : total pièces, articles stock bas, articles critiques, mouvements du jour
- Recherche par produit, filtre par type de mouvement
- Historique des mouvements (SKU, type, quantité, motif, date, notes)
- Création/édition/suppression de mouvements manuels (ENTREE/SORTIE/AJUSTEMENT)
- Validation : empêche les quantités négatives

### 7.5 Caisse (POS)

**Route** : `/admin/dashboard/cashier`

**Fonctionnalités** :
- Grille de produits avec filtre par catégorie et recherche, 12 produits par page
- Sélection de variante (taille, modèle)
- Panier avec ajustement des quantités et suppression
- Nom du client (optionnel, sans fiche client)
- Modal de paiement : sous-total/total, remise globale, montant payé, monnaie rendue, pourboire

**Flux de données** :
```
Sélection produits → Panier → Paiement → POST /api/sales/
                                              ↓
                               Backend crée Sale + SaleLines
                                              ↓
                               Signal: StockMovement SORTIE pour chaque ligne
                                              ↓
                               Stock.on_hand_qty décrémenté automatiquement
```

### 7.6 Ventes

**Route** : `/admin/dashboard/sales`

**Fonctionnalités** :
- Liste de toutes les ventes (triées par date), recherche par facture/client, filtre par période
- Détail d'une vente : lignes, totaux, statut, vendeur
- Remboursement (suppression d'une ligne) : stock restitué automatiquement (signal RETOUR_CLIENT), totaux recalculés

### 7.7 Achats fournisseurs

**Route** : `/admin/dashboard/purchases` et `/admin/dashboard/purchases/[id]`

**Fonctionnalités** :
- Liste des commandes fournisseurs, création avec sélection fournisseur + lignes
- Référence auto-générée : `CMD-2025-0001`
- Statuts : en attente → reçu — la réception (`status = "RECU"`) déclenche automatiquement
  l'entrée en stock (StockMovement ENTREE par ligne)

### 7.8 Inventaires physiques

**Route** : `/admin/dashboard/inventory` et `/admin/dashboard/inventory/[id]`

**Fonctionnalités** :
- Démarrer un inventaire (capture l'état actuel des stocks)
- Saisie ligne par ligne, calcul automatique des écarts (comptée vs théorique)
- Statuts : `ENCOURS` → `FINI`
- N'affecte pas automatiquement les stocks — sert d'enregistrement ; ajustements créés séparément si besoin

### 7.9 Gestion des fournisseurs

**Route** : `/admin/dashboard/suppliers`

CRUD complet (nom, téléphone, adresse), utilisés dans les achats pour le suivi et les rapports.

### 7.10 Gestion des utilisateurs

**Route** : `/admin/dashboard/users` — **ADMIN uniquement**

Liste avec rôle et statut, création (email, nom, rôle, mot de passe), modification, activation/
désactivation (`is_active`), suppression. Un compte est **inactif** par défaut à la création.

### 7.11 Rapports

**Route** : `/admin/dashboard/reports` — **ADMIN uniquement**

Rapports analytiques détaillés sur ventes et stocks, données exportables, graphiques de
tendances, alimentés par les endpoints dashboard.

### 7.12 Paramètres système

**Route** : `/admin/dashboard/settings` — **ADMIN uniquement**

Seuil stock bas (défaut 10), seuil stock critique (défaut 5), activation des alertes stock bas /
mises à jour système / rapport hebdomadaire — sauvegardé via `PATCH /api/settings/current/`.

### 7.13 Notifications stock bas

**Composant** : `NotificationBell` dans la navbar (voir [4.4](#44-application-de-gestion--admin)).

---

## 8. Déploiement

> Cette section documente, pour référence future, l'ensemble des comptes, services externes et
> réglages effectivement utilisés pour mettre SoftCosy en production (où le domaine a été
> acheté, quels services hébergent quoi, quels réglages DNS ont été appliqués...).

### 8.0 Récapitulatif des comptes et services externes

| Besoin | Service utilisé | Détails |
|---|---|---|
| Nom de domaine | **Namecheap** | `softcosy.store`, acheté et géré ici (DNS via Namecheap BasicDNS) |
| Hébergement backend (Django/API) | **Render** | Compte/workspace *cosy's workspace*, projet *SC projet*, service `softcosy-backend` |
| Hébergement frontend (site + admin, unifiés) | **Vercel** | Compte personnel (plan Hobby), workspace affiché *doux et confortable*, projet `soft-cosy` |
| Dépôt de code / CI de déploiement | **GitHub** | `lawsondjeckylaurenne/SoftCosy`, branche `master` — Render **et** Vercel sont tous les deux connectés à ce repo et redéploient automatiquement à chaque `git push` sur `master` |
| Base de données PostgreSQL + stockage fichiers (S3) | **Supabase** | Voir [section 5](#5-base-de-données--postgresql--supabase) et [section 6](#6-stockage-des-images) |
| Stockage des photos produits (galerie) | **Cloudinary** | Voir [section 6.2](#62-cloudinary--galerie-produits-boutique--application-de-gestion) |
| Indexation moteur de recherche | **Google Search Console** | Propriété à créer pour `softcosy.store` (type "Domaine") — voir [8.5](#85-indexation--google-search-console) |

Le projet est réparti sur **deux plateformes d'hébergement** :

| Composant | Plateforme | Détails |
|---|---|---|
| Backend Django | **Render** | Service web `softcosy-backend`, config dans `render.yaml` |
| Frontend Next.js (boutique + admin, unifiés) | **Vercel** | Projet connecté au repo GitHub, racine = `Frontend/` |

### 8.1 Nom de domaine — Namecheap

Le domaine `softcosy.store` est acheté et géré chez **Namecheap** (Domain List → Manage →
Advanced DNS). Le frontend étant sur Vercel, les enregistrements DNS suivants ont été ajoutés
pour pointer le domaine vers Vercel :

| Type | Hôte | Valeur | Rôle |
|---|---|---|---|
| A | `@` | `216.198.79.1` | Domaine racine (`softcosy.store`) → Vercel |
| CNAME | `www` | `65730f572b73a2c0.vercel-dns-017.com.` | Sous-domaine `www.softcosy.store` → Vercel |

> Ces valeurs sont **spécifiques à ce projet Vercel** (Vercel les affiche dans Domaines → nom du
> domaine → "Enregistrements DNS" au moment de l'ajout du domaine). Si le domaine devait être
> reconfiguré un jour, retourner sur Vercel → Settings → Domains pour récupérer les valeurs
> exactes à jour plutôt que de réutiliser telles quelles celles ci-dessus.

`softcosy.store` redirige (308) vers `www.softcosy.store`, qui est la version "Production" —
choix par défaut de Vercel, aucune action supplémentaire nécessaire.

**Propagation DNS** : entre l'ajout des enregistrements et la validation complète (Vercel →
Domaines → statut "Valid Configuration" / "Configuration valide"), compter de quelques minutes
à quelques heures.

### 8.2 Backend — Render (`render.yaml`)

Compte Render : workspace **cosy's workspace**, projet **SC projet**, environnement
**production**, service web **`softcosy-backend`** (Service ID `srv-d7u5u5osfn5c73cnfhkg`),
connecté au repo GitHub `lawsondjeckylaurenne/SoftCosy` (branche `master`, "Blueprint managed").
URL : `https://softcosy-backend.onrender.com`.

```yaml
services:
  - type: web
    name: softcosy-backend
    runtime: python
    plan: free
    rootDir: Backend
    buildCommand: pip install -r requirements.txt && python manage.py collectstatic --noinput && python manage.py migrate
    startCommand: gunicorn gestion_softcosy.wsgi:application --bind 0.0.0.0:$PORT
    envVars:
      - key: DEBUG
        value: "False"
      - key: ALLOWED_HOSTS
        value: softcosy-backend.onrender.com,softcosy.store,www.softcosy.store
```

> **⚠️ Piège vécu en production** : modifier `render.yaml` dans le repo ne met **pas**
> automatiquement à jour les variables d'environnement d'un service déjà existant sur Render
> (le Blueprint n'est resynchronisé que dans certains cas). Après avoir ajouté `softcosy.store`
> à `ALLOWED_HOSTS` dans `render.yaml`, il a fallu **aussi** l'ajouter manuellement dans
> Render → `softcosy-backend` → **Environment** → variable `ALLOWED_HOSTS` → modifier la valeur
> → **Save Changes** (déclenche un redéploiement automatique). Toujours vérifier la valeur
> réellement active dans le dashboard Render après un changement de `render.yaml`.

**Variables d'environnement configurées sur Render** (Dashboard → Service → Environment) :

| Variable | Description |
|----------|-------------|
| `SECRET_KEY` | Clé secrète Django |
| `ALLOWED_HOSTS` | `softcosy-backend.onrender.com,softcosy.store,www.softcosy.store` |
| `CORS_ALLOWED_ORIGINS` | Origines additionnelles (le domaine `softcosy.store` est déjà autorisé en dur dans `settings.py`, cette variable est un complément, ex. `https://soft-cosy.vercel.app`) |
| `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT` | Connexion PostgreSQL (Supabase) |
| `DEFAULT_ADMIN_EMAIL`, `DEFAULT_ADMIN_PASSWORD`, `DEFAULT_ADMIN_FULL_NAME` | Premier compte admin |
| `SUPABASE_S3_ENDPOINT`, `SUPABASE_ACCESS_KEY_ID`, `SUPABASE_SECRET_ACCESS_KEY`, `SUPABASE_BUCKET_NAME` | Storage S3 (Supabase) |
| `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `CLOUDINARY_CLOUD_NAME` | Photos produits (Cloudinary) |

**Points importants** :
- `plan: free` est obligatoire pour éviter la demande de paiement
- Le plan gratuit met le service en veille après inactivité — premier appel après veille : jusqu'à ~50s de délai (message affiché directement dans le dashboard Render)
- `preDeployCommand` n'est pas supporté sur le plan gratuit (migrations incluses dans `buildCommand`)
- Au démarrage de l'app Django, `AppConfig.ready()` crée le compte admin par défaut si aucun n'existe
- Déploiement automatique à chaque `git push` sur `master` (visible dans Render → Events)

### 8.3 Frontend — Vercel

Compte Vercel : compte personnel (plan **Hobby**), workspace affiché **"doux et confortable"**
(nom francisé de "Soft & Cosy"), projet **`soft-cosy`**, connecté au même repo GitHub
`lawsondjeckylaurenne/SoftCosy` (racine `Frontend/`). Vercel détecte automatiquement Next.js
(zero-config) : à chaque `git push` sur la branche connectée, Vercel rebuild et redéploie
automatiquement. URL de secours (avant/à côté du domaine personnalisé) :
`https://soft-cosy.vercel.app`.

**Variables d'environnement configurées sur Vercel** (Project → Settings → Environment Variables) :

| Variable | Valeur | Environnements |
|----------|--------|--------|
| `NEXT_PUBLIC_API_URL` | `https://softcosy-backend.onrender.com/api` | Production, Preview |

> Après toute modification d'une variable d'environnement sur Vercel, un **redéploiement manuel**
> est nécessaire (Deployments → dernier déploiement → menu **⋯** → Redeploy) — Vercel ne
> redéploie pas automatiquement juste parce qu'une variable a changé.

**Domaine personnalisé** : `softcosy.store` et `www.softcosy.store` sont attachés à ce projet
Vercel (Project → Settings → Domains). Voir [8.1](#81-nom-de-domaine--namecheap) pour les
enregistrements DNS exacts. Une fois la configuration validée par Vercel :
- `https://softcosy.store/` → redirige (308) vers `https://www.softcosy.store/` → boutique Soft&Cosy
- `https://softcosy.store/admin` (ou `www.`) → connexion à l'application de gestion

### 8.4 Fichiers statiques

- **Django** : WhiteNoise sert `staticfiles/` avec compression gzip
- **Next.js** : sert nativement `public/` (style.css, favicon.svg, robots.txt, sitemap.xml) et
  ses propres assets buildés

### 8.5 Indexation — Google Search Console

Pour que `softcosy.store` apparaisse dans les résultats de recherche Google (ce qui n'est pas
automatique pour un domaine neuf, même une fois le site en ligne et fonctionnel) :

1. [Google Search Console](https://search.google.com/search-console) → ajouter une propriété de
   type **"Domaine"** avec `softcosy.store` (ce type couvre automatiquement `www.` et les deux
   protocoles, contrairement au type "Préfixe d'URL")
2. Vérifier la propriété via l'enregistrement **TXT** que Google fournit, à ajouter dans
   Namecheap → Advanced DNS (même écran que pour les enregistrements A/CNAME de la [section 8.1](#81-nom-de-domaine--namecheap))
3. Une fois vérifié, soumettre le sitemap : `https://softcosy.store/sitemap.xml`
4. Utiliser **"Inspection d'URL"** sur `https://softcosy.store/` puis **"Demander une
   indexation"** pour accélérer le premier passage du robot Google (sinon indexation naturelle
   en quelques jours à quelques semaines)

> Le tag `<meta name="google-site-verification" ...>` déjà présent dans `site/index.html`
> correspond à l'**ancienne** propriété Search Console (liée à l'ancien domaine Vercel du site
> avant fusion) — il ne vérifie pas automatiquement la nouvelle propriété `softcosy.store`,
> d'où la nécessité de la vérification TXT ci-dessus.

---

## 9. Rôles et permissions

| Fonctionnalité | ADMIN | MANAGER | SELLER |
|----------------|:-----:|:-------:|:------:|
| Tableau de bord | ✓ | ✓ | ✓ |
| Produits (voir + modifier) | ✓ | ✓ | ✓ |
| Stocks (voir + mouvements) | ✓ | ✓ | ✓ |
| Caisse POS | ✓ | ✓ | ✓ |
| Ventes (voir + rembourser) | ✓ | ✓ | ✓ |
| Inventaires physiques | ✓ | ✓ | ✓ |
| Fournisseurs | ✓ | ✓ | ✓ |
| Achats | ✓ | ✓ | ✗ |
| Rapports | ✓ | ✓ | ✗ |
| Gestion utilisateurs | ✓ | ✗ | ✗ |
| Paramètres système | ✓ | ✗ | ✗ |
| Activer/désactiver comptes | ✓ | ✗ | ✗ |

> **Note** : Les permissions sont appliquées à la fois côté frontend (masquage du menu) et côté backend (vérification dans les ViewSets). La boutique publique (`/`) n'a aucune notion de rôle — elle est 100% anonyme.

---

## 10. Flux de travail principaux

### Vente en caisse (POS)

```
1. Vendeur ouvre la page Caisse (/admin/dashboard/cashier)
2. Cherche/filtre les produits par catégorie ou nom
3. Sélectionne la variante souhaitée (taille, modèle)
4. Ajoute au panier, ajuste les quantités si besoin
5. Optionnel : entre le nom du client
6. Clique "Passer au paiement"
7. Entre le montant remis → calcul monnaie automatique
8. Valide la vente

→ Backend : POST /api/sales/
→ Création de la Sale + SaleLines
→ Signal : StockMovement SORTIE × nombre d'articles
→ Stock.on_hand_qty décrémenté
→ Panier vidé, confirmation affichée
```

### Réception d'une commande fournisseur

```
1. Manager crée un achat (/admin/dashboard/purchases)
   → Sélectionne le fournisseur, ajoute les lignes
   → Statut initial : "en attente"
2. À la livraison, change le statut vers "RECU"
   → PATCH /api/purchases/{id}/ avec status="RECU"
3. Backend détecte le changement de statut
   → Crée un StockMovement ENTREE par ligne de commande
   → Stock.on_hand_qty incrémenté
4. Stock immédiatement disponible pour la vente
```

### Remboursement client

```
1. Admin/Manager ouvre la vente dans /admin/dashboard/sales
2. Clique sur la ligne à rembourser
3. Supprime la ligne (DELETE /api/sale-lines/{id}/)
4. Signal déclenché :
   → StockMovement ENTREE créé, motif RETOUR_CLIENT
   → Stock.on_hand_qty incrémenté
   → Totaux de la vente recalculés
5. La vente est mise à jour, le stock restitué
```

### Ajustement manuel de stock

```
1. Utilisateur ouvre /admin/dashboard/stocks
2. Clique "Ajouter un mouvement"
3. Sélectionne le stock/produit concerné
4. Choisit le type : ENTREE | SORTIE | AJUSTEMENT
5. Entre la quantité et le motif
6. Ajoute des notes optionnelles
7. Valide → POST /api/stock-movements/
8. Signal met à jour Stock.on_hand_qty
```

### Inventaire physique

```
1. Démarre un inventaire : POST /api/inventory-counts/
   → Capture l'état actuel des stocks théoriques
2. Pour chaque produit/variante, entre la quantité comptée
   → PATCH /api/inventory-counts/{id}/ avec les lignes
   → Calcul automatique des écarts (comptée - théorique)
3. Analyse les écarts
4. Si corrections nécessaires : crée des mouvements AJUSTEMENT manuellement
5. Marque l'inventaire comme terminé
   → POST /api/inventory-counts/{id}/finish/
```

### Publication d'un produit sur la boutique

```
1. Admin/Manager crée un produit dans /admin/dashboard/products
   → Renseigne nom, catégorie, marque, badge, composition, couleurs
   → Uploade plusieurs photos (galerie) via /api/products/upload-image/
   → Coche "Publié sur le site" (is_published = true)
2. Clique "Créer" → POST /api/products/
3. Le produit est immédiatement disponible via /api/site/products/
4. À son prochain chargement, la boutique (softcosy.store/) l'affiche
```

---

## 11. Sécurité

### Couche réseau
- **HTTPS uniquement** en production (Render + Vercel gèrent les certificats automatiquement)
- **PostgreSQL SSL** : connexion chiffrée (`sslmode=require`)
- **CORS restrictif** : seules les origines déclarées peuvent appeler l'API

### Authentification
- **Tokens DRF** : token unique par utilisateur, révocable
- **django-axes** : lockout après 3 échecs, 5 minutes de blocage
- **Argon2** : hachage de mots de passe résistant aux attaques GPU

### Autorisation
- **Vérification côté backend** sur chaque endpoint (pas seulement côté frontend)
- **Comptes inactifs** par défaut — activation manuelle requise par un admin
- La boutique (`/api/site/*`) est volontairement en lecture seule et publique — aucune donnée
  sensible (coûts, stocks internes) n'y transite

### Validation des données
- Validation DRF sur tous les champs (type, longueur, format)
- Empêche les stocks négatifs (validation dans StockMovement)
- Images validées via Pillow avant stockage

### En-têtes de sécurité HTTP
- `X-Frame-Options: DENY` — anti-clickjacking
- `X-Content-Type-Options: nosniff`
- `Strict-Transport-Security` — HTTPS forcé
- `Content-Security-Policy` — restriction des sources

### Rate limiting
- Anonymes : 100 req/jour (empêche le scraping)
- Authentifiés : 1000 req/heure

### SEO / indexation
- `robots.txt` interdit l'indexation de `/admin/` — l'application de gestion ne doit pas
  apparaître dans les moteurs de recherche

---

## 12. Maintenance et opérations

> **⚠️ Deux « admin » distincts à ne pas confondre** :
> - `softcosy.store/admin` — l'**application de gestion** SoftCosy (Next.js), utilisée au quotidien
>   par les vendeurs/managers/admins de la boutique.
> - `softcosy-backend.onrender.com/admin/` — le **back-office Django natif** (accès superuser
>   Django uniquement), utilisé pour des opérations techniques ponctuelles (voir ci-dessous).

### Backups quotidiens (automatisé)

```bash
# Génère des PDFs des ventes/mouvements et upload sur Google Drive
python manage.py backup_and_cleanup

# Avec une date spécifique
python manage.py backup_and_cleanup --date 2026-01-15

# Test sans suppression
python manage.py backup_and_cleanup --dry-run
```

**Prérequis** : Variables `GOOGLE_OAUTH_CLIENT_SECRETS_PATH` et `GOOGLE_DRIVE_PARENT_FOLDER_ID` configurées.

### Nettoyage des anciens mouvements

```bash
# Supprime les mouvements de stock de plus de 180 jours
python manage.py clean_old_stock_movements
```

**Recommandé** : Exécuter mensuellement (1er du mois).

### Vider les données de test

```bash
# Supprime TOUTES les données sauf les utilisateurs
python manage.py flush_test_data --confirm
```

### Créer le premier admin

```bash
python manage.py ensure_admin \
  --email admin@softcosy.com \
  --password MotDePasseFort! \
  --full_name "Super Admin"
```

Ou via les variables d'environnement (création automatique au démarrage) :
```env
DEFAULT_ADMIN_EMAIL=admin@softcosy.com
DEFAULT_ADMIN_PASSWORD=MotDePasseFort!
DEFAULT_ADMIN_FULL_NAME=Super Admin
```

### Surveillance

- **Render Logs** : Dashboard → Service → Logs (temps réel) — backend uniquement
- **Vercel Logs** : Dashboard → Projet → Deployments → Logs — frontend (boutique + admin)
- **Supabase Console** : Surveillance connexions DB, utilisation disque
- **API Health** : `GET /api/` retourne la liste des endpoints disponibles
- **Django Admin natif** : `https://softcosy-backend.onrender.com/admin/` (accès superuser)

---

## 13. Guide de développement local

### Prérequis

- Python 3.11+
- Node.js 20+
- PostgreSQL (ou compte Supabase)
- Git

### Installation Backend

```bash
cd Backend

python -m venv venv
source venv/bin/activate  # Linux/Mac
venv\Scripts\activate     # Windows

pip install -r requirements.txt

cp .env.example .env
# Éditer .env avec vos credentials DB

python manage.py migrate
python manage.py ensure_admin --email admin@softcosy.com --password admin123

python manage.py runserver
# → http://localhost:8000
```

### Installation Frontend (boutique + application, unifiés)

```bash
cd Frontend

npm install

echo "NEXT_PUBLIC_API_URL=http://127.0.0.1:8000/api" > .env.local

npm run dev
# → http://localhost:3000
```

Un seul serveur de développement suffit désormais pour tester à la fois la boutique et
l'application — il n'y a plus de projet/serveur séparé pour le site vitrine.

### URLs locales

| Service | URL |
|---------|-----|
| Boutique (site vitrine) | `http://localhost:3000/` |
| Application de gestion (login) | `http://localhost:3000/admin` |
| Application de gestion (dashboard) | `http://localhost:3000/admin/dashboard` |
| Backend API | `http://localhost:8000/api` |
| Django Admin natif | `http://localhost:8000/admin` |
| Swagger UI | `http://localhost:8000/api/docs/` |
| ReDoc | `http://localhost:8000/api/redoc/` |

### Structure de dépôt

```
SoftCosy/
├── Backend/                 # Application Django
│   ├── gestion_softcosy/    # Configuration Django
│   ├── user/                # App utilisateurs
│   ├── product/             # App produits (+ endpoints boutique /api/site/)
│   ├── sale/                # App ventes
│   ├── purchase/            # App achats
│   ├── stockmouvement/      # App stocks
│   ├── inventorycount/      # App inventaires
│   ├── dashboard/           # App analytics
│   ├── requirements.txt     # Dépendances Python
│   └── manage.py            # CLI Django
├── Frontend/                 # Application Next.js unifiée (boutique + gestion)
│   ├── site/index.html       # Document HTML brut de la boutique
│   ├── public/                # style.css, favicon.svg, robots.txt, sitemap.xml
│   ├── src/
│   │   ├── app/
│   │   │   ├── route.ts       # GET '/' → sert la boutique
│   │   │   └── admin/          # Login + dashboard (application de gestion)
│   │   ├── components/        # Composants React (application de gestion)
│   │   ├── hooks/              # Hooks personnalisés
│   │   └── lib/                 # Utilitaires (api, auth, queryClient)
│   ├── package.json
│   └── next.config.ts
├── render.yaml               # Configuration déploiement Render (backend uniquement)
└── DOCUMENTATION.md          # Ce fichier
```

---

## 14. Historique des fusions

Ce projet est le résultat de deux fusions successives, documentées ici pour mémoire.

### 14.1 Fusion backend — Django, source unique de vérité

**Objectif (juin 2026)** : avant cette fusion, le site vitrine (`site_softcosy`, backend Express
+ base Supabase séparée) et l'application de gestion (`SoftCosy`, backend Django + base Supabase
séparée) étaient deux systèmes totalement indépendants — un même produit devait être créé deux
fois, avec deux schémas de données différents.

**Changements apportés à Django** :
- Ajout des champs `brand`, `badge`, `icon`, `fabric`, `colors`, `is_published` sur `Product`
- Nouveau modèle `ProductImage` (galerie multi-photos, avec `order`)
- Nouveaux endpoints publics `/api/site/products/` (`SiteProductViewSet`, lecture seule, sans
  authentification, filtre `is_published=True`, transforme les données au format attendu par le
  JS de la boutique)
- Nouveaux endpoints `/api/products/upload-image/` et `/api/products/delete-image/` (upload/
  suppression Cloudinary, authentifiés)
- Commande `migrate_site_products` : importe une fois pour toutes les produits de l'ancienne API
  Express vers Django (résultat : 20 produits, 59 images, 146 variantes, 6 catégories importés
  le 2026-06-18)
- CORS étendu pour autoriser l'ancien frontend du site (Vercel) à appeler Django

**Changements apportés au site (à l'époque encore un projet séparé)** :
- `index.html` : URL de l'API changée d'Express (relative) vers Django (`/api/site/products/`)
- Adaptation au format paginé Django (`{count, next, previous, results}` au lieu d'un tableau brut)
- Suppression de l'admin du site (dossier `admin/`, routes Express associées) — la gestion des
  produits se fait désormais exclusivement depuis l'application Django

**Résultat** : un seul backend, une seule base de données, un produit créé dans l'application de
gestion apparaît automatiquement sur la boutique (via l'API `/api/site/products/`).

### 14.2 Fusion frontend — un seul déploiement, sous un seul domaine

**Objectif (juillet 2026)** : même après la fusion backend, il restait **deux frontends déployés
séparément** — le site vitrine HTML/CSS/JS sur Vercel (`siteweb-softcosy.vercel.app`) et
l'application Next.js sur un déploiement distinct. L'utilisateur a acheté le domaine
`softcosy.store` et souhaitait un seul lien : la racine affiche la boutique, `/admin` donne accès
à l'application de gestion.

**Décisions prises** :
- Le site vitrine (HTML/CSS/JS) est conservé **tel quel**, sans réécriture en React — déplacé
  physiquement dans `SoftCosy/Frontend` (`site/index.html` + assets dans `public/`)
- Un Route Handler Next.js (`src/app/route.ts`) sert ce HTML brut à `GET /`, plutôt qu'une page
  React avec `dangerouslySetInnerHTML` — car cette dernière approche empêche l'exécution du
  `<script>` inline du site (règle du DOM : le HTML injecté via `innerHTML` n'exécute jamais les
  balises `<script>` qu'il contient)
- L'application de gestion est déplacée sous `/admin` : `src/app/page.tsx` (garde d'auth) et
  `src/app/login/page.tsx` fusionnés en `src/app/admin/page.tsx` ; tout `src/app/dashboard/**`
  déplacé vers `src/app/admin/dashboard/**`
- Tous les chemins codés en dur (`sidebar.tsx`, `lib/api.ts`, `lib/auth.ts`, `layout-client.tsx`,
  redirections `router.push`) mis à jour de `/dashboard` et `/login` vers `/admin/dashboard` et
  `/admin` — en prenant soin de ne **pas** toucher aux appels API backend qui utilisent aussi le
  préfixe `/dashboard` (ex. `api.get('/dashboard/summary/')`), sans rapport avec les routes
  frontend
- CORS et `ALLOWED_HOSTS` Django étendus pour `softcosy.store` / `www.softcosy.store`

**Nettoyage post-fusion** :
- Ancien projet séparé `PROJET- site_softcosy` (repo Git, backend Express, DOCUMENTATION.md)
  entièrement supprimé — son contenu vit désormais dans `SoftCosy/Frontend`
- Service Render `softcosy-frontend` retiré de `render.yaml` (le frontend n'a jamais été déployé
  sur Render — c'est Vercel qui l'héberge)
- SVG de démarrage Next.js inutilisés supprimés (`file.svg`, `globe.svg`, `next.svg`,
  `vercel.svg`, `window.svg`)
- `PLAN_FUSION_SITEWEB.md` (journal détaillé de la fusion backend) fusionné dans ce document

**Résultat** : un seul repo, un seul frontend, un seul backend. `https://softcosy.store/` affiche
la boutique, `https://softcosy.store/admin` donne accès à l'application de gestion — plus aucun
lien ni déploiement séparé à maintenir.

---

*Documentation SoftCosy v2.0 — Juillet 2026*
*Réalisé par [Virkas](https://wa.me/+22893953658)*
