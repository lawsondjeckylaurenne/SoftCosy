from django.shortcuts import render

# Create your views here.
from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import Stock, StockMovement, SystemSettings
from .serializers import StockSerializer, StockMovementSerializer, SystemSettingsSerializer
from drf_spectacular.utils import extend_schema_view, extend_schema
from user.permissions import required_page



@extend_schema_view(
    list=extend_schema(tags=['stock'], summary='List stock levels'),
    create=extend_schema(tags=['stock'], summary='Create a stock record'),
    retrieve=extend_schema(tags=['stock'], summary='Get a stock record'),
    update=extend_schema(tags=['stock'], summary='Update a stock record'),
    partial_update=extend_schema(tags=['stock'], summary='Partially update a stock record'),
    destroy=extend_schema(tags=['stock'], summary='Delete a stock record'),
)
class StockViewSet(viewsets.ModelViewSet):
    queryset = Stock.objects.select_related('variant__product')
    serializer_class = StockSerializer
    permission_classes = [IsAuthenticated, required_page('stocks')]
    filterset_fields = ['variant']
    search_fields = ['variant__sku', 'variant__product__name']
    ordering_fields = ['available_qty', 'on_hand_qty']
    ordering = ['-available_qty']


# Vue pour gérer les mouvements de stock - Accès réservé aux utilisateurs authentifiés
@extend_schema_view(
    list=extend_schema(tags=['stock'], summary='List stock movements'),
    create=extend_schema(tags=['stock'], summary='Record a stock movement'),
    retrieve=extend_schema(tags=['stock'], summary='Get a stock movement'),
    update=extend_schema(tags=['stock'], summary='Update a stock movement'),
    partial_update=extend_schema(tags=['stock'], summary='Partially update a stock movement'),
    destroy=extend_schema(tags=['stock'], summary='Delete a stock movement'),
)
class StockMovementViewSet(viewsets.ModelViewSet):
    queryset = StockMovement.objects.select_related(
        'stock__variant__product',
        'product',
        'sale_line__product',
        'purchase_line__product',
        'user'
    )
    serializer_class = StockMovementSerializer
    permission_classes = [IsAuthenticated, required_page('stocks')]
    filterset_fields = ['movement_type', 'reason', 'stock', 'sale_line', 'product']
    ordering = ['-date']


class SystemSettingsViewSet(viewsets.ModelViewSet):
    queryset = SystemSettings.objects.all()
    serializer_class = SystemSettingsSerializer
    permission_classes = [IsAuthenticated, required_page('settings')]

    @action(detail=False, methods=['get', 'patch'])
    def current(self, request):
        obj, _ = SystemSettings.objects.get_or_create(id=1)
        if request.method == 'PATCH':
            serializer = self.get_serializer(obj, data=request.data, partial=True)
            serializer.is_valid(raise_exception=True)
            serializer.save()
            return Response(serializer.data)

        serializer = self.get_serializer(obj)
        return Response(serializer.data)
