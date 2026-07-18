from django.db import models

# Create your models here.
class Stock(models.Model):
    id = models.AutoField(primary_key=True)
    variant = models.ForeignKey("product.Variant", on_delete=models.CASCADE, null=True, blank=True, related_name="stocks")
    on_hand_qty = models.IntegerField(default=0)
    reserved_qty = models.IntegerField(default=0)
    available_qty = models.IntegerField(default=0)
    last_counted_at = models.DateField(blank=True, null=True)
    created_or_updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "stock"
        verbose_name = "Stock"
        verbose_name_plural = "Stocks"

    def __str__(self):
        return f"Stock {self.id}"


class StockMovement(models.Model):
    """Model for stock movements (mouvements de stock)"""

    # Choix des types de mouvement
    MOVEMENT_TYPE_CHOICES = (
        ("ENTREE", "Entrée"),
        ("SORTIE", "Sortie"),
        ("AJUSTEMENT", "Ajustement"),
    )

    # Choix des raisons (Synchronisé avec le frontend)
    REASON_CHOICES = (
        ("STOCK_INITIAL", "Stock initial (création produit)"),
        ("COMMANDE_LIVREE", "Commande livrée"),
        ("ACHAT_FOURNISSEUR", "Achat fournisseur"),
        ("RETOUR_TEST", "Retour de test"),
        ("CORRECTION_INVENTAIRE", "Correction inventaire"),
        ("CADEAU_PROMO", "Cadeau/Promotion"),
        ("VENTE", "Vente"),
        ("SORTIE_MAGASIN", "Sortie magasin"),
        ("CASSE_PERTE", "Casse/Perte"),
        ("ECHANTILLON", "Echantillon"),
        ("INVENTAIRE_ANNUEL", "Inventaire annuel"),
        ("CORRECTION_MANUELLE", "Correction manuelle"),
        ("PEREMPTION", "Péremption"),
        ("RETOUR_CLIENT", "Retour client"),
        ("REMBOURSEMENT", "Remboursement"),
        ("AUTRE", "Autre"),
    )

    id = models.AutoField(primary_key=True)
    stock = models.ForeignKey("stockmouvement.Stock", on_delete=models.CASCADE, related_name="movements", null=True, blank=True)
    # Pour les mouvements au niveau produit (sans variante), on lie directement au produit
    product = models.ForeignKey("product.Product", on_delete=models.SET_NULL, null=True, blank=True, related_name="stock_movements")
    sale_line = models.ForeignKey("sale.SaleLine", on_delete=models.SET_NULL, null=True, blank=True, related_name="stock_movements")
    purchase_line = models.ForeignKey("purchase.PurchaseLine", on_delete=models.SET_NULL, null=True, blank=True, related_name="stock_movements")
    user = models.ForeignKey("user.User", on_delete=models.SET_NULL, null=True, blank=True, related_name="stock_movements")
    movement_type = models.CharField(max_length=20, choices=MOVEMENT_TYPE_CHOICES)
    quantite = models.IntegerField()
    reason = models.CharField(max_length=32, choices=REASON_CHOICES, null=True, blank=True)
    # Conservé tel quel (utilisé par les scripts de sauvegarde/nettoyage
    # automatiques et une statistique du tableau de bord, sur comparaison de
    # date exacte) — voir created_at ci-dessous pour le tri et l'affichage.
    date = models.DateField(auto_now_add=True)
    # Horodatage précis (date + heure), pour trier/afficher par ordre
    # chronologique réel — "date" seul ne permet pas de distinguer plusieurs
    # mouvements survenus le même jour.
    created_at = models.DateTimeField(auto_now_add=True, null=True)
    notes = models.TextField(null=True, blank=True)

    class Meta:
        db_table = "stockmovement"
        verbose_name = "Stock Movement"
        verbose_name_plural = "Stock Movements"
        ordering = ["-created_at"]

    def __str__(self):
        return f"StockMovement #{self.id} ({self.movement_type})"


class SystemSettings(models.Model):
    """Global system settings for thresholds and notifications"""
    low_stock_threshold = models.IntegerField(default=10)
    critical_stock_threshold = models.IntegerField(default=5)
    notify_low_stock = models.BooleanField(default=True)
    notify_system_updates = models.BooleanField(default=True)
    notify_weekly_report = models.BooleanField(default=True)

    class Meta:
        db_table = "systemsettings"
        verbose_name = "System Settings"
        verbose_name_plural = "System Settings"

    def __str__(self):
        return "Paramètres Système Globaux"
