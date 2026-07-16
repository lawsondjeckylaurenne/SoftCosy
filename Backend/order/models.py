from django.db import models


class Order(models.Model):
    """Commande passée sur le site web ou saisie manuellement dans l'application.

    Distincte d'une Sale (vente caisse) : une commande a un cycle de vie de
    livraison (en attente → en cours → livrée/annulée) avant d'être remise
    physiquement au client.
    """

    CHANNEL_SITE = "SITE_WEB"
    CHANNEL_APP = "APPLICATION"
    CHANNEL_CHOICES = (
        (CHANNEL_SITE, "Site web"),
        (CHANNEL_APP, "Application"),
    )

    STATUS_EN_ATTENTE = "EN_ATTENTE"
    STATUS_EN_COURS = "EN_COURS"
    STATUS_LIVRE = "LIVRE"
    STATUS_ANNULE = "ANNULE"
    STATUS_CHOICES = (
        (STATUS_EN_ATTENTE, "En attente"),
        (STATUS_EN_COURS, "En cours"),
        (STATUS_LIVRE, "Livré"),
        (STATUS_ANNULE, "Annulé"),
    )

    PAYMENT_CASH = "CASH_LIVRAISON"
    PAYMENT_MOBILE = "MOBILE_MONEY"
    PAYMENT_CHOICES = (
        (PAYMENT_CASH, "Paiement à la livraison"),
        (PAYMENT_MOBILE, "Mobile Money"),
    )

    id = models.AutoField(primary_key=True)
    customer = models.ForeignKey("sale.Customer", on_delete=models.SET_NULL, null=True, blank=True, related_name="orders")
    customer_name = models.CharField(max_length=255)
    customer_phone = models.CharField(max_length=32)
    delivery_address = models.CharField(max_length=255, blank=True, null=True)
    channel = models.CharField(max_length=16, choices=CHANNEL_CHOICES, default=CHANNEL_APP)
    payment_mode = models.CharField(max_length=20, choices=PAYMENT_CHOICES, default=PAYMENT_CASH)
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default=STATUS_EN_ATTENTE)
    subtotal = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    notes = models.TextField(blank=True, null=True)
    # Vide si la commande vient du site web ; renseigné si un membre du staff l'a saisie manuellement
    user = models.ForeignKey("user.User", on_delete=models.SET_NULL, null=True, blank=True, related_name="orders_created")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "customerorder"
        verbose_name = "Order"
        verbose_name_plural = "Orders"
        ordering = ["-id"]

    def __str__(self):
        return f"Commande #{self.id}"


class OrderLine(models.Model):
    """Ligne d'article d'une commande"""

    id = models.AutoField(primary_key=True)
    order = models.ForeignKey("order.Order", on_delete=models.CASCADE, related_name="lines")
    product = models.ForeignKey("product.Product", on_delete=models.PROTECT, related_name="order_lines")
    variant = models.ForeignKey("product.Variant", on_delete=models.SET_NULL, null=True, blank=True, related_name="order_lines")
    quantity = models.IntegerField(default=0)
    unit_price = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    line_total = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    # Description libre (ex: "Taille: M — Couleur: Noir") : la vitrine publique
    # ne connaît pas les variantes exactes, seulement une taille/couleur choisies.
    variant_label = models.CharField(max_length=255, blank=True, null=True)

    class Meta:
        db_table = "orderline"
        verbose_name = "Order Line"
        verbose_name_plural = "Order Lines"

    def __str__(self):
        return f"OrderLine {self.id} (Order {self.order_id})"
