from django.shortcuts import render

# Create your views here.
from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.decorators import action
from rest_framework.response import Response
from drf_spectacular.utils import extend_schema_view, extend_schema

from user.permissions import required_page
from .models import InventoryCount, InventoryLine
from .serializers import (
    InventoryCountListSerializer,
    InventoryCountDetailSerializer,
    InventoryCountCreateSerializer,
    InventoryCountUpdateSerializer,
    InventoryLineSerializer,
)


@extend_schema_view(
    list=extend_schema(tags=['inventory-counts'], summary='List inventory lines'),
    create=extend_schema(tags=['inventory-counts'], summary='Create an inventory line'),
    retrieve=extend_schema(tags=['inventory-counts'], summary='Get an inventory line'),
    update=extend_schema(tags=['inventory-counts'], summary='Update an inventory line'),
    partial_update=extend_schema(tags=['inventory-counts'], summary='Partially update an inventory line'),
    destroy=extend_schema(tags=['inventory-counts'], summary='Delete an inventory line'),
)
class InventoryLineViewSet(viewsets.ModelViewSet):
    queryset = InventoryLine.objects.select_related('inventory_count', 'product', 'variant')
    serializer_class = InventoryLineSerializer
    permission_classes = [IsAuthenticated, required_page('inventory')]
    filterset_fields = ['inventory_count', 'product', 'variant']


@extend_schema_view(
    list=extend_schema(tags=['inventory-counts'], summary='List inventory counts'),
    create=extend_schema(tags=['inventory-counts'], summary='Start an inventory count'),
    retrieve=extend_schema(tags=['inventory-counts'], summary='Get an inventory count'),
    update=extend_schema(tags=['inventory-counts'], summary='Update an inventory count'),
    partial_update=extend_schema(tags=['inventory-counts'], summary='Partially update an inventory count'),
    destroy=extend_schema(tags=['inventory-counts'], summary='Delete an inventory count'),
)
class InventoryCountViewSet(viewsets.ModelViewSet):
    queryset = InventoryCount.objects.select_related('user').prefetch_related('lines')
    serializer_class = InventoryCountListSerializer
    permission_classes = [IsAuthenticated, required_page('inventory')]

    def get_serializer_class(self):
        if self.action == 'list':
            return InventoryCountListSerializer
        if self.action == 'retrieve':
            return InventoryCountDetailSerializer
        if self.action == 'create':
            return InventoryCountCreateSerializer
        if self.action in ['update', 'partial_update']:
            return InventoryCountUpdateSerializer
        return super().get_serializer_class()

    @extend_schema(
        tags=['inventory-counts'],
        summary='Mark an inventory count as finished',
        responses={200: {'type': 'object', 'properties': {'detail': {'type': 'string'}}}},
    )
    @action(detail=True, methods=['post'])
    def finish(self, request, pk=None):
        """Marquer l'inventaire comme terminé"""
        inventory = self.get_object()
        if inventory.status == "FINI":
            return Response({"detail": "Inventaire déjà terminé"}, status=400)

        inventory.status = "FINI"
        inventory.save(update_fields=['status'])
        return Response({"detail": "Inventaire marqué comme terminé"})

    def get_queryset(self):
        return super().get_queryset().order_by('-created_at')
