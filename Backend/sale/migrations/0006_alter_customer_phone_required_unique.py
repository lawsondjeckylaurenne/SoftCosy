from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('sale', '0005_sale_customer_name'),
    ]

    operations = [
        # Le téléphone devient obligatoire et unique : il sert désormais à
        # identifier un client de façon fiable pour pouvoir le recontacter.
        migrations.AlterField(
            model_name='customer',
            name='phone',
            field=models.CharField(max_length=32, unique=True),
        ),
    ]
