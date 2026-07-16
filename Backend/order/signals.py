from django.db.models.signals import pre_save, post_save
from django.dispatch import receiver
from .models import Order


@receiver(pre_save, sender=Order)
def store_old_status(sender, instance, **kwargs):
    """Mémorise l'ancien statut avant sauvegarde, pour détecter une transition."""
    if instance.pk:
        try:
            instance._old_status = Order.objects.get(pk=instance.pk).status
        except Order.DoesNotExist:
            instance._old_status = None
    else:
        instance._old_status = None


@receiver(post_save, sender=Order)
def handle_status_change(sender, instance, created, **kwargs):
    """
    Le stock n'est impacté qu'au passage à "Livré" (choix retenu : pas de
    réservation à la création de la commande) :
    - on ENTRE dans LIVRE  → sortie de stock (la commande quitte le magasin)
    - on QUITTE LIVRE (annulation après livraison) → entrée de stock (retour client)
    """
    from stockmouvement.models import Stock, StockMovement

    old_status = getattr(instance, '_old_status', None)
    new_status = instance.status

    if old_status == new_status:
        return

    entering_livre = new_status == Order.STATUS_LIVRE and old_status != Order.STATUS_LIVRE
    leaving_livre = old_status == Order.STATUS_LIVRE and new_status != Order.STATUS_LIVRE

    if not entering_livre and not leaving_livre:
        return

    for line in instance.lines.select_related('variant').all():
        if not line.variant or not line.quantity:
            continue

        stock, _ = Stock.objects.get_or_create(variant=line.variant)

        if entering_livre:
            StockMovement.objects.create(
                stock=stock,
                movement_type='SORTIE',
                quantite=line.quantity,
                reason='COMMANDE_LIVREE',
                notes=f"Commande #{instance.id} livrée",
            )
        else:
            StockMovement.objects.create(
                stock=stock,
                movement_type='ENTREE',
                quantite=line.quantity,
                reason='RETOUR_CLIENT',
                notes=f"Commande #{instance.id} annulée après livraison",
            )
