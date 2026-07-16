from rest_framework import serializers
from django.db import transaction
from django.utils import timezone
from .models import Customer, Sale, SaleLine
from product.models import Product, Variant  # ← import depuis product

from product.serializers import ProductListSerializer, VariantSerializer  # ← import depuis product

class CustomerSerializer(serializers.ModelSerializer):
    class Meta:
        model = Customer
        fields = [
            'id',
            'name',
            'phone',
            'address',
            'created_at',
        ]
        read_only_fields = ['id', 'created_at']


class SaleLineSerializer(serializers.ModelSerializer):
    product_detail = ProductListSerializer(source='product', read_only=True)
    variant_detail = VariantSerializer(source='variant', read_only=True)

    class Meta:
        model = SaleLine
        fields = [
            'id',
            'sale',           # read_only en pratique
            'product',
            'product_detail',
            'variant',
            'variant_detail',
            'quantity',
            'unit_price',
            'line_discount',
            'line_total',
            'created_at',
        ]
        read_only_fields = ['id', 'created_at', 'sale', 'line_total']

class SaleListSerializer(serializers.ModelSerializer):
    customer = CustomerSerializer(read_only=True)
    user = serializers.StringRelatedField()  # ou PrimaryKeyRelatedField selon tes besoins
    items_count = serializers.SerializerMethodField()

    class Meta:
        model = Sale
        fields = [
            'id',
            'invoice_number',
            'user',
            'customer',
            'customer_name',
            'sold_at',
            'channel',
            'subtotal',
            'discount_amount',
            'total',
            'status',
            'created_at',
            'items_count',
        ]
        read_only_fields = ['id', 'created_at', 'subtotal', 'total']  # calculés

    def get_items_count(self, obj):
        return sum(line.quantity for line in obj.lines.all())



class SaleDetailSerializer(serializers.ModelSerializer):
    customer = CustomerSerializer(read_only=True)
    user = serializers.StringRelatedField()
    lines = SaleLineSerializer(many=True, read_only=True)

    class Meta:
        model = Sale
        fields = [
            'id',
            'invoice_number',
            'user',
            'customer',
            'customer_name',
            'sold_at',
            'channel',
            'subtotal',
            'discount_amount',
            'total',
            'status',
            'notes',
            'created_at',
            'lines',
        ]
        read_only_fields = ['id', 'created_at', 'subtotal', 'total']


class SaleCreateUpdateSerializer(serializers.ModelSerializer):
    lines = SaleLineSerializer(many=True, required=False)

    # Le client (Customer) n'est jamais fourni directement par son id : il est
    # retrouvé ou créé automatiquement à partir du téléphone, qui est la clé
    # fiable pour retracer un client. Le champ 'customer' devient donc en
    # lecture seule (renvoyé dans la réponse), et écriture via customer_phone.
    customer = CustomerSerializer(read_only=True)
    customer_name = serializers.CharField(max_length=255, required=True, allow_blank=False)
    customer_phone = serializers.CharField(max_length=32, write_only=True, required=True, allow_blank=False)
    customer_address = serializers.CharField(max_length=255, write_only=True, required=False, allow_blank=True)

    class Meta:
        model = Sale
        fields = [
            'id',
            'invoice_number',
            'user',
            'customer',
            'customer_name',
            'customer_phone',
            'customer_address',
            'sold_at',
            'channel',
            'discount_amount',
            'status',
            'notes',
            'lines',
        ]
        read_only_fields = ['id', 'subtotal', 'total']

    def validate_customer_phone(self, value):
        return value.strip()

    def _resolve_customer(self, validated_data):
        """Retrouve le client par téléphone (unique) ou le crée. Met à jour
        le nom/l'adresse si le client existait déjà et que de nouvelles
        infos ont été saisies."""
        phone = validated_data.pop('customer_phone', None)
        address = validated_data.pop('customer_address', '')
        if not phone:
            return

        name = validated_data.get('customer_name') or 'Client'
        customer, created = Customer.objects.get_or_create(
            phone=phone,
            defaults={
                'name': name,
                'address': address or None,
                'created_at': timezone.now().date(),
            },
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

        validated_data['customer'] = customer

    def calculate_line_total(self, line_data):
        """Calcule le total d'une ligne"""
        quantity = line_data.get('quantity', 0)
        unit_price = line_data.get('unit_price', 0)
        line_discount = line_data.get('line_discount', 0)
        
        return (quantity * unit_price) - line_discount

    @transaction.atomic
    def create(self, validated_data):
        lines_data = validated_data.pop('lines', [])

        # Retrouve ou crée le client à partir du téléphone (obligatoire)
        self._resolve_customer(validated_data)

        # S'assurer que sold_at est rempli si non fourni
        if not validated_data.get('sold_at'):
            validated_data['sold_at'] = timezone.now()

        # Création de la vente (sans subtotal/total pour l'instant)
        sale = Sale.objects.create(**validated_data)

        subtotal = 0
        
        for line_data in lines_data:
            # Calcul du total de la ligne AVANT création
            line_total = self.calculate_line_total(line_data)
            
            # On ajoute le total calculé dans les données
            line_data['line_total'] = line_total
            
            # Création de la ligne avec le total correct
            line = SaleLine.objects.create(sale=sale, **line_data)
            
            subtotal += line_total

        # Mise à jour de la vente avec les vrais totaux
        sale.subtotal = subtotal
        sale.total = subtotal - sale.discount_amount
        sale.save(update_fields=['subtotal', 'total'])

        return sale

    @transaction.atomic
    def update(self, instance, validated_data):
        lines_data = validated_data.pop('lines', None)

        # Retrouve/crée le client seulement si un téléphone est fourni
        # (ex: PATCH de remboursement n'envoie ni customer_phone ni customer_name)
        self._resolve_customer(validated_data)

        # Mise à jour des champs simples de la vente
        for attr, value in validated_data.items():
            setattr(instance, attr, value)

        if lines_data is not None:
            # Supprime les anciennes lignes
            instance.lines.all().delete()
            
            subtotal = 0
            
            for line_data in lines_data:
                line_total = self.calculate_line_total(line_data)
                line_data['line_total'] = line_total
                
                SaleLine.objects.create(sale=instance, **line_data)
                subtotal += line_total

            instance.subtotal = subtotal
            instance.total = subtotal - instance.discount_amount

            if not lines_data and instance.status != Sale.STATUS_NONPAYE:
                instance.status = "ANNULE"

        instance.save()
        return instance