# 🔧 Backend POS v2 - Guide Complet

## 📁 Structure des Dossiers

```
backend/
├── api/                    # Endpoints API REST
│   ├── .htaccess          # Optimisations PHP et sécurité
│   ├── categories.php     # Gestion catégories
│   ├── customers.php      # Gestion clients
│   ├── products.php       # Gestion produits (OPTIMISÉ)
│   ├── sales.php          # Gestion ventes (OPTIMISÉ)
│   └── ...autres APIs
│
├── cache/                  # Cache fichiers (755)
│   └── .gitkeep
│
├── logs/                   # Logs de performance (755)
│   └── .gitkeep
│
├── monitoring/             # Scripts de surveillance
│   └── check.php          # Health check principal
│
├── migrations/             # Scripts SQL
│   └── 001_performance_indexes.sql
│
├── mail/                   # PHPMailer
│   └── PHPMailer-master/
│
├── cache.php              # Système de cache (APCu/File)
├── config.php             # Configuration DB (OPTIMISÉ)
└── db.sql                 # Structure base de données
```

---

## ⚙️ Configuration

### 1. Base de Données

Éditez `config.php` avec vos identifiants :

```php
$host = 'localhost';        // Host MySQL Hostinger
$db   = 'votre_base';       // Nom de votre base
$user = 'votre_user';       // Utilisateur MySQL
$pass = 'votre_password';   // Mot de passe MySQL
```

### 2. Permissions

```bash
# Sur le serveur Hostinger
chmod 755 cache/
chmod 755 logs/
chmod 755 monitoring/
chmod 644 config.php
```

---

## 🚀 Optimisations Implémentées

### ✅ Base de Données
- **40+ index** sur tables critiques (sales, products, etc.)
- Index composites pour requêtes complexes
- ANALYZE et OPTIMIZE appliqués

### ✅ Code PHP
- **Requêtes N+1 éliminées** dans sales.php et products.php
- **Connexions persistantes** activées
- **Compression GZIP** via .htaccess
- **Cache système** APCu/File disponible

### ✅ Sécurité
- Protection XSS, CSRF
- Fichiers sensibles bloqués (.env, .sql, .log)
- Headers de sécurité configurés

---

## 📊 Monitoring

### Health Check

Accédez à : `https://votre-domaine.com/backend/monitoring/check.php`

**Indicateurs surveillés :**
- ✅ Connexion base de données
- ✅ Nombre de connexions DB actuelles
- ✅ Nombre de boutiques actives
- ✅ Utilisation mémoire PHP
- ✅ Configuration PHP
- ✅ État des dossiers cache/logs

**Interprétation :**
- **status: "ok"** → Tout va bien ✅
- **status: "warning"** → Surveiller ⚠️
- **status: "error"** → Action requise ❌

### Seuils d'Alerte (Premium)

| Métrique | OK | Warning | Critical |
|----------|------|---------|----------|
| Connexions DB | < 25 | 25-35 | > 35 |
| Boutiques actives | < 10 | 10-15 | > 15 |
| Mémoire PHP | < 70% | 70-85% | > 85% |

---

## 🔄 Maintenance

### Hebdomadaire (5 minutes)

**Via phpMyAdmin :**
```sql
-- Mettre à jour les statistiques
ANALYZE TABLE sales, products, categories, customers;

-- Optimiser les tables
OPTIMIZE TABLE sales, products, categories, customers;
```

**Via Monitoring :**
- Consulter `check.php`
- Noter les métriques
- Vérifier les alertes

---

## 📈 Performance Attendue

### Hostinger Premium (actuel)
- **Boutiques supportées** : 5-15
- **Utilisateurs simultanés** : 30-50
- **Temps de réponse** : 200-500ms
- **Connexions DB max** : ~40

### Cloud Startup (upgrade recommandé à 15+ boutiques)
- **Boutiques supportées** : 15-50
- **Utilisateurs simultanés** : 80-100
- **Temps de réponse** : 100-300ms
- **Connexions DB max** : ~100

---

## 🐛 Troubleshooting

### Problème : Erreur "Too many connections"

**Cause :** Trop de connexions DB simultanées

**Solution :**
1. Vérifier `check.php` → nombre de connexions
2. Si > 35 régulièrement → Upgrade nécessaire
3. Temporaire : Redémarrer MySQL via hPanel
4. Permanent : Upgrade vers Cloud Startup

### Problème : Temps de réponse lents (> 1s)

**Diagnostic :**
1. Consulter `check.php`
2. Vérifier connexions DB
3. Vérifier nombre de boutiques actives

**Solutions :**
- Si connexions OK : Vérifier requêtes SQL lentes
- Si boutiques > 15 : Upgrade recommandé
- Exécuter ANALYZE/OPTIMIZE

### Problème : Cache ne fonctionne pas

**Vérifications :**
1. Dossier `cache/` existe et permissions 755
2. Dossier `cache/` accessible en écriture
3. APCu pas nécessaire (File cache utilisé sur mutualisé)

**Correction :**
```bash
chmod 755 backend/cache/
```

### Problème : Erreurs 500

**Causes possibles :**
1. Problème dans config.php
2. Permissions incorrectes
3. Extensions PHP manquantes

**Debug :**
- Vérifier `check.php` section "php_extensions"
- Consulter logs d'erreurs via hPanel
- Tester connexion DB isolée

---

## 🔐 Sécurité

### Fichiers Protégés (via .htaccess)
- ❌ `.env`
- ❌ `.sql`
- ❌ `.log`
- ❌ `.md`
- ❌ `.txt`
- ❌ `.ini`

### Headers de Sécurité Activés
- ✅ X-Content-Type-Options: nosniff
- ✅ X-Frame-Options: SAMEORIGIN
- ✅ X-XSS-Protection: 1; mode=block

### CORS
Configuration par défaut : Permissive (développement)

**Production :** Décommenter et configurer dans `api/.htaccess` :
```apache
Header set Access-Control-Allow-Origin "https://votre-domaine.com"
```

---

## 📚 API Endpoints

### Principales API

| Endpoint | Description | Optimisé |
|----------|-------------|----------|
| `/api/products.php` | Gestion produits | ✅ |
| `/api/sales.php` | Gestion ventes | ✅ |
| `/api/categories.php` | Gestion catégories | ⚪ |
| `/api/customers.php` | Gestion clients | ⚪ |
| `/api/shifts.php` | Gestion shifts | ⚪ |
| `/api/users.php` | Gestion utilisateurs | ⚪ |
| `/api/stores.php` | Gestion magasins | ⚪ |

**Légende :**
- ✅ Optimisé (requêtes N+1 éliminées)
- ⚪ Standard (performances correctes)

---

## 🆙 Plan d'Upgrade

### Quand upgrader ?

**Vers Cloud Startup (+4€/mois) si :**
- Connexions DB > 30 régulièrement
- 10-15 boutiques actives
- Temps réponse > 800ms
- Plaintes utilisateurs

**Vers Cloud Professional (+20€/mois) si :**
- Connexions DB > 80 régulièrement
- 50+ boutiques actives
- Croissance rapide prévue
- Besoin de ressources dédiées

---

## 📞 Support

### Ressources
- **Documentation** : `PRODUCTION_DEPLOYMENT.md`
- **Checklist** : `DEPLOYMENT_CHECKLIST.md`
- **Monitoring** : `/backend/monitoring/check.php`
- **Hostinger Support** : Chat 24/7 via hPanel

### Commandes Utiles

**Connexions actuelles :**
```sql
SHOW STATUS LIKE 'Threads_connected';
```

**Processus en cours :**
```sql
SHOW PROCESSLIST;
```

**Taille base de données :**
```sql
SELECT 
    table_schema AS 'Database',
    ROUND(SUM(data_length + index_length) / 1024 / 1024, 2) AS 'Size (MB)'
FROM information_schema.tables
WHERE table_schema = 'votre_base'
GROUP BY table_schema;
```

---

**Version Backend :** 1.0  
**Date :** Mars 2026  
**Hébergement :** Hostinger Premium (optimisé pour 5-15 boutiques)
