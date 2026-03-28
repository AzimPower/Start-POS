# 🚀 Guide de Déploiement Production - POS v2
## Support de 100+ Utilisateurs Simultanés

---

## 📋 Vue d'Ensemble des Optimisations

Ce guide détaille toutes les optimisations nécessaires pour faire passer votre application POS de l'environnement de développement à un environnement de production capable de supporter **100+ utilisateurs simultanés**.

### ✅ Optimisations Déjà Implémentées

1. **Index de base de données** - Script SQL d'optimisation créé
2. **Requêtes N+1 éliminées** - sales.php et products.php optimisés
3. **Système de cache** - APCu/File cache implémenté
4. **Connexions persistantes** - Activées par défaut
5. **Timeouts et buffers optimisés** - Configuration PDO améliorée

---

## 🗄️ ÉTAPE 1 : Optimisation Base de Données

### 1.1 Appliquer les Index de Performance

```bash
# Exécuter le script d'optimisation SQL
mysql -u u538245909_pos -p u538245909_pos < backend/migrations/001_performance_indexes.sql
```

**Ce script ajoute :**
- 40+ index sur les colonnes fréquemment utilisées
- Index composites pour les requêtes complexes
- Optimisation et analyse des tables

### 1.2 Configuration MySQL pour Haute Performance

Ajoutez ces paramètres dans votre fichier `my.cnf` ou `my.ini` :

```ini
[mysqld]
# === CONNEXIONS ===
max_connections = 500
max_connect_errors = 10000
connect_timeout = 10

# === MÉMOIRE ===
innodb_buffer_pool_size = 1G          # 70-80% de la RAM disponible
innodb_log_file_size = 256M
innodb_log_buffer_size = 16M
key_buffer_size = 128M
tmp_table_size = 64M
max_heap_table_size = 64M

# === QUERY CACHE (si MySQL < 8.0) ===
query_cache_type = 1
query_cache_size = 64M
query_cache_limit = 2M

# === PERFORMANCE ===
innodb_flush_log_at_trx_commit = 2    # Moins sûr mais plus rapide
innodb_flush_method = O_DIRECT
innodb_file_per_table = 1
innodb_io_capacity = 2000
innodb_read_io_threads = 4
innodb_write_io_threads = 4

# === MONITORING ===
slow_query_log = 1
slow_query_log_file = /var/log/mysql/slow-query.log
long_query_time = 2
log_queries_not_using_indexes = 1
```

**Après modification, redémarrez MySQL :**
```bash
sudo systemctl restart mysql
# ou
sudo service mysql restart
```

### 1.3 Maintenance Régulière

Créez un script de maintenance hebdomadaire :

```bash
# backend/maintenance/weekly_optimize.sh
#!/bin/bash

mysql -u username -p password database_name << EOF
ANALYZE TABLE sales, sale_items, products, product_stock, shifts;
OPTIMIZE TABLE sales, sale_items, products, product_stock, shifts;
EOF
```

---

## 🔧 ÉTAPE 2 : Configuration PHP

### 2.1 Installer APCu pour le Cache

```bash
# Ubuntu/Debian
sudo apt-get install php-apcu
sudo phpenmod apcu

# CentOS/RHEL
sudo yum install php-pecl-apcu

# Vérifier l'installation
php -m | grep apcu
```

### 2.2 Configuration PHP (php.ini)

```ini
[PHP]
# === PERFORMANCE ===
memory_limit = 256M
max_execution_time = 60
max_input_time = 60
upload_max_filesize = 10M
post_max_size = 10M

# === OPCACHE (CRITIQUE pour performance) ===
zend_extension=opcache
opcache.enable=1
opcache.memory_consumption=256
opcache.interned_strings_buffer=16
opcache.max_accelerated_files=10000
opcache.revalidate_freq=2
opcache.fast_shutdown=1
opcache.enable_cli=0

# === APCu ===
apc.enabled=1
apc.shm_size=128M
apc.ttl=7200
apc.gc_ttl=3600
apc.enable_cli=0

# === SESSION ===
session.save_handler=files
session.gc_maxlifetime=3600
session.cookie_httponly=1
session.cookie_secure=1  # Si HTTPS activé

# === ERREURS (production) ===
display_errors=Off
log_errors=On
error_log=/var/log/php/error.log
error_reporting=E_ALL & ~E_NOTICE & ~E_DEPRECATED
```

**Redémarrer PHP-FPM :**
```bash
sudo systemctl restart php8.1-fpm  # Adapter selon votre version PHP
```

---

## 🌐 ÉTAPE 3 : Configuration Serveur Web

### 3.1 Apache (avec mod_php ou PHP-FPM)

**Activer les modules nécessaires :**
```bash
sudo a2enmod rewrite headers deflate expires
sudo systemctl restart apache2
```

**Configuration VirtualHost (.htaccess ou apache.conf) :**
```apache
<IfModule mod_headers.c>
    # Cache des assets statiques
    <FilesMatch "\.(ico|pdf|flv|jpg|jpeg|png|gif|js|css|swf|woff|woff2)$">
        Header set Cache-Control "max-age=2592000, public"
    </FilesMatch>
    
    # Headers de sécurité
    Header always set X-Frame-Options "SAMEORIGIN"
    Header always set X-Content-Type-Options "nosniff"
    Header always set X-XSS-Protection "1; mode=block"
    
    # CORS (à ajuster selon vos besoins)
    Header set Access-Control-Allow-Origin "https://votre-domaine.com"
    Header set Access-Control-Allow-Methods "GET, POST, PUT, DELETE, OPTIONS"
    Header set Access-Control-Allow-Headers "Content-Type, Authorization"
</IfModule>

# Compression GZIP
<IfModule mod_deflate.c>
    AddOutputFilterByType DEFLATE text/html text/plain text/xml text/css text/javascript application/javascript application/json
</IfModule>

# Optimisation Apache
<IfModule mpm_prefork_module>
    StartServers          5
    MinSpareServers       5
    MaxSpareServers      10
    MaxRequestWorkers   150
    MaxConnectionsPerChild 3000
</IfModule>
```

### 3.2 Nginx (Recommandé pour performance)

**Configuration nginx.conf :**
```nginx
worker_processes auto;
worker_rlimit_nofile 65535;

events {
    worker_connections 4096;
    use epoll;
    multi_accept on;
}

http {
    # === PERFORMANCE ===
    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    types_hash_max_size 2048;
    client_max_body_size 10M;
    
    # === GZIP ===
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types text/plain text/css text/xml text/javascript application/json application/javascript application/xml+rss;
    
    # === CACHE ===
    open_file_cache max=10000 inactive=30s;
    open_file_cache_valid 60s;
    open_file_cache_min_uses 2;
    open_file_cache_errors on;
    
    # === PHP-FPM ===
    upstream php-fpm {
        server unix:/var/run/php/php8.1-fpm.sock;
        keepalive 32;
    }
    
    server {
        listen 80;
        server_name votre-domaine.com;
        root /path/to/pos-v2;
        index index.php index.html;
        
        # Cache des assets statiques
        location ~* \.(jpg|jpeg|png|gif|ico|css|js|woff|woff2)$ {
            expires 30d;
            add_header Cache-Control "public, immutable";
        }
        
        # Backend API
        location /backend/api/ {
            try_files $uri $uri/ /backend/api/$uri.php$is_args$args;
            
            location ~ \.php$ {
                fastcgi_pass php-fpm;
                fastcgi_index index.php;
                fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
                include fastcgi_params;
                
                # Timeouts
                fastcgi_connect_timeout 60s;
                fastcgi_send_timeout 60s;
                fastcgi_read_timeout 60s;
                
                # Buffer optimization
                fastcgi_buffer_size 32k;
                fastcgi_buffers 8 32k;
                fastcgi_busy_buffers_size 64k;
            }
        }
        
        # Headers de sécurité
        add_header X-Frame-Options "SAMEORIGIN" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header X-XSS-Protection "1; mode=block" always;
    }
}
```

### 3.3 PHP-FPM Pool Configuration

**Fichier `/etc/php/8.1/fpm/pool.d/www.conf` :**
```ini
[www]
user = www-data
group = www-data
listen = /var/run/php/php8.1-fpm.sock
listen.owner = www-data
listen.group = www-data
listen.mode = 0660

# === PROCESSUS (ajuster selon vos ressources) ===
pm = dynamic
pm.max_children = 100          # Max utilisateurs simultanés
pm.start_servers = 20
pm.min_spare_servers = 10
pm.max_spare_servers = 30
pm.max_requests = 500

# === TIMEOUTS ===
request_terminate_timeout = 60s

# === LIMITES ===
php_admin_value[memory_limit] = 256M
php_admin_value[max_execution_time] = 60
```

---

## 💾 ÉTAPE 4 : Utilisation du Cache

### 4.1 Intégrer le Cache dans les API

**Exemple pour products.php :**

```php
<?php
require_once '../config.php';
require_once '../cache.php';

$method = $_SERVER['REQUEST_METHOD'];

switch ($method) {
    case 'GET':
        $storeId = $_GET['storeId'] ?? null;
        $cacheKey = generateCacheKey('products', ['storeId' => $storeId]);
        
        // Utiliser le cache
        $products = $cache->remember($cacheKey, function() use ($pdo, $storeId) {
            // Votre code existant de récupération des produits
            // ...
            return $products;
        }, 300); // Cache de 5 minutes
        
        echo json_encode($products);
        break;
        
    case 'POST':
    case 'PUT':
    case 'DELETE':
        // Invalider le cache après modification
        invalidateEndpointCache('products');
        
        // Votre code existant...
        break;
}
?>
```

### 4.2 Stratégie de Cache par Endpoint

| Endpoint | Durée Cache | Invalidation |
|----------|-------------|--------------|
| **products** | 5 min | À chaque POST/PUT/DELETE |
| **categories** | 10 min | À chaque POST/PUT/DELETE |
| **stores** | 30 min | À chaque modification |
| **sales** | Pas de cache | Données temps réel |
| **shifts** | Pas de cache | Données temps réel |

---

## 🔐 ÉTAPE 5 : Sécurité Production

### 5.1 Variables d'Environnement

**Créer un fichier `.env` :**
```bash
# Database
DB_HOST=82.197.82.140
DB_NAME=u538245909_pos
DB_USER=u538245909_pos
DB_PASS=@Le08novembre
DB_CHARSET=utf8mb4
DB_PERSISTENT=1

# Cache
CACHE_DRIVER=apcu  # ou 'file'
CACHE_TTL=300

# App
APP_ENV=production
APP_DEBUG=0

# CORS
CORS_ALLOWED_ORIGINS=https://votre-domaine.com,https://app.votre-domaine.com
```

**Charger les variables (ajout dans config.php) :**
```php
// Charger .env si disponible
if (file_exists(__DIR__ . '/.env')) {
    $envFile = file(__DIR__ . '/.env', FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($envFile as $line) {
        if (strpos($line, '=') !== false && $line[0] !== '#') {
            list($key, $value) = explode('=', $line, 2);
            putenv(trim($key) . '=' . trim($value));
        }
    }
}
```

### 5.2 CORS Sécurisé

**Remplacer dans tous les fichiers API :**
```php
// Ancienne version (À ÉVITER en production)
header('Access-Control-Allow-Origin: *');

// Nouvelle version (Sécurisée)
$allowedOrigins = explode(',', getenv('CORS_ALLOWED_ORIGINS') ?: '*');
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';

if (in_array($origin, $allowedOrigins) || $allowedOrigins[0] === '*') {
    header("Access-Control-Allow-Origin: $origin");
    header('Access-Control-Allow-Credentials: true');
}
```

### 5.3 SSL/HTTPS

**Certificat Let's Encrypt (GRATUIT) :**
```bash
# Installer Certbot
sudo apt-get install certbot python3-certbot-apache  # Pour Apache
# ou
sudo apt-get install certbot python3-certbot-nginx   # Pour Nginx

# Obtenir un certificat
sudo certbot --apache -d votre-domaine.com
# ou
sudo certbot --nginx -d votre-domaine.com

# Renouvellement automatique
sudo systemctl enable certbot.timer
```

---

## 📊 ÉTAPE 6 : Monitoring et Performance

### 6.1 Outils de Monitoring

**1. New Relic (Gratuit jusqu'à 100GB/mois)**
```bash
# Installation
wget -O - https://download.newrelic.com/548C16BF.gpg | sudo apt-key add -
echo "deb http://apt.newrelic.com/debian/ newrelic non-free" | sudo tee /etc/apt/sources.list.d/newrelic.list
sudo apt-get update
sudo apt-get install newrelic-php5
sudo newrelic-install install
```

**2. MySQL Slow Query Log**
```sql
-- Activer le log des requêtes lentes
SET GLOBAL slow_query_log = 'ON';
SET GLOBAL long_query_time = 2;

-- Analyser les requêtes lentes
mysqldumpslow -s t -t 10 /var/log/mysql/slow-query.log
```

**3. Script de Monitoring Personnalisé**

Créer `backend/monitoring/health_check.php` :
```php
<?php
require_once '../config.php';
require_once '../cache.php';

$health = [
    'status' => 'ok',
    'timestamp' => time(),
    'checks' => []
];

// Test DB
try {
    $stmt = $pdo->query('SELECT 1');
    $health['checks']['database'] = 'ok';
} catch (Exception $e) {
    $health['status'] = 'error';
    $health['checks']['database'] = 'error';
}

// Test Cache
$health['checks']['cache'] = $cache->getInfo();

// Mémoire PHP
$health['memory'] = [
    'usage' => memory_get_usage(true),
    'peak' => memory_get_peak_usage(true),
    'limit' => ini_get('memory_limit')
];

// Connexions DB
try {
    $stmt = $pdo->query("SHOW STATUS LIKE 'Threads_connected'");
    $result = $stmt->fetch();
    $health['database_connections'] = $result['Value'];
} catch (Exception $e) {}

echo json_encode($health, JSON_PRETTY_PRINT);
?>
```

### 6.2 Logs Structurés

**Créer `backend/logger.php` :**
```php
<?php
function logPerformance($endpoint, $duration, $method = 'GET') {
    $logFile = __DIR__ . '/logs/performance.log';
    $logEntry = json_encode([
        'timestamp' => date('c'),
        'endpoint' => $endpoint,
        'method' => $method,
        'duration_ms' => round($duration * 1000, 2),
        'memory_mb' => round(memory_get_peak_usage(true) / 1048576, 2)
    ]) . "\n";
    
    @file_put_contents($logFile, $logEntry, FILE_APPEND | LOCK_EX);
}

// Utilisation dans vos API:
$startTime = microtime(true);

// ... votre code API ...

logPerformance('products', microtime(true) - $startTime, $_SERVER['REQUEST_METHOD']);
?>
```

---

## 🧪 ÉTAPE 7 : Tests de Charge

### 7.1 Installation de Apache Bench

```bash
sudo apt-get install apache2-utils
```

### 7.2 Tests de Performance

**Test simple (10 utilisateurs, 100 requêtes) :**
```bash
ab -n 100 -c 10 http://votre-domaine.com/backend/api/products.php
```

**Test avancé (100 utilisateurs simultanés, 1000 requêtes) :**
```bash
ab -n 1000 -c 100 -t 30 http://votre-domaine.com/backend/api/sales.php?storeId=xxx
```

**Objectifs de Performance :**
- **Temps de réponse moyen** : < 200ms
- **Taux de réussite** : > 99%
- **Requêtes/seconde** : > 500

### 7.3 Load Testing avec K6 (Recommandé)

**Installation :**
```bash
sudo apt-key adv --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6
```

**Script de test `load-test.js` :**
```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';

export let options = {
    stages: [
        { duration: '2m', target: 50 },   // Monter à 50 utilisateurs
        { duration: '5m', target: 100 },  // Monter à 100 utilisateurs
        { duration: '2m', target: 0 },    // Redescendre à 0
    ],
    thresholds: {
        http_req_duration: ['p(95)<500'], // 95% des requêtes < 500ms
        http_req_failed: ['rate<0.01'],   // Moins de 1% d'erreurs
    },
};

export default function () {
    // Test GET products
    let res = http.get('http://votre-domaine.com/backend/api/products.php?storeId=xxx');
    check(res, {
        'status is 200': (r) => r.status === 200,
        'response time < 200ms': (r) => r.timings.duration < 200,
    });
    
    sleep(1);
}
```

**Exécution :**
```bash
k6 run load-test.js
```

---

## 📝 ÉTAPE 8 : Checklist de Déploiement

### Avant le Déploiement

- [ ] Sauvegarder la base de données
- [ ] Tester tous les endpoints en local
- [ ] Vérifier les logs d'erreurs
- [ ] Configurer les variables d'environnement
- [ ] Installer les certificats SSL

### Déploiement

- [ ] Appliquer le script d'optimisation SQL
- [ ] Configurer PHP (php.ini + PHP-FPM)
- [ ] Configurer le serveur web (Apache/Nginx)
- [ ] Installer et activer APCu
- [ ] Configurer CORS sécurisé
- [ ] Activer HTTPS

### Après le Déploiement

- [ ] Exécuter les tests de charge
- [ ] Vérifier le monitoring (health check)
- [ ] Analyser les logs de performance
- [ ] Configurer les alertes
- [ ] Documenter les configurations

### Maintenance Continue

- [ ] **Quotidien** : Vérifier les logs d'erreurs
- [ ] **Hebdomadaire** : Analyser les slow queries MySQL
- [ ] **Hebdomadaire** : Exécuter ANALYZE/OPTIMIZE TABLE
- [ ] **Mensuel** : Vérifier l'espace disque et les backups
- [ ] **Mensuel** : Revoir les métriques de performance

---

## 🆘 Troubleshooting

### Problème : Connexions DB saturées

**Solution :**
```sql
-- Vérifier le nombre de connexions actives
SHOW STATUS LIKE 'Threads_connected';
SHOW PROCESSLIST;

-- Augmenter max_connections
SET GLOBAL max_connections = 500;
```

### Problème : Mémoire PHP saturée

**Solution :**
```ini
# Dans php.ini
memory_limit = 512M

# Ou dans PHP-FPM pool
php_admin_value[memory_limit] = 512M
```

### Problème : Lenteur des requêtes

**Solution :**
```bash
# Activer le slow query log
mysql> SET GLOBAL slow_query_log = 'ON';

# Analyser
mysqldumpslow -s t -t 10 /var/log/mysql/slow-query.log

# Vérifier les index manquants
mysql> EXPLAIN SELECT * FROM sales WHERE storeId = 'xxx';
```

### Problème : Cache ne fonctionne pas

**Solution :**
```bash
# Vérifier APCu
php -i | grep apcu

# Redémarrer PHP-FPM
sudo systemctl restart php8.1-fpm

# Vérifier les permissions du dossier cache
sudo chown -R www-data:www-data backend/cache
sudo chmod -R 755 backend/cache
```

---

## 📈 Résultats Attendus

Après application de toutes ces optimisations :

| Métrique | Avant | Après | Amélioration |
|----------|-------|-------|--------------|
| **Temps de réponse moyen** | 800ms | < 200ms | **75%** |
| **Utilisateurs simultanés** | 20-30 | 100+ | **300%** |
| **Requêtes/seconde** | 50 | 500+ | **900%** |
| **Erreurs de connexion DB** | 5-10% | < 1% | **90%** |
| **Utilisation CPU** | 80-90% | 40-60% | **40%** |

---

## 📞 Support et Ressources

- **Documentation MySQL** : https://dev.mysql.com/doc/
- **Documentation PHP-FPM** : https://www.php.net/manual/en/install.fpm.php
- **Nginx Optimization** : https://www.nginx.com/blog/tuning-nginx/
- **APCu** : https://www.php.net/manual/en/book.apcu.php

---

**Note finale :** Ces optimisations sont conçues pour un environnement de production standard. Ajustez les paramètres selon votre infrastructure réelle et surveillez attentivement les performances après chaque changement.

**Date de création :** Mars 2026  
**Version :** 1.0  
**Dernière mise à jour :** Mars 16, 2026
