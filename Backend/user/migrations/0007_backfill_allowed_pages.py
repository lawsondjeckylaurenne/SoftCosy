from django.db import migrations


DEFAULT_PAGES_BY_ROLE = {
    'ADMIN': [
        'dashboard', 'products', 'stocks', 'cashier', 'sales', 'orders',
        'customers', 'inventory', 'suppliers', 'purchases', 'reports',
        'users', 'settings',
    ],
    'MANAGER': [
        'dashboard', 'products', 'stocks', 'cashier', 'sales', 'orders',
        'customers', 'inventory', 'suppliers', 'purchases', 'reports',
        'settings',
    ],
    'SELLER': [
        'cashier', 'products', 'stocks', 'sales', 'orders', 'customers',
        'inventory', 'suppliers',
    ],
}


def backfill_allowed_pages(apps, schema_editor):
    User = apps.get_model('user', 'User')
    for user in User.objects.all():
        pages = DEFAULT_PAGES_BY_ROLE.get(user.role, [])
        update_fields = []
        if user.allowed_pages != pages:
            user.allowed_pages = pages
            update_fields.append('allowed_pages')
        # Le rôle ADMIN doit correspondre à un vrai pouvoir admin (is_staff) —
        # avant ce correctif, "ADMIN" n'était qu'un libellé cosmétique.
        if user.role == 'ADMIN' and not user.is_staff:
            user.is_staff = True
            update_fields.append('is_staff')
        if update_fields:
            user.save(update_fields=update_fields)


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('user', '0006_allowed_pages'),
    ]

    operations = [
        migrations.RunPython(backfill_allowed_pages, noop_reverse),
    ]
