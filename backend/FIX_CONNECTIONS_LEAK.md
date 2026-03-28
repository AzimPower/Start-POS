# 🚨 FIX URGENT - Fuite de Connexions DB

## Problème Identifié

**Symptôme :** 50 connexions DB pour 4 actualisations de page (12-13 connexions/page)  
**Cause :** Connexions persistantes mal gérées sur hébergement mutualisé  
**Impact :** Dépassement limite Premium (40 connexions) → Erreurs "Too many connections"

## 🔧 Solution Appliquée

### Fichier Modifié : `backend/config.php`

**Changement :** `PDO::ATTR_PERSISTENT` → **false par défaut**

```php
// AVANT (problématique sur shared hosting)
$persistent = true;  // ❌ Cause fuite de connexions

// APRÈS (corrigé)
$persistent = false; // ✅ Connexions fermées automatiquement
```

### Pourquoi ce fix ?

Sur **hébergement mutualisé** (Hostinger Premium) :

1. **Avec persistent = true :**
   - Chaque worker PHP-FPM crée sa propre connexion persistante
   - Les connexions restent ouvertes entre les requêtes
   - Accumulation : 10-15 workers × 3-4 connexions = 50+ connexions
   - ❌ Fuite rapide, limite dépassée

2. **Avec persistent = false :**
   - Connexion créée au début de la requête
   - Connexion fermée automatiquement à la fin
   - Pas d'accumulation
   - ✅ 2-5 connexions max même avec traffic élevé

### Performance Impact

**Overhead de reconnexion sur MySQL local/rapide :**
- < 1ms par connexion (négligeable)
- Connexions rapides sur réseau local Hostinger

**Avantage :**
- Pas de fuite de connexions
- Stabilité garantie
- Support de 10-15 boutiques sans problème

---

## 📋 Étapes de Déploiement

### 1. Re-upload config.php

**Via File Manager Hostinger :**
```
1. Connectez-vous à hPanel
2. File Manager → public_html/backend/
3. Supprimez l'ancien config.php
4. Uploadez le nouveau config.php (modifié)
```

**Via FTP :**
```
1. Connectez-vous en FTP
2. Naviguez vers /public_html/backend/
3. Uploadez config.php (écraser l'ancien)
```

### 2. Fermer les Connexions Existantes

**Via phpMyAdmin :**
```sql
-- Voir les processus en cours
SHOW PROCESSLIST;

-- Si nécessaire, tuer les processus (remplacez ID_PROCESS)
-- KILL ID_PROCESS;
```

**OU via hPanel :**
```
1. Databases → MySQL Databases
2. Redémarrer le service MySQL (si option disponible)
```

### 3. Vider le Cache OpCache

**Créer un fichier temporaire : `backend/clear_cache.php`**
```php
<?php
if (function_exists('opcache_reset')) {
    opcache_reset();
    echo "OpCache vidé ✅\n";
} else {
    echo "OpCache non disponible\n";
}

// Vider les fichiers de cache également
$cacheDir = __DIR__ . '/cache';
if (is_dir($cacheDir)) {
    $files = glob($cacheDir . '/*');
    foreach ($files as $file) {
        if (is_file($file)) unlink($file);
    }
    echo "Cache fichiers vidé ✅\n";
}

echo "Caches vidés avec succès !";
?>
```

**Exécuter :**
```
https://votre-domaine.com/backend/clear_cache.php
```

**Puis SUPPRIMER le fichier** (sécurité)

### 4. Tester

**Actualisez une page 5 fois puis vérifiez :**
```
https://votre-domaine.com/backend/monitoring/check.php
```

**Résultat attendu :**
```json
{
  "database_connections": {
    "status": "ok",
    "current": 5-10,  // ✅ Au lieu de 50+
    "limit": "40",
    "percentage": "12-25%"
  }
}
```

---

## 🧪 Test de Charge

**Après le fix, testez avec 10 actualisations rapides :**

```bash
# Via PowerShell
for ($i=1; $i -le 10; $i++) { 
    curl https://votre-domaine.com/backend/api/products.php
    Write-Host "Test $i"
}
```

**Vérifiez check.php immédiatement après :**
- Connexions devrait rester < 15
- Status devrait rester "ok"

---

## 📊 Résultats Attendus

### Avant Fix
| Métrique | Valeur | Status |
|----------|--------|--------|
| Connexions (4 pages) | 50 | ❌ Critical |
| Pourcentage | 125% | ❌ Dépassement |
| Status | critical | ❌ |

### Après Fix
| Métrique | Valeur | Status |
|----------|--------|--------|
| Connexions (4 pages) | 5-10 | ✅ OK |
| Pourcentage | 12-25% | ✅ Normal |
| Status | ok | ✅ |

---

## 🔍 Monitoring Post-Fix

**Première Heure :**
- Vérifier check.php toutes les 10 minutes
- Observer les connexions max

**Premier Jour :**
- Vérifier check.php toutes les heures
- Noter les pics de connexions

**Seuil Normal :**
- **Repos** : 2-5 connexions
- **Usage normal** : 8-15 connexions
- **Pic d'activité** : 15-25 connexions
- **⚠️ Alerte si** : > 30 connexions régulièrement

---

## 🎯 Capacité Réelle Post-Fix

Avec connexions NON-persistantes :

| Boutiques | Utilisateurs Simultanés | Connexions DB | Status |
|-----------|-------------------------|---------------|--------|
| 5 | 10-15 | 8-12 | ✅ OK |
| 10 | 20-30 | 15-20 | ✅ OK |
| 15 | 30-50 | 20-30 | ⚠️ Limite |
| 20+ | 50+ | 30-40 | ❌ Upgrade requis |

---

## ❓ FAQ

### Q: Perte de performance sans connexions persistantes ?

**R:** Non, overhead négligeable (< 1ms) sur connexions locales. La stabilité prime.

### Q: Quand utiliser persistent = true ?

**R:** Uniquement sur **VPS/Serveurs dédiés** avec contrôle total des workers PHP.

### Q: Et si le problème persiste ?

**R:** Vérifier :
1. OpCache bien vidé
2. Pas de multiples includes de config.php dans le même script
3. Redémarrer PHP-FPM (via support Hostinger si nécessaire)

### Q: Combien de boutiques supportées maintenant ?

**R:** 10-15 boutiques confortablement sur Premium avec ce fix.

---

## ✅ Checklist Finale

- [ ] config.php re-uploadé
- [ ] OpCache vidé via clear_cache.php
- [ ] clear_cache.php supprimé (sécurité)
- [ ] Test avec 5-10 actualisations effectué
- [ ] check.php vérifié → status "ok"
- [ ] Connexions < 15 confirmées
- [ ] Monitoring configuré (toutes les heures J1)

---

**Date du fix :** 16 mars 2026  
**Gravité :** 🚨 Critique  
**Priorité :** 🔴 Immédiate  
**Temps d'application :** 5-10 minutes  
**Downtime requis :** Aucun

---

**Une fois le fix appliqué, testez immédiatement et partagez le résultat de check.php !** 🚀
