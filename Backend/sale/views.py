from django.shortcuts import render

# Create your views here.
from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from drf_spectacular.utils import extend_schema_view, extend_schema

from user.permissions import required_page
from .models import Customer, Sale, SaleLine
from .serializers import (
    CustomerSerializer,
    SaleListSerializer,
    SaleDetailSerializer,
    SaleCreateUpdateSerializer,
    SaleLineSerializer,
)


@extend_schema_view(
    list=extend_schema(tags=['sales'], summary='List customers'),
    create=extend_schema(tags=['sales'], summary='Create a customer'),
    retrieve=extend_schema(tags=['sales'], summary='Get a customer'),
    update=extend_schema(tags=['sales'], summary='Update a customer'),
    partial_update=extend_schema(tags=['sales'], summary='Partially update a customer'),
    destroy=extend_schema(tags=['sales'], summary='Delete a customer'),
)
class CustomerViewSet(viewsets.ModelViewSet):
    queryset = Customer.objects.all()
    serializer_class = CustomerSerializer
    permission_classes = [IsAuthenticated, required_page('customers')]
    search_fields = ['name', 'phone']
    ordering_fields = ['name', 'created_at']
    ordering = ['name']


@extend_schema_view(
    list=extend_schema(tags=['sales'], summary='List sale lines'),
    create=extend_schema(tags=['sales'], summary='Create a sale line'),
    retrieve=extend_schema(tags=['sales'], summary='Get a sale line'),
    update=extend_schema(tags=['sales'], summary='Update a sale line'),
    partial_update=extend_schema(tags=['sales'], summary='Partially update a sale line'),
    destroy=extend_schema(tags=['sales'], summary='Delete a sale line'),
)
class SaleLineViewSet(viewsets.ModelViewSet):
    queryset = SaleLine.objects.select_related('sale', 'product', 'variant')
    serializer_class = SaleLineSerializer
    permission_classes = [IsAuthenticated, required_page('sales')]
    filterset_fields = ['sale', 'product', 'variant']


@extend_schema_view(
    list=extend_schema(tags=['sales'], summary='List sales'),
    create=extend_schema(tags=['sales'], summary='Create a sale'),
    retrieve=extend_schema(tags=['sales'], summary='Get a sale'),
    update=extend_schema(tags=['sales'], summary='Update a sale'),
    partial_update=extend_schema(tags=['sales'], summary='Partially update a sale'),
    destroy=extend_schema(tags=['sales'], summary='Delete a sale'),
)
class SaleViewSet(viewsets.ModelViewSet):
    queryset = Sale.objects.select_related('customer', 'user').prefetch_related('lines')
    serializer_class = SaleListSerializer
    search_fields = ['invoice_number', 'customer__name']
    ordering_fields = ['-id', 'sold_at', 'total']
    ordering = ['-id']

    def get_permissions(self):
        # Créer une vente se fait depuis la Caisse ; consulter/modifier
        # l'historique se fait depuis la page Ventes (remboursements inclus).
        if self.action == 'create':
            return [IsAuthenticated(), required_page('cashier')()]
        return [IsAuthenticated(), required_page('sales')()]

    def get_serializer_class(self):
        if self.action == 'list':
            return SaleListSerializer
        if self.action == 'retrieve':
            return SaleDetailSerializer
        if self.action in ['create', 'update', 'partial_update']:
            return SaleCreateUpdateSerializer
        return super().get_serializer_class()
