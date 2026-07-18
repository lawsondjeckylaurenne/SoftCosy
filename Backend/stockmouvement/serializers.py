from rest_framework import serializers
from .models import Stock, StockMovement, SystemSettings


class StockSerializer(serializers.ModelSerializer):
    variant_sku = serializers.CharField(source='variant.sku', read_only=True)
    product_name = serializers.CharField(source='variant.product.name', read_only=True)
    # Permet de regrouper/additionner le stock réel par produit côté frontend
    # (ex: page Stocks) sans avoir à re-dériver ça d'un historique de mouvements.
    product_id = serializers.IntegerField(source='variant.product.id', read_only=True, default=None)

    class Meta:
        model = Stock
        fields = [
            'id', 'variant', 'variant_sku', 'product_id', 'product_name',
            'on_hand_qty', 'reserved_qty', 'available_qty',
            'last_counted_at', 'created_or_updated_at'
        ]
        read_only_fields = ['id', 'created_or_updated_at', 'available_qty']


class StockMovementSerializer(serializers.ModelSerializer):
    variant_sku = serializers.SerializerMethodField(read_only=True)
    product_name = serializers.SerializerMethodField(read_only=True)
    product_id = serializers.SerializerMethodField(read_only=True)
    # Libellé lisible de la raison (ex: "Stock initial (création produit)"),
    # pour ne plus jamais afficher le code technique brut dans l'interface.
    reason_display = serializers.CharField(source='get_reason_display', read_only=True)

    class Meta:
        model = StockMovement
        fields = [
            'id', 'stock', 'product', 'variant_sku', 'product_name', 'product_id',
            'sale_line', 'purchase_line', 'user',
            'movement_type', 'quantite', 'reason', 'reason_display', 'date', 'created_at', 'notes'
        ]
        read_only_fields = ['id', 'date', 'created_at', 'user']

    def get_variant_sku(self, obj):
        if obj.stock and obj.stock.variant:
            return obj.stock.variant.sku
        return None

    def get_product_name(self, obj):
        # Chain: direct product → stock.variant.product → purchase_line.product → sale_line.product
        if obj.product:
            return obj.product.name
        if obj.stock and obj.stock.variant and obj.stock.variant.product:
            return obj.stock.variant.product.name
        if obj.purchase_line and obj.purchase_line.product:
            return obj.purchase_line.product.name
        if obj.sale_line and obj.sale_line.product:
            return obj.sale_line.product.name
        return None

    def get_product_id(self, obj):
        if obj.product:
            return obj.product.id
        if obj.stock and obj.stock.variant and obj.stock.variant.product:
            return obj.stock.variant.product.id
        if obj.purchase_line and obj.purchase_line.product:
            return obj.purchase_line.product.id
        if obj.sale_line and obj.sale_line.product:
            return obj.sale_line.product.id
        return None

    def validate(self, data):
        # Prevent negative stock (only for variant-linked movements)
        movement_type = data.get('movement_type', getattr(self.instance, 'movement_type', None))
        quantite = data.get('quantite', getattr(self.instance, 'quantite', None))
        stock = data.get('stock', getattr(self.instance, 'stock', None))

        if stock and quantite and movement_type:
            current_stock_qty = stock.on_hand_qty

            # If updating, we must consider the old movement effect
            old_effect = 0
            if self.instance and self.instance.pk:
                old_qty = self.instance.quantite
                old_type = self.instance.movement_type
                if old_type in ["ENTREE", "AJUSTEMENT"]:
                    old_effect = old_qty
                else:
                    old_effect = -old_qty

            new_effect = quantite if movement_type in ["ENTREE", "AJUSTEMENT"] else -quantite
            resulting_stock = current_stock_qty - old_effect + new_effect

            if resulting_stock < 0:
                raise serializers.ValidationError({
                    "quantite": f"Opération refusée : le stock final serait de {resulting_stock}. Vous n'avez pas assez d'articles."
                })

        return data


class SystemSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = SystemSettings
        fields = '__all__'
