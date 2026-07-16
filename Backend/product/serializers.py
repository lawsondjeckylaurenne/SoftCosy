import json

from rest_framework import serializers
from django.db import transaction

from .models import Category, Product, ProductImage, Variant

# Tailles standards dans l'ordre logique d'affichage (du plus petit au plus grand).
# Utilisé par SiteProductSerializer pour extraire et trier les tailles de variantes
# dont le champ 'size' peut contenir "TAILLE / COULEUR" ou "COULEUR / TAILLE".
_TAILLES_ORDONNEES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '2XL', '3XL', '4XL', '5XL', 'UNIQUE']
_TAILLE_RANG       = {t: i for i, t in enumerate(_TAILLES_ORDONNEES)}


def _extraire_taille(valeur_size):
    """
    Depuis un champ size de variante ("3XL", "3XL / Noir", "Noir / 3XL", "38"),
    extrait la partie taille reconnue. Cherche dans chaque segment séparé par '/'
    pour être robuste à l'ordre d'encodage dans l'app de gestion.
    Retourne la taille en majuscule si standard, ou le premier segment sinon.
    """
    segments = [s.strip().upper() for s in valeur_size.split('/')]
    for seg in segments:
        if seg in _TAILLE_RANG:
            return seg
        # Taille numérique (ex: pointure 38, 42…)
        if seg.isdigit():
            return seg
    return segments[0]


def _rang_taille(taille):
    """Clé de tri : tailles standard d'abord (XS→5XL), puis numériques, puis autres."""
    if taille in _TAILLE_RANG:
        return (0, _TAILLE_RANG[taille], '')
    if taille.isdigit():
        return (1, int(taille), '')
    return (2, 0, taille)


# ──────────────────────────────────────────────────────────────────────────────
# CATÉGORIE
# ──────────────────────────────────────────────────────────────────────────────

class CategorySerializer(serializers.ModelSerializer):
    """Sérialiseur pour les catégories (lecture et écriture)."""

    class Meta:
        model = Category
        fields = ['id', 'name', 'description', 'image_url', 'created_at']
        read_only_fields = ['created_at']


# ──────────────────────────────────────────────────────────────────────────────
# IMAGE DE PRODUIT
# ──────────────────────────────────────────────────────────────────────────────

class ProductImageSerializer(serializers.ModelSerializer):
    """
    Sérialiseur pour une image de la galerie d'un produit.
    Utilisé en lecture pour afficher la galerie, et comme structure
    attendue dans le champ write-only 'product_images_data'.
    """

    class Meta:
        model = ProductImage
        fields = ['id', 'image_url', 'cloudinary_public_id', 'order']
        read_only_fields = ['id']


# ──────────────────────────────────────────────────────────────────────────────
# VARIANTE
# ──────────────────────────────────────────────────────────────────────────────

class VariantSerializer(serializers.ModelSerializer):
    """
    Sérialiseur pour les variantes de produit.
    - 'stock' est calculé dynamiquement depuis la table Stock (lecture seule).
    - 'initial_stock' est accepté en écriture pour créer un mouvement d'entrée.
    """

    id            = serializers.IntegerField(required=False)
    selling_price = serializers.FloatField()
    stock         = serializers.SerializerMethodField(read_only=True)
    initial_stock = serializers.IntegerField(required=False, write_only=True, default=0)

    class Meta:
        model = Variant
        fields = [
            'id', 'product', 'sku', 'barcode', 'model', 'size',
            'selling_price', 'cost_price', 'attributes', 'is_active',
            'created_or_updated_at', 'stock', 'initial_stock',
        ]
        read_only_fields = ['created_or_updated_at', 'product', 'stock']

    def get_stock(self, obj):
        """Calcule le stock total de cette variante (somme de tous ses enregistrements Stock)."""
        return sum(s.on_hand_qty for s in obj.stocks.all())


# ──────────────────────────────────────────────────────────────────────────────
# PRODUIT — LISTE (application de gestion)
# ──────────────────────────────────────────────────────────────────────────────

class ProductListSerializer(serializers.ModelSerializer):
    """
    Sérialiseur léger pour l'endpoint LIST de l'application de gestion.
    Inclut la catégorie imbriquée, le stock total calculé, les variantes
    et la galerie d'images.
    """

    category      = CategorySerializer(read_only=True)
    total_stock   = serializers.SerializerMethodField()
    variants      = VariantSerializer(many=True, read_only=True)
    product_images = ProductImageSerializer(many=True, read_only=True)

    class Meta:
        model = Product
        fields = [
            'id', 'name', 'description', 'code_produit',
            'brand', 'badge', 'icon', 'fabric', 'colors', 'is_published',
            'category', 'total_stock', 'variants', 'product_images',
        ]

    def get_total_stock(self, obj):
        """Calcule le stock total du produit en additionnant les stocks de toutes ses variantes."""
        from stockmouvement.models import Stock
        from django.db.models import Sum
        return (
            Stock.objects.filter(variant__product=obj)
            .aggregate(Sum('on_hand_qty'))['on_hand_qty__sum'] or 0
        )


# ──────────────────────────────────────────────────────────────────────────────
# PRODUIT — DÉTAIL (application de gestion)
# ──────────────────────────────────────────────────────────────────────────────

class ProductDetailSerializer(serializers.ModelSerializer):
    """
    Sérialiseur complet pour l'endpoint RETRIEVE de l'application de gestion.
    Identique à ProductListSerializer mais destiné à l'affichage d'un seul produit.
    """

    category      = CategorySerializer(read_only=True)
    variants      = VariantSerializer(many=True, read_only=True)
    total_stock   = serializers.SerializerMethodField()
    product_images = ProductImageSerializer(many=True, read_only=True)

    class Meta:
        model = Product
        fields = [
            'id', 'name', 'description', 'code_produit',
            'brand', 'badge', 'icon', 'fabric', 'colors', 'is_published',
            'category', 'variants', 'total_stock', 'product_images',
        ]

    def get_total_stock(self, obj):
        """Calcule le stock total du produit."""
        from stockmouvement.models import Stock
        from django.db.models import Sum
        return (
            Stock.objects.filter(variant__product=obj)
            .aggregate(Sum('on_hand_qty'))['on_hand_qty__sum'] or 0
        )


# ──────────────────────────────────────────────────────────────────────────────
# PRODUIT — CRÉATION / MISE À JOUR (application de gestion)
# ──────────────────────────────────────────────────────────────────────────────

class ProductFullSerializer(serializers.ModelSerializer):
    """
    Sérialiseur principal pour CREATE et UPDATE d'un produit depuis l'application.

    Gère :
    - Les variantes imbriquées (création, mise à jour, suppression intelligente)
    - La galerie d'images via 'product_images_data' (write-only, liste JSON)
    - Les nouveaux champs de la vitrine (brand, badge, icon, fabric, colors, is_published)
    - Le parsing automatique des champs JSON envoyés en chaîne depuis FormData
    """

    # Catégorie en lecture seule (pour l'affichage après création/mise à jour)
    category = CategorySerializer(read_only=True)

    # Accepter l'ID de catégorie en écriture (ex: category_id=3)
    category_id = serializers.PrimaryKeyRelatedField(
        queryset=Category.objects.all(),
        source='category',
        write_only=True,
        required=False,
        allow_null=True,
    )

    # Variantes imbriquées (créées/mises à jour en même temps que le produit)
    variants = VariantSerializer(many=True, required=False)

    # Galerie d'images en lecture (retournée après sauvegarde)
    product_images = ProductImageSerializer(many=True, read_only=True)

    # Galerie d'images en écriture :
    # Le frontend envoie une liste JSON de {image_url, cloudinary_public_id, order}
    # après avoir uploadé chaque image via POST /api/products/upload-image/
    product_images_data = serializers.ListField(
        child=serializers.DictField(),
        write_only=True,
        required=False,
        default=list,
    )

    class Meta:
        model = Product
        fields = [
            'id', 'name', 'description', 'code_produit',
            'brand', 'badge', 'icon', 'fabric', 'colors', 'is_published',
            'category', 'category_id',
            'variants', 'product_images', 'product_images_data',
        ]
        read_only_fields = ['id']

    def to_internal_value(self, data):
        """
        Pré-traitement des données avant validation.
        Les champs JSON (variants, product_images_data, colors) peuvent arriver
        sous forme de chaîne JSON depuis FormData — on les parse ici.
        """
        # Travailler sur une copie mutable du dictionnaire
        mutable = dict(data)

        # Parser les champs qui peuvent être des chaînes JSON
        for champ in ('variants', 'product_images_data', 'colors'):
            valeur = mutable.get(champ)
            if isinstance(valeur, str):
                try:
                    mutable[champ] = json.loads(valeur)
                except (ValueError, TypeError):
                    mutable[champ] = []

        return super().to_internal_value(mutable)

    @transaction.atomic
    def create(self, validated_data):
        """
        Crée un produit avec ses variantes et sa galerie d'images.
        Tout est exécuté dans une transaction atomique : si une partie échoue,
        rien n'est sauvegardé en base.
        """
        from stockmouvement.models import Stock, StockMovement

        # Extraire les données imbriquées avant de créer le produit
        variants_data   = validated_data.pop('variants', [])
        images_data     = validated_data.pop('product_images_data', [])

        # Créer le produit principal
        product = Product.objects.create(**validated_data)

        # Créer les images de la galerie (ordre respecté)
        for img in images_data:
            ProductImage.objects.create(
                product=product,
                image_url=img.get('image_url', ''),
                cloudinary_public_id=img.get('cloudinary_public_id', ''),
                order=img.get('order', 0),
            )

        # Créer les variantes et leur stock initial
        for variant_data in variants_data:
            initial_stock = variant_data.pop('initial_stock', 0)
            variant = Variant.objects.create(product=product, **variant_data)

            # Créer un mouvement d'entrée si un stock initial est spécifié
            if initial_stock and initial_stock > 0:
                stock_obj, _ = Stock.objects.get_or_create(variant=variant)
                StockMovement.objects.create(
                    stock=stock_obj,
                    movement_type='ENTREE',
                    quantite=initial_stock,
                    reason='STOCK_INITIAL',
                    notes='Stock initial à la création du produit',
                )

        return product

    @transaction.atomic
    def update(self, instance, validated_data):
        """
        Met à jour un produit existant.
        - Galerie d'images : si 'product_images_data' est fourni, l'ancienne galerie
          est entièrement remplacée par la nouvelle.
        - Variantes : mise à jour intelligente (ajout/modification/suppression).
        """
        from stockmouvement.models import Stock, StockMovement

        # Extraire les données imbriquées
        variants_data = validated_data.pop('variants', None)
        images_data   = validated_data.pop('product_images_data', None)

        # Mettre à jour tous les champs scalaires du produit
        champs_a_mettre_a_jour = [
            'name', 'description', 'code_produit',
            'brand', 'badge', 'icon', 'fabric', 'colors', 'is_published', 'category',
        ]
        for champ in champs_a_mettre_a_jour:
            if champ in validated_data:
                setattr(instance, champ, validated_data[champ])
        instance.save()

        # ── Mise à jour de la galerie d'images ───────────────────────────────
        # Si une nouvelle liste d'images est envoyée, on remplace toute la galerie.
        # Si rien n'est envoyé, on conserve les images existantes intactes.
        if images_data is not None:
            # Supprimer toutes les images actuelles
            instance.product_images.all().delete()
            # Recréer avec les nouvelles
            for img in images_data:
                ProductImage.objects.create(
                    product=instance,
                    image_url=img.get('image_url', ''),
                    cloudinary_public_id=img.get('cloudinary_public_id', ''),
                    order=img.get('order', 0),
                )

        # ── Mise à jour intelligente des variantes ────────────────────────────
        if variants_data is not None:
            # Index des variantes existantes par leur ID
            variantes_existantes = {v.id: v for v in instance.variants.all()}
            ids_recus = []

            for variant_data in variants_data:
                variant_id = variant_data.get('id')

                if variant_id and variant_id in variantes_existantes:
                    # Variante déjà existante → mise à jour
                    variant      = variantes_existantes[variant_id]
                    initial_stock = variant_data.pop('initial_stock', None)
                    for attr, valeur in variant_data.items():
                        setattr(variant, attr, valeur)
                    variant.save()

                    # Ajustement du stock si une valeur cible est fournie
                    if initial_stock is not None:
                        stock_obj, _ = Stock.objects.get_or_create(variant=variant)
                        diff = initial_stock - stock_obj.on_hand_qty
                        if diff != 0:
                            StockMovement.objects.create(
                                stock=stock_obj,
                                movement_type='ENTREE' if diff > 0 else 'SORTIE',
                                quantite=abs(diff),
                                reason='CORRECTION_MANUELLE',
                                notes='Correction de stock via modification du produit',
                            )
                    ids_recus.append(variant_id)
                else:
                    # Nouvelle variante → création
                    initial_stock = variant_data.pop('initial_stock', 0)
                    variant = Variant.objects.create(product=instance, **variant_data)
                    if initial_stock and initial_stock > 0:
                        stock_obj, _ = Stock.objects.get_or_create(variant=variant)
                        StockMovement.objects.create(
                            stock=stock_obj,
                            movement_type='ENTREE',
                            quantite=initial_stock,
                            reason='STOCK_INITIAL',
                            notes='Stock initial à la création de la variante',
                        )
                    ids_recus.append(variant.id)

            # Supprimer les variantes absentes de la liste reçue
            for variant_id, variant in variantes_existantes.items():
                if variant_id not in ids_recus:
                    variant.delete()

        return instance


# ──────────────────────────────────────────────────────────────────────────────
# SÉRIALISEURS POUR LA VITRINE (format attendu par le JS du site web)
# ──────────────────────────────────────────────────────────────────────────────

class SiteProductSerializer(serializers.ModelSerializer):
    """
    Sérialiseur pour l'API publique de la vitrine Soft&Cosy.

    Transforme les données Django en format JSON attendu par le JavaScript
    du site web (index.html). Ce format est identique à ce que retournait
    l'ancienne API Express Node.js.

    Champs transformés :
    - 'sku'      ← code_produit
    - 'category' ← [category.name.lower()] (tableau pour compat site web)
    - 'price'    ← prix minimum parmi les variantes actives
    - 'sizes'    ← liste des tailles des variantes actives (sans doublons)
    - 'images'   ← URLs Cloudinary de la galerie (triées par order)
    """

    # Le SKU du site correspond au code_produit de Django
    sku = serializers.CharField(source='code_produit', read_only=True)

    # La catégorie est retournée comme tableau de chaînes (ex: ["hauts"])
    category = serializers.SerializerMethodField()

    # Prix de vente minimum parmi les variantes actives
    price = serializers.SerializerMethodField()

    # Liste des tailles disponibles (extraites des variantes actives)
    sizes = serializers.SerializerMethodField()

    # URLs des images de la galerie (Cloudinary), triées par ordre
    images = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = [
            'id', 'sku', 'name', 'brand', 'category',
            'price', 'sizes', 'colors', 'fabric', 'description',
            'images', 'icon', 'badge',
        ]

    def get_category(self, obj):
        """Retourne la catégorie comme tableau de chaînes (format attendu par le site)."""
        if obj.category:
            return [obj.category.name.lower()]
        return []

    def get_price(self, obj):
        """
        Retourne le prix le plus bas parmi les variantes actives.
        Si aucune variante active avec prix, retourne 0.
        """
        prix_actifs = [
            v.selling_price
            for v in obj.variants.all()
            if v.is_active and v.selling_price is not None
        ]
        return int(min(prix_actifs)) if prix_actifs else 0

    def get_sizes(self, obj):
        """
        Retourne les tailles disponibles, dédoublonnées et triées dans l'ordre logique
        (XS → S → M → L → XL → 2XL → 3XL → 4XL).

        Le champ size d'une variante peut contenir "TAILLE", "TAILLE / COULEUR" ou
        "COULEUR / TAILLE" selon comment l'utilisateur a saisi la variante dans l'app
        de gestion. _extraire_taille() identifie la taille dans chaque segment,
        puis _rang_taille() trie dans l'ordre standard.
        """
        deja_vus = set()
        tailles  = []
        for v in obj.variants.all():
            if not (v.is_active and v.size):
                continue
            taille = _extraire_taille(v.size)
            if taille not in deja_vus:
                deja_vus.add(taille)
                tailles.append(taille)
        return sorted(tailles, key=_rang_taille)

    def get_images(self, obj):
        """Retourne les URLs Cloudinary de la galerie, triées par ordre."""
        return [
            img.image_url
            for img in obj.product_images.order_by('order')
            if img.image_url
        ]
