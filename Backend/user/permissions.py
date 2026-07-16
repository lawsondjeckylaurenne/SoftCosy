from rest_framework import permissions


class IsAdminOrSelf(permissions.BasePermission):
    def has_object_permission(self, request, view, obj):
        # Admin peut tout faire
        if request.user.is_staff or request.user.is_superuser:
            return True
        # L'utilisateur peut voir/modifier son propre profil
        return obj == request.user


class IsAdminUser(permissions.IsAdminUser):
    pass


def required_page(*page_keys):
    """
    Factory de permission DRF : exige que l'utilisateur ait AU MOINS UNE des
    pages indiquées dans son `allowed_pages` (RBAC par page, par utilisateur).
    Plusieurs clés servent aux ressources consultées depuis plusieurs pages
    (ex: le catalogue produit est aussi lu depuis la Caisse). Un superuser est
    toujours autorisé, pour ne jamais se retrouver bloqué de son propre système.
    """
    class _HasPageAccess(permissions.BasePermission):
        message = f"Vous n'avez pas accès à cette fonctionnalité ({', '.join(page_keys)})."

        def has_permission(self, request, view):
            if not (request.user and request.user.is_authenticated):
                return False
            if request.user.is_superuser:
                return True
            allowed = request.user.allowed_pages or []
            return any(p in allowed for p in page_keys)

    return _HasPageAccess