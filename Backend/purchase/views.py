from django.shortcuts import render

# Create your views here.
from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from drf_spectacular.utils import extend_schema_view, extend_schema

from user.permissions import required_page
from .models import Supplier, Purchase, PurchaseLine
from .serializers import (
    SupplierSerializer,
    PurchaseListSerializer,
    PurchaseDetailSerializer,
    PurchaseCreateUpdateSerializer,
    PurchaseLineSerializer,
)


@extend_schema_view(
    list=extend_schema(tags=['purchases'], summary='List suppliers'),
    create=extend_schema(tags=['purchases'], summary='Create a supplier'),
    retrieve=extend_schema(tags=['purchases'], summary='Get a supplier'),
    update=extend_schema(tags=['purchases'], summary='Update a supplier'),
    partial_update=extend_schema(tags=['purchases'], summary='Partially update a supplier'),
    destroy=extend_schema(tags=['purchases'], summary='Delete a supplier'),
)
class SupplierViewSet(viewsets.ModelViewSet):
    queryset = Supplier.objects.all()
    serializer_class = SupplierSerializer
    permission_classes = [IsAuthenticated, required_page('suppliers')]
    search_fields = ['name', 'phone']
    ordering_fields = ['name', 'created_at']
    ordering = ['name']


@extend_schema_view(
    list=extend_schema(tags=['purchases'], summary='List purchase lines'),
    create=extend_schema(tags=['purchases'], summary='Create a purchase line'),
    retrieve=extend_schema(tags=['purchases'], summary='Get a purchase line'),
    update=extend_schema(tags=['purchases'], summary='Update a purchase line'),
    partial_update=extend_schema(tags=['purchases'], summary='Partially update a purchase line'),
    destroy=extend_schema(tags=['purchases'], summary='Delete a purchase line'),
)
class PurchaseLineViewSet(viewsets.ModelViewSet):
    queryset = PurchaseLine.objects.select_related('purchase', 'product', 'variant')
    serializer_class = PurchaseLineSerializer
    permission_classes = [IsAuthenticated, required_page('purchases')]
    filterset_fields = ['purchase', 'product', 'variant']


@extend_schema_view(
    list=extend_schema(tags=['purchases'], summary='List purchases'),
    create=extend_schema(tags=['purchases'], summary='Create a purchase'),
    retrieve=extend_schema(tags=['purchases'], summary='Get a purchase'),
    update=extend_schema(tags=['purchases'], summary='Update a purchase'),
    partial_update=extend_schema(tags=['purchases'], summary='Partially update a purchase'),
    destroy=extend_schema(tags=['purchases'], summary='Delete a purchase'),
)
class PurchaseViewSet(viewsets.ModelViewSet):
    queryset = Purchase.objects.select_related('supplier').prefetch_related('lines')
    serializer_class = PurchaseListSerializer
    permission_classes = [IsAuthenticated, required_page('purchases')]

    def get_serializer_class(self):
        if self.action == 'list':
            return PurchaseListSerializer
        if self.action == 'retrieve':
            return PurchaseDetailSerializer
        if self.action in ['create', 'update', 'partial_update']:
            return PurchaseCreateUpdateSerializer
        return super().get_serializer_class()

    def get_queryset(self):
        return super().get_queryset().order_by('-id')
