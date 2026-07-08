import json
import logging

import cloudinary
import cloudinary.uploader
from django.conf import settings
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.filters import SearchFilter, OrderingFilter
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from drf_spectacular.utils import extend_schema_view, extend_schema

from .models import Category, Product, ProductImage, Variant
from .serializers import (
    CategorySerializer,
    ProductListSerializer,
    ProductDetailSerializer,
    ProductFullSerializer,
    ProductImageSerializer,
    SiteProductSerializer,
    VariantSerializer,
)

logger = logging.getLogger(__name__)


# ──────────────────────────────────────────────────────────────────────────────
# CATÉGORIE
# ──────────────────────────────────────────────────────────────────────────────

@extend_schema_view(
    list=extend_schema(tags=['products'], summary='Lister les catégories'),
    create=extend_schema(tags=['products'], summary='Créer une catégorie'),
    retrieve=extend_schema(tags=['products'], summary='Détail d\'une catégorie'),
    update=extend_schema(tags=['products'], summary='Mettre à jour une catégorie'),
    partial_update=extend_schema(tags=['products'], summary='Mettre à jour partiellement une catégorie'),
    destroy=extend_schema(tags=['products'], summary='Supprimer une catégorie'),
)
class CategoryViewSet(viewsets.ModelViewSet):
    """CRUD complet sur les catégories de produits."""

    queryset           = Category.objects.all()
    serializer_class   = CategorySerializer
    permission_classes = [IsAuthenticated]
    filter_backends    = [SearchFilter, OrderingFilter]
    search_fields      = ['name']
    ordering_fields    = ['name', 'created_at']
    ordering           = ['name']


# ──────────────────────────────────────────────────────────────────────────────
# VARIANTE
# ──────────────────────────────────────────────────────────────────────────────

@extend_schema_view(
    list=extend_schema(tags=['products'], summary='Lister les variantes'),
    create=extend_schema(tags=['products'], summary='Créer une variante'),
    retrieve=extend_schema(tags=['products'], summary='Détail d\'une variante'),
    update=extend_schema(tags=['products'], summary='Mettre à jour une variante'),
    partial_update=extend_schema(tags=['products'], summary='Mettre à jour partiellement une variante'),
    destroy=extend_schema(tags=['products'], summary='Supprimer une variante'),
)
class VariantViewSet(viewsets.ModelViewSet):
    """CRUD complet sur les variantes de produits."""

    queryset           = Variant.objects.select_related('product')
    serializer_class   = VariantSerializer
    permission_classes = [IsAuthenticated]
    filter_backends    = [SearchFilter, OrderingFilter]
    filterset_fields   = ['product', 'is_active', 'size']
    search_fields      = ['sku', 'barcode', 'model']


# ──────────────────────────────────────────────────────────────────────────────
# PRODUIT (application de gestion)
# ──────────────────────────────────────────────────────────────────────────────

@extend_schema_view(
    list=extend_schema(tags=['products'], summary='Lister les produits'),
    create=extend_schema(tags=['products'], summary='Créer un produit'),
    retrieve=extend_schema(tags=['products'], summary='Détail d\'un produit'),
    update=extend_schema(tags=['products'], summary='Mettre à jour un produit'),
    partial_update=extend_schema(tags=['products'], summary='Mettre à jour partiellement un produit'),
    destroy=extend_schema(tags=['products'], summary='Supprimer un produit'),
)
class ProductViewSet(viewsets.ModelViewSet):
    """
    CRUD complet sur les produits depuis l'application de gestion.
    Requiert une authentification par token.
    Gère les variantes imbriquées et la galerie multi-images.
    """

    queryset           = Product.objects.select_related('category').prefetch_related(
        'variants', 'product_images'
    )
    permission_classes = [IsAuthenticated]
    filter_backends    = [SearchFilter, OrderingFilter]
    search_fields      = ['name', 'code_produit', 'variants__sku', 'brand']
    ordering_fields    = ['name', 'brand']
    ordering           = ['name']

    def get_queryset(self):
        """Filtre optionnel par category_id via paramètre de requête."""
        queryset    = super().get_queryset()
        category_id = self.request.query_params.get('category_id')
        if category_id:
            queryset = queryset.filter(category_id=category_id)
        return queryset.distinct()

    def get_serializer_class(self):
        """Choisit le sérialiseur selon l'action en cours."""
        if self.action == 'list':
            return ProductDetailSerializer
        if self.action == 'retrieve':
            return ProductDetailSerializer
        if self.action in ['create', 'update', 'partial_update']:
            return ProductFullSerializer
        return super().get_serializer_class()

    # ── Méthode utilitaire ────────────────────────────────────────────────────

    def _build_multipart_data(self, request):
        """
        Construit un dictionnaire Python propre à partir de request.POST + request.FILES.

        Problème résolu : en multipart/form-data, tous les champs arrivent comme
        des chaînes de caractères. Les champs JSON (variants, product_images_data,
        colors) sont donc envoyés comme chaînes JSON et doivent être parsés.
        request.POST.dict() garantit des valeurs scalaires (jamais de listes).
        """
        # Récupérer les champs texte (toujours des chaînes scalaires)
        data = request.POST.dict()

        # Parser les champs qui contiennent du JSON stringifié
        champs_json = ('variants', 'product_images_data', 'colors')
        for champ in champs_json:
            valeur = data.get(champ, '[]')
            try:
                data[champ] = json.loads(valeur) if isinstance(valeur, str) else valeur
            except (ValueError, TypeError):
                data[champ] = []

        # Ajouter les fichiers uploadés (image legacy si présente)
        for nom_champ, fichier in request.FILES.items():
            data[nom_champ] = fichier

        return data

    # ── Endpoints CRUD ────────────────────────────────────────────────────────

    def create(self, request, *args, **kwargs):
        """Crée un nouveau produit avec ses variantes et ses images."""
        data       = self._build_multipart_data(request)
        serializer = self.get_serializer(data=data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        headers = self.get_success_headers(serializer.data)
        return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)

    def update(self, request, *args, **kwargs):
        """Met à jour un produit existant (PUT ou PATCH)."""
        partial    = kwargs.pop('partial', False)
        instance   = self.get_object()
        data       = self._build_multipart_data(request)
        serializer = self.get_serializer(instance, data=data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        return Response(serializer.data)

    # ── Upload d'image vers Cloudinary ───────────────────────────────────────

    @action(
        detail=False,
        methods=['post'],
        url_path='upload-image',
        permission_classes=[IsAuthenticated],
    )
    def upload_image(self, request):
        """
        Upload une image via default_storage (même logique que user.image).

        Django route automatiquement selon l'environnement :
        - Cloudinary configuré (prod) → upload sur Cloudinary
        - Pas de Cloudinary (dev local) → sauvegarde dans media/products/images/

        Usage :
            POST /api/products/upload-image/
            Content-Type: multipart/form-data
            Body: image=<fichier>

        Réponse :
            {"url": "https://res.cloudinary.com/...", "public_id": "products/images/xyz"}
        """
        from django.core.files.storage import default_storage
        from django.core.files.base import ContentFile

        fichier = request.FILES.get('image')
        if not fichier:
            return Response(
                {'detail': 'Aucun fichier fourni. Envoyez un fichier avec le champ "image".'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            chemin = default_storage.save(
                f'products/images/{fichier.name}',
                ContentFile(fichier.read()),
            )
            url = request.build_absolute_uri(default_storage.url(chemin))
            return Response({
                'url':       url,
                'public_id': chemin,
            }, status=status.HTTP_201_CREATED)

        except Exception as exc:
            logger.error("Erreur upload image : %s", exc)
            return Response(
                {'detail': f'Erreur lors de l\'upload : {exc}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    @action(
        detail=False,
        methods=['delete'],
        url_path='delete-image',
        permission_classes=[IsAuthenticated],
    )
    def delete_image(self, request):
        """
        Supprime une image de Cloudinary via son public_id.

        Usage :
            DELETE /api/products/delete-image/
            Content-Type: application/json
            Body: {"public_id": "products/images/xyz"}

        Également supprime l'entrée ProductImage en base si elle existe.
        """
        public_id = request.data.get('public_id')
        if not public_id:
            return Response(
                {'detail': 'Champ "public_id" requis.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from django.core.files.storage import default_storage

        try:
            # default_storage supprime sur Cloudinary en prod, sur le disque en local
            if default_storage.exists(public_id):
                default_storage.delete(public_id)

            # Supprimer l'entrée ProductImage en base si elle existe
            ProductImage.objects.filter(cloudinary_public_id=public_id).delete()

            return Response({'detail': 'Image supprimee avec succes.'}, status=status.HTTP_200_OK)

        except Exception as exc:
            logger.error("Erreur suppression image : %s", exc)
            return Response(
                {'detail': f'Erreur lors de la suppression : {exc}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


# ──────────────────────────────────────────────────────────────────────────────
# API PUBLIQUE POUR LA VITRINE (sans authentification)
# ──────────────────────────────────────────────────────────────────────────────

class SiteProductViewSet(viewsets.ReadOnlyModelViewSet):
    """
    API publique en lecture seule pour la vitrine Soft&Cosy.

    Retourne uniquement les produits marqués 'is_published=True',
    dans un format JSON compatible avec le JavaScript de la vitrine.
    Aucune authentification requise — accessible depuis le site web public.

    Filtres supportés (paramètres de requête) :
    - ?brand=Nike         → filtre par marque
    - ?category=hauts     → filtre par nom de catégorie
    - ?search=air force   → recherche dans le nom et la description
    """

    queryset = (
        Product.objects
        .filter(is_published=True)
        .select_related('category')
        .prefetch_related('product_images', 'variants')
        .order_by('name')
    )
    serializer_class     = SiteProductSerializer
    # Aucune authentification — accès public
    permission_classes   = [AllowAny]
    authentication_classes = []
    filter_backends      = [SearchFilter, OrderingFilter]
    search_fields        = ['name', 'brand', 'description']
    ordering_fields      = ['name', 'brand']
    ordering             = ['name']

    def get_queryset(self):
        """Ajoute des filtres optionnels par marque et catégorie."""
        queryset = super().get_queryset()

        # Filtre par marque (insensible à la casse)
        brand = self.request.query_params.get('brand')
        if brand:
            queryset = queryset.filter(brand__iexact=brand)

        # Filtre par catégorie (insensible à la casse)
        category = self.request.query_params.get('category')
        if category:
            queryset = queryset.filter(category__name__iexact=category)

        return queryset


class SiteBrandListView(APIView):
    """
    Retourne la liste des marques disponibles sur la vitrine.
    Dérive les marques depuis le champ 'brand' des produits publiés
    (équivalent de l'endpoint GET /api/brands de l'ancienne API Express).

    Réponse : [{"id": 1, "name": "Nike", "slug": "nike"}, ...]
    """

    permission_classes   = [AllowAny]
    authentication_classes = []

    def get(self, request):
        # Récupérer les marques distinctes des produits publiés (non vides)
        marques = (
            Product.objects
            .filter(is_published=True, brand__gt='')
            .values_list('brand', flat=True)
            .distinct()
            .order_by('brand')
        )

        # Construire la réponse au format attendu par le site
        resultat = [
            {
                'id':   idx + 1,
                'name': marque,
                'slug': marque.lower().replace(' ', '-'),
            }
            for idx, marque in enumerate(marques)
        ]
        return Response(resultat)


class SiteCategoryListView(APIView):
    """
    Retourne la liste des catégories ayant au moins un produit publié.
    (Équivalent de l'endpoint GET /api/categories de l'ancienne API Express.)

    Réponse : [{"id": 1, "name": "Hauts", "slug": "hauts"}, ...]
    """

    permission_classes   = [AllowAny]
    authentication_classes = []

    def get(self, request):
        # Catégories qui ont au moins un produit publié
        categories = (
            Category.objects
            .filter(products__is_published=True)
            .distinct()
            .order_by('name')
        )

        resultat = [
            {
                'id':   cat.id,
                'name': cat.name,
                'slug': cat.name.lower().replace(' ', '-'),
            }
            for cat in categories
        ]
        return Response(resultat)
