from rest_framework import serializers
from django.db import transaction
from django.utils import timezone
from .models import Order, OrderLine
from sale.models import Customer
from sale.serializers import CustomerSerializer
from product.models import Product
from product.serializers import ProductListSerializer, VariantSerializer, _extraire_taille


def resolve_customer(phone, name, address):
    """Retrouve le client par téléphone (unique) ou le crée — partagé entre
    la création de commande côté application et côté vitrine publique."""
    customer, created = Customer.objects.get_or_create(
        phone=phone,
        defaults={'name': name or 'Client', 'address': address or None, 'created_at': timezone.now().date()},
    )
    if not created:
        update_fields = []
        if name and customer.name != name:
            customer.name = name
            update_fields.append('name')
        if address and customer.address != address:
            customer.address = address
            update_fields.append('address')
        if update_fields:
            customer.save(update_fields=update_fields)
    return customer


class OrderLineSerializer(serializers.ModelSerializer):
    product_detail = ProductListSerializer(source='product', read_only=True)
    variant_detail = VariantSerializer(source='variant', read_only=True)

    class Meta:
        model = OrderLine
        fields = [
            'id', 'order', 'product', 'product_detail',
            'variant', 'variant_detail', 'variant_label', 'quantity', 'unit_price', 'line_total',
        ]
        read_only_fields = ['id', 'order', 'line_total']


class OrderListSerializer(serializers.ModelSerializer):
    customer = CustomerSerializer(read_only=True)
    user = serializers.StringRelatedField()
    items_count = serializers.SerializerMethodField()

    class Meta:
        model = Order
        fields = [
            'id', 'customer', 'customer_name', 'customer_phone', 'delivery_address',
            'channel', 'payment_mode', 'status', 'subtotal', 'total', 'user',
            'created_at', 'items_count',
        ]

    def get_items_count(self, obj):
        return sum(l.quantity for l in obj.lines.all())


class OrderDetailSerializer(serializers.ModelSerializer):
    customer = CustomerSerializer(read_only=True)
    user = serializers.StringRelatedField()
    lines = OrderLineSerializer(many=True, read_only=True)

    class Meta:
        model = Order
        fields = [
            'id', 'customer', 'customer_name', 'customer_phone', 'delivery_address',
            'channel', 'payment_mode', 'status', 'subtotal', 'total', 'notes', 'user',
            'created_at', 'updated_at', 'lines',
        ]


class OrderCreateSerializer(serializers.ModelSerializer):
    """
    Création manuelle d'une commande dans l'application (staff authentifié,
    channel forcé à APPLICATION par OrderViewSet.perform_create). Les lignes
    référencent directement une variante précise (l'app de gestion connaît
    les variantes, contrairement au site public — voir SiteOrderCreateSerializer).
    Retrouve ou crée le client par téléphone, comme pour les ventes en caisse.
    """
    lines = OrderLineSerializer(many=True)
    customer = CustomerSerializer(read_only=True)

    class Meta:
        model = Order
        fields = [
            'id', 'customer', 'customer_name', 'customer_phone', 'delivery_address',
            'channel', 'payment_mode', 'status', 'notes', 'lines',
        ]
        read_only_fields = ['id', 'channel', 'status']

    def validate_customer_phone(self, value):
        return value.strip()

    def validate_lines(self, value):
        if not value:
            raise serializers.ValidationError("Une commande doit contenir au moins un article.")
        return value

    @transaction.atomic
    def create(self, validated_data):
        lines_data = validated_data.pop('lines', [])
        phone = validated_data.pop('customer_phone')
        name = validated_data.get('customer_name')
        address = validated_data.get('delivery_address')

        customer = resolve_customer(phone, name, address)

        order = Order.objects.create(customer=customer, customer_phone=phone, **validated_data)

        subtotal = 0
        for line_data in lines_data:
            line_total = line_data.get('quantity', 0) * line_data.get('unit_price', 0)
            line = OrderLine.objects.create(order=order, line_total=line_total, **line_data)
            subtotal += line_total

        order.subtotal = subtotal
        order.total = subtotal
        order.save(update_fields=['subtotal', 'total'])
        return order


class OrderStatusUpdateSerializer(serializers.ModelSerializer):
    """Seule la gestion du statut (et des notes) est modifiable après création."""

    class Meta:
        model = Order
        fields = ['status', 'notes']


class SiteOrderLineSerializer(serializers.Serializer):
    """
    Forme d'une ligne telle qu'envoyée par le site vitrine : celui-ci ne
    connaît que le produit + une taille/couleur choisies (texte libre), pas
    l'id exact d'une Variant — voir SiteOrderCreateSerializer._resolve_variant.
    """
    product = serializers.PrimaryKeyRelatedField(queryset=Product.objects.all())
    size = serializers.CharField(required=False, allow_blank=True, default='')
    color = serializers.CharField(required=False, allow_blank=True, default='')
    quantity = serializers.IntegerField(min_value=1)
    unit_price = serializers.FloatField()


class SiteOrderCreateSerializer(serializers.ModelSerializer):
    """Création d'une commande depuis la vitrine publique (site web, sans authentification)."""
    lines = SiteOrderLineSerializer(many=True)
    customer = CustomerSerializer(read_only=True)

    class Meta:
        model = Order
        fields = [
            'id', 'customer', 'customer_name', 'customer_phone', 'delivery_address',
            'payment_mode', 'notes', 'lines',
        ]

    def validate_customer_phone(self, value):
        return value.strip()

    def validate_lines(self, value):
        if not value:
            raise serializers.ValidationError("Une commande doit contenir au moins un article.")
        return value

    def _resolve_variant(self, product, size):
        """Retrouve la variante correspondant à la taille choisie sur le site
        (même logique de normalisation que celle utilisée pour publier les
        tailles disponibles — voir _extraire_taille)."""
        if not size:
            return None
        cible = _extraire_taille(size)
        for v in product.variants.filter(is_active=True):
            if v.size and _extraire_taille(v.size) == cible:
                return v
        return None

    @transaction.atomic
    def create(self, validated_data):
        lines_data = validated_data.pop('lines', [])
        phone = validated_data.pop('customer_phone')
        name = validated_data.get('customer_name')
        address = validated_data.get('delivery_address')

        customer = resolve_customer(phone, name, address)
        order = Order.objects.create(customer=customer, customer_phone=phone, **validated_data)

        subtotal = 0
        for line_data in lines_data:
            product = line_data['product']
            size = line_data.get('size', '')
            color = line_data.get('color', '')
            quantity = line_data['quantity']
            unit_price = line_data['unit_price']
            variant = self._resolve_variant(product, size)

            label_parts = []
            if size:
                label_parts.append(f"Taille: {size}")
            if color:
                label_parts.append(f"Couleur: {color}")

            line_total = quantity * unit_price
            OrderLine.objects.create(
                order=order, product=product, variant=variant,
                quantity=quantity, unit_price=unit_price, line_total=line_total,
                variant_label=' — '.join(label_parts) or None,
            )
            subtotal += line_total

        order.subtotal = subtotal
        order.total = subtotal
        order.save(update_fields=['subtotal', 'total'])
        return order
