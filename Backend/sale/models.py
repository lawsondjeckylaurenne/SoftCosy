from django.db import models

class Customer(models.Model):
    """Client/Customer"""

    id = models.AutoField(primary_key=True)
    name = models.CharField(max_length=255)
    phone = models.CharField(max_length=32, unique=True)
    address = models.CharField(max_length=255, blank=True, null=True)
    created_at = models.DateField(blank=True, null=True)

    class Meta:
        db_table = "customer"
        verbose_name = "Customer"
        verbose_name_plural = "Customers"

    def __str__(self):
        return self.name or f"Customer {self.id}"


class Sale(models.Model):
    """Model for sales (Vente)"""

    CHANNEL_STORE = "store"
    CHANNEL_ONLINE = "enLigne"

    STATUS_NONPAYE = "NONPAYE"
    STATUS_PAYE = "PAYE"
    STATUS_PARTIEL = "PARTIEL"

    id = models.AutoField(primary_key=True)
    invoice_number = models.IntegerField(blank=True, null=True)
    user = models.ForeignKey("user.User", on_delete=models.SET_NULL, null=True, blank=True, related_name="sales")
    customer = models.ForeignKey("sale.Customer", on_delete=models.SET_NULL, null=True, blank=True, related_name="sales")
    customer_name = models.CharField(max_length=255, blank=True, null=True, help_text="Nom du client (pour vente rapide)")
    sold_at = models.DateTimeField(blank=True, null=True)
    channel = models.CharField(max_length=32, choices=[(CHANNEL_STORE, "store"), (CHANNEL_ONLINE, "enLigne")], default=CHANNEL_STORE)
    subtotal = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    discount_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    status = models.CharField(max_length=16, choices=[(STATUS_PAYE, "PAYE"), (STATUS_NONPAYE, "NONPAYE"), (STATUS_PARTIEL, "PARTIEL")], default=STATUS_NONPAYE)
    notes = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "sale"
        verbose_name = "Sale"
        verbose_name_plural = "Sales"
        ordering = ["-id"]

    def __str__(self):
        return f"Sale #{self.id}"


class SaleLine(models.Model):
    """Line items for a Sale"""

    id = models.AutoField(primary_key=True)
    sale = models.ForeignKey("sale.Sale", on_delete=models.CASCADE, related_name="lines")
    product = models.ForeignKey("product.Product", on_delete=models.PROTECT, related_name="sale_lines")
    variant = models.ForeignKey("product.Variant", on_delete=models.SET_NULL, null=True, blank=True, related_name="sale_lines")
    quantity = models.IntegerField(default=0)
    unit_price = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    line_discount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    line_total = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "saleline"
        verbose_name = "Sale Line"
        verbose_name_plural = "Sale Lines"

    def __str__(self):
        return f"SaleLine {self.id} (Sale {self.sale_id})"
