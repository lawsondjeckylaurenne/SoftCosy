from rest_framework import viewsets, generics
from rest_framework.permissions import IsAuthenticated, AllowAny
from drf_spectacular.utils import extend_schema_view, extend_schema
from user.permissions import required_page
from .models import Order
from .serializers import (
    OrderListSerializer,
    OrderDetailSerializer,
    OrderCreateSerializer,
    OrderStatusUpdateSerializer,
    SiteOrderCreateSerializer,
)


@extend_schema_view(
    list=extend_schema(tags=['orders'], summary='List orders'),
    create=extend_schema(tags=['orders'], summary='Create an order (staff)'),
    retrieve=extend_schema(tags=['orders'], summary='Get an order'),
    update=extend_schema(tags=['orders'], summary='Update order status'),
    partial_update=extend_schema(tags=['orders'], summary='Partially update order status'),
    destroy=extend_schema(tags=['orders'], summary='Delete an order'),
)
class OrderViewSet(viewsets.ModelViewSet):
    """Gestion des commandes côté application (staff authentifié)."""
    queryset = Order.objects.select_related('customer', 'user').prefetch_related('lines')
    permission_classes = [IsAuthenticated, required_page('orders')]
    filterset_fields = ['status', 'channel']
    ordering = ['-id']

    def get_serializer_class(self):
        if self.action == 'list':
            return OrderListSerializer
        if self.action == 'retrieve':
            return OrderDetailSerializer
        if self.action in ['update', 'partial_update']:
            return OrderStatusUpdateSerializer
        return OrderCreateSerializer

    def perform_create(self, serializer):
        # Une commande créée depuis l'application est toujours saisie manuellement par le staff
        serializer.save(channel=Order.CHANNEL_APP, user=self.request.user)


@extend_schema(tags=['site'], summary='Create an order from the public storefront')
class SiteOrderCreateView(generics.CreateAPIView):
    """Endpoint public (vitrine) : enregistre une commande passée sur le site web."""
    serializer_class = SiteOrderCreateSerializer
    permission_classes = [AllowAny]

    def perform_create(self, serializer):
        serializer.save(channel=Order.CHANNEL_SITE)
