from django.db import models
from django.utils import timezone
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db.models import Sum, Count, F, Q
from datetime import timedelta
import decimal

from user.permissions import required_page
from sale.models import Sale, SaleLine
from stockmouvement.models import Stock, StockMovement, SystemSettings
from product.models import Product, Category

class DashboardViewSet(viewsets.ViewSet):

    def get_permissions(self):
        # recent_data (alertes stock faible) est aussi consulté depuis Paramètres
        if self.action == 'recent_data':
            return [IsAuthenticated(), required_page('dashboard', 'settings')()]
        return [IsAuthenticated(), required_page('dashboard')()]

    @action(detail=False, methods=['get'])
    def summary(self, request):
        """Principales statistiques pour les cartes du haut"""
        total_products = Product.objects.count()

        # Valeur du stock (somme de disponible * prix_unitaire)
        total_stock_value = Stock.objects.aggregate(
            total=Sum(F('available_qty') * F('variant__selling_price'), output_field=models.DecimalField())
        )['total'] or 0

        # Alertes actives : nombre de produits distincts dont le stock est sous le seuil
        settings_obj, _ = SystemSettings.objects.get_or_create(id=1)
        active_alerts = Stock.objects.filter(
            available_qty__lte=settings_obj.low_stock_threshold
        ).values('variant__product').distinct().count()

        # CA Total (Ventes totales enregistrées)
        total_sales_amount = Sale.objects.aggregate(Sum('total'))['total__sum'] or 0

        # Remboursements du jour
        today = timezone.now().date()
        refunds_sales = Sale.objects.filter(status='REMBOURSE', sold_at__date=today).count()
        refunds_movements = StockMovement.objects.filter(
            reason__in=['RETOUR_CLIENT', 'REMBOURSEMENT'],
            date=today
        ).count()

        today_refunds = refunds_sales + refunds_movements

        return Response({
            'total_products': total_products,
            'total_stock_value': float(total_stock_value),
            'active_alerts': active_alerts,
            'total_sales_amount': float(total_sales_amount),
            'today_refunds': today_refunds,
        })

    @action(detail=False, methods=['get'])
    def charts(self, request):
        """Données pour le graphique des mouvements (6 derniers mois)"""
        data = []
        now = timezone.now()

        for i in range(5, -1, -1):
            first_day = (now.replace(day=1) - timedelta(days=i*30)).replace(day=1)
            month_name = first_day.strftime('%b')

            ventes = SaleLine.objects.filter(
                sale__sold_at__year=first_day.year,
                sale__sold_at__month=first_day.month
            ).aggregate(Sum('quantity'))['quantity__sum'] or 0

            entrees = StockMovement.objects.filter(
                date__year=first_day.year,
                date__month=first_day.month,
                movement_type='ENTREE'
            ).aggregate(Sum('quantite'))['quantite__sum'] or 0

            data.append({
                'month': month_name,
                'ventes': ventes,
                'entrees': entrees
            })

        return Response(data)

    @action(detail=False, methods=['get'])
    def categories(self, request):
        """Répartition par catégorie pour le Pie Chart"""
        cats = Category.objects.annotate(
            product_count=Count('products')
        ).values('name', 'product_count')

        colors = ['#4f46e5', '#06b6d4', '#f59e0b', '#10b981', '#f43f5e']
        data = []
        for i, c in enumerate(cats):
            data.append({
                'name': c['name'],
                'value': c['product_count'],
                'color': colors[i % len(colors)]
            })
        return Response(data)

    @action(detail=False, methods=['get'])
    def product_performance(self, request):
        """Top produits (plus vendus) et calcul de rotation réelle"""
        top_products = SaleLine.objects.values(
            prod_id=F('product__id'),
            name_val=F('product__name')
        ).annotate(
            sales=Sum('quantity')
        ).order_by('-sales')[:5]

        high_rotation = []
        for p in top_products:
            current_stock = Stock.objects.filter(variant__product_id=p['prod_id']).aggregate(Sum('available_qty'))['available_qty__sum'] or 1
            rotation = round(float(p['sales']) / float(current_stock), 2)

            high_rotation.append({
                'name': p['name_val'],
                'sales': p['sales'],
                'rotation': rotation
            })

        return Response({
            'high_rotation': high_rotation,
            'low_rotation': []
        })

    @action(detail=False, methods=['get'])
    def recent_data(self, request):
        """Produits en stock faible (calculé dynamiquement) et mouvements récents"""
        settings_obj, _ = SystemSettings.objects.get_or_create(id=1)

        # Tous les produits sous le seuil — dédupliqué par produit (pire stock retenu)
        low_stock_qs = Stock.objects.select_related('variant__product').filter(
            available_qty__lte=settings_obj.low_stock_threshold
        ).order_by('available_qty')

        seen_products = set()
        low_stock = []
        for s in low_stock_qs:
            product_name = (
                s.variant.product.name if s.variant and s.variant.product
                else f'Stock #{s.id}'
            )
            if product_name in seen_products:
                continue
            seen_products.add(product_name)
            is_critical = s.available_qty <= settings_obj.critical_stock_threshold
            low_stock.append({
                'id': s.id,
                'titre': 'Rupture de Stock' if s.available_qty <= 0 else ('Stock Critique' if is_critical else 'Stock Faible'),
                'message': f"Le stock pour {product_name} est de {s.available_qty} unités (Seuil: {settings_obj.low_stock_threshold}).",
                'severite': 'critical' if is_critical else 'warning',
            })

        # Mouvements récents
        movements = StockMovement.objects.all().order_by('-date')[:5].values(
            'id',
            product_name=F('stock__variant__product__name'),
            type=F('movement_type'),
            qty=F('quantite'),
            date_val=F('date')
        )

        return Response({
            'low_stock': low_stock,
            'movements': list(movements),
        })
