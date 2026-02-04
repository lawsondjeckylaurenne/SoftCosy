# 🏪 Sports Inventory Management System

Application **Web et Mobile** permettant la gestion complète de l’inventaire d’un commerce d’articles sportifs  
(maillots, chaussures, accessoires).

---

## 📌 Présentation du Projet

Ce projet vise à fournir une solution moderne et centralisée pour :
- Gérer les produits et leurs variantes (tailles, couleurs, modèles)
- Suivre les stocks en temps réel
- Assurer la traçabilité des mouvements de stock
- Faciliter la prise de décision grâce à des tableaux de bord et indicateurs clés

---

## 🎯 Objectifs

- Réduire les erreurs liées à la gestion manuelle des stocks
- Anticiper les ruptures de stock
- Améliorer la visibilité sur la rotation des produits
- Offrir une expérience utilisateur simple, rapide et sécurisée

---

## 👥 Utilisateurs Cibles

- **Administrateur** : gestion globale du système
- **Responsable de stock** : gestion des produits, variantes et mouvements
- **Vendeur / Employé** : consultation des stocks et sorties rapides

---

## 🧩 Fonctionnalités Principales

### Gestion des Produits
- Création, modification et suppression de produits
- Gestion des catégories sportives
- Images et descriptions détaillées

### Gestion des Variantes
- Tailles, couleurs, modèles
- SKU unique par variante
- Stock par variante

### Gestion des Stocks
- Entrées de stock (achat, retour)
- Sorties de stock (vente, perte)
- Ajustements manuels
- Historique complet et journal d’audit

### Alertes & Notifications
- Seuil minimum de stock
- Alertes de rupture imminente

### Dashboard & Reporting
- Vue globale de l’inventaire
- Produits à forte / faible rotation
- Indicateurs de performance

---

## 🏗️ Architecture Technique

- Architecture **Client / Serveur**
- API centralisée (REST ou GraphQL)
- Séparation Frontend / Backend
- Architecture modulaire et évolutive

---

## 🛠️ Stack Technique (Prévisionnelle)

### Frontend Web
- React
- TypeScript

### Mobile
- React Native

### Backend
- Node.js
- NestJS

### Base de Données
- PostgreSQL
- ORM : Prisma ou TypeORM

### Sécurité
- JWT + Refresh Token
- RBAC (Role-Based Access Control)

---

## 🗄️ Schéma de Base de Données

### Vue Générale
Le système repose sur une base de données relationnelle permettant une gestion fine des produits, variantes et mouvements de stock.

---

### Tables Principales

#### **users**
- id (PK)
- name
- email
- password
- role (ADMIN, MANAGER, SELLER)
- created_at
- updated_at

---

#### **categories**
- id (PK)
- name
- sport_type
- created_at

---

#### **products**
- id (PK)
- name
- brand
- type (maillot, chaussure, accessoire)
- category_id (FK)
- description
- created_at
- updated_at

---

#### **product_variants**
- id (PK)
- product_id (FK)
- sku (unique)
- size
- color
- model
- barcode (optional)
- stock_quantity
- min_stock
- status (ACTIVE, DISCONTINUED)
- created_at
- updated_at

---

#### **suppliers**
- id (PK)
- name
- contact_email
- phone
- created_at

---

#### **stock_movements**
- id (PK)
- variant_id (FK)
- user_id (FK)
- type (IN, OUT, ADJUSTMENT)
- quantity
- reason
- created_at

---

### Relations

- Un **produit** appartient à une **catégorie**
- Un **produit** possède plusieurs **variantes**
- Une **variante** possède plusieurs **mouvements de stock**
- Un **utilisateur** est à l’origine d’un mouvement de stock
- Un **fournisseur** peut être lié à plusieurs produits (évolution future)

---

### Diagramme Logique (simplifié)

```text
USERS ────┐
          └─── STOCK_MOVEMENTS ─── PRODUCT_VARIANTS ─── PRODUCTS ─── CATEGORIES
                                   │
                                   └── STOCK (quantité, seuil)
```
### 🔮 Évolutions Futures

- Gestion multi-magasins
- Intégration POS
- Scan code-barres / QR Code
- Prévision intelligente des stocks
- Module e-commerce

---

## 🤝 Contribution

- Créer une branche dédiée  
- Commits clairs et descriptifs  
- Pull Request pour validation  

---

## 📜 Licence

Projet privé – toute utilisation nécessite une autorisation.

---

## ✉️ Contact

Projet maintenu par **Klaus Lawson**  
Pour toute collaboration ou question, merci de contacter l’équipe projet.