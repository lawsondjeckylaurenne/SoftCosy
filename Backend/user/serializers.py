from rest_framework import serializers
from rest_framework.authtoken.models import Token
from django.contrib.auth import authenticate

# Serializer personnalisé pour l'authentification par token avec email
class CustomAuthTokenSerializer(serializers.Serializer):
    email = serializers.EmailField(label="Email")
    password = serializers.CharField(label="Mot de passe", style={'input_type': 'password'}, trim_whitespace=False)

    def validate(self, attrs):
        email = attrs.get('email')
        password = attrs.get('password')

        if email and password:
            user = authenticate(request=self.context.get('request'), email=email, password=password)
            if not user:
                raise serializers.ValidationError("Impossible de se connecter avec les identifiants fournis.", code='authorization')
        else:
            raise serializers.ValidationError("Email et mot de passe sont obligatoires.")
        attrs['user'] = user
        return attrs
import json as _json
from .models import User, DEFAULT_PAGES_BY_ROLE
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError


class FlexibleJSONField(serializers.JSONField):
    """
    JSONField tolérant à deux formats d'entrée :
    - JSON natif déjà parsé (liste/dict) — requêtes application/json.
    - Chaîne JSON — requêtes multipart/form-data (formulaire Utilisateurs),
      où tous les champs arrivent en texte.
    """
    def to_internal_value(self, data):
        if isinstance(data, str):
            try:
                data = _json.loads(data)
            except (ValueError, TypeError):
                self.fail('invalid')
        return super().to_internal_value(data)


class UserListSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = [
            'id', 'username', 'email', 'full_name', 'phone', 'address',
            'role', 'is_active', 'is_staff', 'allowed_pages', 'image', 'image_url', 'created_at'
        ]
        read_only_fields = ['id', 'created_at']


class UserDetailSerializer(serializers.ModelSerializer):
    allowed_pages = FlexibleJSONField(required=False)

    class Meta:
        model = User
        fields = [
            'id', 'username', 'email', 'full_name', 'phone', 'address',
            'role', 'is_active', 'is_staff', 'is_superuser', 'allowed_pages',
            'image', 'image_url', 'created_at'
        ]
        read_only_fields = ['id', 'created_at', 'is_superuser']

    def validate(self, attrs):
        request = self.context.get('request')
        new_allowed_pages = attrs.get('allowed_pages')

        # Un admin ne peut pas se retirer lui-même l'accès à la page
        # "Utilisateurs" (seul endroit permettant de rétablir des permissions).
        if (
            request and self.instance and self.instance == request.user
            and new_allowed_pages is not None and 'users' not in new_allowed_pages
            and self.instance.role == 'ADMIN'
        ):
            raise serializers.ValidationError({
                'allowed_pages': "Vous ne pouvez pas retirer votre propre accès à la page \"Utilisateurs\"."
            })

        return attrs

    def update(self, instance, validated_data):
        # Synchronisation à double sens rôle ↔ is_staff : ADMIN a toujours
        # is_staff=True ; un rôle non-ADMIN retombe à is_staff=False, sauf si
        # le compte est un vrai superuser Django (jamais dégradé par un simple
        # changement de rôle dans ce formulaire — nécessite une action directe).
        if 'role' in validated_data:
            new_role = validated_data['role']
            validated_data['is_staff'] = (new_role == 'ADMIN') or instance.is_superuser

        return super().update(instance, validated_data)


class UserCreateSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=True)
    password2 = serializers.CharField(write_only=True, required=True, label="Confirmer mot de passe")
    allowed_pages = FlexibleJSONField(required=False)

    class Meta:
        model = User
        fields = [
            'username', 'email', 'full_name', 'phone', 'address',
            'role', 'password', 'password2', 'image', 'image_url', 'allowed_pages'
        ]

    def validate(self, attrs):
        if attrs['password'] != attrs['password2']:
            raise serializers.ValidationError({"password": "Les mots de passe ne correspondent pas."})
        return attrs

    def validate_password(self, value):
        validate_password(value)
        return value

    def create(self, validated_data):
        validated_data.pop('password2')
        password = validated_data.pop('password')
        role = validated_data.get('role', 'SELLER')
        allowed_pages = validated_data.get('allowed_pages')
        if allowed_pages is None:
            allowed_pages = DEFAULT_PAGES_BY_ROLE.get(role, [])

        user = User.objects.create_user(
            username=validated_data.get('username'),
            email=validated_data['email'],
            full_name=validated_data.get('full_name'),
            phone=validated_data.get('phone'),
            address=validated_data.get('address'),
            role=role,
            password=password,
            image=validated_data.get('image'),
            image_url=validated_data.get('image_url'),
            allowed_pages=allowed_pages,
            # Le rôle ADMIN doit toujours correspondre à un vrai pouvoir admin
            is_staff=(role == 'ADMIN'),
        )
        return user


class UserMeUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['full_name', 'phone', 'address']
        # Pas de email, pas de role, pas de password ici


class PasswordChangeSerializer(serializers.Serializer):
    old_password = serializers.CharField(required=True, write_only=True)
    new_password = serializers.CharField(required=True, write_only=True)
    new_password2 = serializers.CharField(required=True, write_only=True)

    def validate_old_password(self, value):
        user = self.context['request'].user
        if not user.check_password(value):
            raise ValidationError("Ancien mot de passe incorrect.")
        return value

    def validate(self, attrs):
        if attrs['new_password'] != attrs['new_password2']:
            raise ValidationError({"new_password": "Les nouveaux mots de passe ne correspondent pas."})
        validate_password(attrs['new_password'], self.context['request'].user)
        return attrs

    def save(self):
        user = self.context['request'].user
        user.set_password(self.validated_data['new_password'])
        user.save()