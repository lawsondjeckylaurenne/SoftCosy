from rest_framework.authtoken.views import ObtainAuthToken
from rest_framework.authtoken.models import Token
from django.shortcuts import render
from rest_framework import viewsets, status, generics
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.decorators import action
from rest_framework.response import Response
from django.contrib.auth import update_session_auth_hash

from .models import User
from .serializers import (
    UserListSerializer, UserDetailSerializer, UserCreateSerializer,
    UserMeUpdateSerializer, PasswordChangeSerializer, CustomAuthTokenSerializer
)
from .permissions import IsAdminOrSelf, IsAdminUser, required_page
from axes.handlers.proxy import AxesProxyHandler
from axes.helpers import get_lockout_response
from drf_spectacular.utils import extend_schema, extend_schema_view

# Vue personnalisée pour l'authentification par token avec email
@extend_schema(tags=['auth'], summary='Obtain auth token', description='Submit email and password to receive an authentication token.')
class CustomObtainAuthToken(ObtainAuthToken):
    permission_classes = [AllowAny]
    authentication_classes = []  # Ne pas essayer d'authentifier la requête elle-même
    serializer_class = CustomAuthTokenSerializer

    def post(self, request, *args, **kwargs):
        email = request.data.get('email')
        print(f"DEBUG: Tentative de connexion pour {email}")
        
        # Vérification manuelle du lockout pour DRF
        if AxesProxyHandler.is_locked(request, credentials={'email': email}):
            print(f"DEBUG: Compte verrouillé pour {email}")
            return get_lockout_response(request, credentials={'email': email})

        serializer = self.serializer_class(data=request.data, context={'request': request})
        if not serializer.is_valid():
            print(f"DEBUG: Validation échouée: {serializer.errors}")
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
            
        user = serializer.validated_data['user']
        token, created = Token.objects.get_or_create(user=user)
        print(f"DEBUG: Connexion réussie pour {user.email}")
        return Response({
            'token': token.key,
            'user_id': user.id,
            'email': user.email
        })


@extend_schema_view(
    list=extend_schema(tags=['users'], summary='List users (admin only)'),
    create=extend_schema(tags=['users'], summary='Create a user (admin only)'),
    retrieve=extend_schema(tags=['users'], summary='Get a user'),
    update=extend_schema(tags=['users'], summary='Update a user'),
    partial_update=extend_schema(tags=['users'], summary='Partially update a user'),
    destroy=extend_schema(tags=['users'], summary='Delete a user'),
)
class UserViewSet(viewsets.ModelViewSet):
    queryset = User.objects.all()
    permission_classes = [IsAuthenticated]

    def get_serializer_class(self):
        if self.action == 'list':
            return UserListSerializer
        if self.action == 'retrieve':
            return UserDetailSerializer
        if self.action == 'create':
            return UserCreateSerializer
        return UserDetailSerializer

    def get_permissions(self):
        # La page "Utilisateurs" (gestion des comptes + des permissions) exige
        # en plus des vérifications existantes (is_staff/self) d'avoir 'users'
        # dans allowed_pages — un admin peut se retirer cette page lui-même
        # (voir garde anti-auto-verrouillage dans UserDetailSerializer.validate).
        if self.action in ['list', 'create']:
            return [IsAdminUser(), required_page('users')()]
        if self.action in ['retrieve', 'update', 'partial_update', 'destroy']:
            return [IsAdminOrSelf(), required_page('users')()]
        return super().get_permissions()

    def get_queryset(self):
        if self.request.user.is_staff or self.request.user.is_superuser:
            return User.objects.all()
        return User.objects.filter(id=self.request.user.id)

    @extend_schema(tags=['users'], summary='Get or update current user profile')
    @action(detail=False, methods=['get', 'patch'], permission_classes=[IsAuthenticated])
    def me(self, request):
        if request.method == 'GET':
            serializer = UserDetailSerializer(request.user)
            return Response(serializer.data)

        elif request.method == 'PATCH':
            serializer = UserMeUpdateSerializer(
                request.user,
                data=request.data,
                partial=True
            )
            serializer.is_valid(raise_exception=True)
            serializer.save()
            return Response(serializer.data)

    @extend_schema(tags=['users'], summary='Change current user password')
    @action(detail=False, methods=['post'], permission_classes=[IsAuthenticated])
    def change_password(self, request):
        serializer = PasswordChangeSerializer(
            data=request.data,
            context={'request': request}
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        update_session_auth_hash(request, request.user)
        return Response({"detail": "Mot de passe modifié avec succès."})


# Option : endpoint séparé pour admin activer/désactiver utilisateur
@action(detail=True, methods=['post'], permission_classes=[IsAdminUser])
def activate(self, request, pk=None):
    user = self.get_object()
    user.is_active = True
    user.save()
    return Response({"detail": f"Utilisateur {user.email} activé."})


@action(detail=True, methods=['post'], permission_classes=[IsAdminUser])
def deactivate(self, request, pk=None):
    user = self.get_object()
    user.is_active = False
    user.save()
    return Response({"detail": f"Utilisateur {user.email} désactivé."})
