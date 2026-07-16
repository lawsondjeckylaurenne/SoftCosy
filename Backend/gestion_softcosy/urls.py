"""
Configuration des URLs pour le projet gestion_softcosy.

Ce fichier centralise toutes les routes de l'API :
- /api/          → Application de gestion (authentifiée)
- /api/site/     → Vitrine publique (sans authentification)
"""

from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView, SpectacularRedocView

# Import des vues de l'application de gestion
from user.views import CustomObtainAuthToken, UserViewSet
from product.views import (
    CategoryViewSet, ProductViewSet, VariantViewSet,
    SiteProductViewSet, SiteBrandListView, SiteCategoryListView,
)
from sale.views import CustomerViewSet, SaleViewSet, SaleLineViewSet
from stockmouvement.views import StockViewSet, StockMovementViewSet, SystemSettingsViewSet
from purchase.views import SupplierViewSet, PurchaseViewSet, PurchaseLineViewSet
from inventorycount.views import InventoryCountViewSet, InventoryLineViewSet
from order.views import OrderViewSet, SiteOrderCreateView
from dashboard.views import DashboardViewSet

# ── Router principal — application de gestion (routes authentifiées) ──────────
router = DefaultRouter()
router.register(r'users',            UserViewSet,           basename='user')
router.register(r'categories',       CategoryViewSet,       basename='category')
router.register(r'products',         ProductViewSet,        basename='product')
router.register(r'variants',         VariantViewSet,        basename='variant')
router.register(r'customers',        CustomerViewSet,       basename='customer')
router.register(r'sales',            SaleViewSet,           basename='sale')
router.register(r'sale-lines',       SaleLineViewSet,       basename='sale-line')
router.register(r'stocks',           StockViewSet,          basename='stock')
router.register(r'stock-movements',  StockMovementViewSet,  basename='stock-movement')
router.register(r'suppliers',        SupplierViewSet,       basename='supplier')
router.register(r'purchases',        PurchaseViewSet,       basename='purchase')
router.register(r'purchase-lines',   PurchaseLineViewSet,   basename='purchase-line')
router.register(r'inventory-counts', InventoryCountViewSet, basename='inventory-count')
router.register(r'inventory-lines',  InventoryLineViewSet,  basename='inventory-line')
router.register(r'orders',           OrderViewSet,          basename='order')
router.register(r'settings',         SystemSettingsViewSet, basename='system-settings')
router.register(r'dashboard',        DashboardViewSet,      basename='dashboard')

# ── Router vitrine — API publique pour le site web (sans authentification) ────
router_site = DefaultRouter()
router_site.register(r'products', SiteProductViewSet, basename='site-product')

urlpatterns = [
    # ── Authentification ──────────────────────────────────────────────────────
    path('api/token/', CustomObtainAuthToken.as_view(), name='api_token_auth'),

    # ── Interface d'administration Django ─────────────────────────────────────
    path('admin/', admin.site.urls),

    # ── API de gestion (authentifiée) ─────────────────────────────────────────
    path('api/', include(router.urls)),

    # ── API publique pour la vitrine ──────────────────────────────────────────
    # Ces endpoints sont accessibles sans token depuis le site web public.
    # /api/site/products/   → liste et détail des produits publiés
    # /api/site/brands/     → liste des marques disponibles
    # /api/site/categories/ → liste des catégories avec produits publiés
    path('api/site/', include(router_site.urls)),
    path('api/site/brands/',     SiteBrandListView.as_view(),    name='site-brands'),
    path('api/site/categories/', SiteCategoryListView.as_view(), name='site-categories'),
    path('api/site/orders/',     SiteOrderCreateView.as_view(),  name='site-order-create'),

    # ── Documentation API (Swagger / ReDoc) ───────────────────────────────────
    path('api/schema/', SpectacularAPIView.as_view(),                        name='schema'),
    path('api/docs/',   SpectacularSwaggerView.as_view(url_name='schema'),   name='swagger-ui'),
    path('api/redoc/',  SpectacularRedocView.as_view(url_name='schema'),     name='redoc'),
]

# En mode développement : servir les fichiers statiques et médias via Django
if settings.DEBUG:
    import debug_toolbar
    urlpatterns += [path('__debug__/', include('debug_toolbar.urls'))]
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
