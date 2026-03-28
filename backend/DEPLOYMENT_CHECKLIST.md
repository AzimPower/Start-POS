# 📋 CHECKLIST DE DÉPLOIEMENT - POS v2 sur Hostinger Premium

## ✅ AVANT L'UPLOAD

- [x] Base de données optimisée (ANALYZE + OPTIMIZE exécutés)
- [x] Fichiers de configuration créés
- [x] Script de monitoring en place
- [ ] Backup de la base de données locale
- [ ] Test en local réussi

---

## 📤 UPLOAD SUR HOSTINGER

### 1. Connexion
- [ ] Se connecter à hPanel Hostinger
- [ ] Accéder au File Manager ou configurer FTP

### 2. Upload du Backend
- [ ] Uploader le dossier `backend/` complet dans `public_html/`
- [ ] Vérifier que tous les fichiers sont présents
- [ ] Structure finale : `public_html/backend/api/`, `public_html/backend/cache/`, etc.

### 3. Upload du Frontend
- [ ] Uploader `index.html` dans `public_html/`
- [ ] Uploader le dossier `src/` dans `public_html/`
- [ ] Uploader tous les assets (CSS, JS, images)

---

## 🔧 CONFIGURATION SERVEUR

### 1. Permissions des Dossiers
Via File Manager Hostinger, définir les permissions :
- [ ] `backend/cache/` → 755
- [ ] `backend/logs/` → 755
- [ ] `backend/api/` → 755
- [ ] Tous les fichiers .php → 644

### 2. Base de Données
- [ ] Créer la base MySQL via hPanel
- [ ] Importer `backend/db.sql`
- [ ] Noter : nom DB, utilisateur, mot de passe, host

### 3. Configuration Backend
- [ ] Modifier `backend/config.php` avec les credentials DB Hostinger
  ```php
  $host = 'localhost'; // ou l'host fourni par Hostinger
  $db   = 'votre_nom_db';
  $user = 'votre_user_db';
  $pass = 'votre_password_db';
  ```

### 4. Vérifier .htaccess
- [ ] Vérifier que `backend/api/.htaccess` est bien uploadé
- [ ] Vérifier que `backend/.htaccess` est présent

---

## 🧪 TESTS POST-DÉPLOIEMENT

### 1. Health Check
- [ ] Accéder à : `https://votre-domaine.com/backend/monitoring/check.php`
- [ ] Vérifier que status = "ok"
- [ ] Noter le nombre de connexions DB initiales
- [ ] Vérifier que les dossiers cache/ et logs/ sont accessible

### 2. Tests API
- [ ] Tester : `https://votre-domaine.com/backend/api/ping.php`
- [ ] Tester connexion/création utilisateur
- [ ] Créer un magasin test
- [ ] Créer un produit test
- [ ] Effectuer une vente test

### 3. Tests Frontend
- [ ] Accéder à : `https://votre-domaine.com`
- [ ] Vérifier que l'application charge
- [ ] Tester le login
- [ ] Tester navigation entre pages
- [ ] Vérifier que les données s'affichent

---

## 📊 SURVEILLANCE INITIALE

### Première Semaine - À faire QUOTIDIENNEMENT :
- [ ] Consulter `check.php` chaque jour
- [ ] Noter les connexions DB max observées
- [ ] Noter les temps de réponse
- [ ] Collecter feedback utilisateurs

### Métriques à Surveiller :
| Métrique | Valeur Cible | Seuil Alerte |
|----------|--------------|--------------|
| Connexions DB | < 15 | > 25 |
| Boutiques actives | 5-10 | > 15 |
| Temps réponse | < 500ms | > 1s |
| Erreurs | 0 | > 5/jour |

---

## 🔄 MAINTENANCE HEBDOMADAIRE

### Chaque Semaine :
- [ ] Consulter `check.php` pour état global
- [ ] Exécuter via phpMyAdmin :
  ```sql
  ANALYZE TABLE sales, products, categories;
  OPTIMIZE TABLE sales, products, categories;
  ```
- [ ] Vérifier les logs d'erreurs (si configurés)
- [ ] Backup base de données

---

## 🚨 DÉCLENCHEURS D'UPGRADE

Passer à Cloud Startup (+4€/mois) si :
- [ ] Connexions DB > 30 de manière régulière
- [ ] 10+ boutiques actives
- [ ] Temps de réponse > 1 seconde
- [ ] Erreurs fréquentes de connexion DB
- [ ] Plaintes utilisateurs sur lenteur

---

## 📞 CONTACTS URGENCE

**Support Hostinger :** Chat 24/7 via hPanel

**Commandes Utiles phpMyAdmin :**
```sql
-- Vérifier connexions
SHOW STATUS LIKE 'Threads_connected';

-- Vérifier processus
SHOW PROCESSLIST;

-- Maintenance rapide
ANALYZE TABLE sales;
OPTIMIZE TABLE sales;
```

---

## 📝 NOTES POST-DÉPLOIEMENT

Date de déploiement : _______________

Nombre de boutiques initiales : _______________

Plan hébergement : Hostinger Premium (10€/mois)

Connexions DB moyennes observées : _______________

Problèmes rencontrés :
- 
- 

Solutions appliquées :
- 
- 

---

## ✅ DÉPLOIEMENT TERMINÉ

- [ ] Tous les tests passés
- [ ] Monitoring en place
- [ ] Documentation accessible
- [ ] Users formés
- [ ] Support configuré

**Félicitations ! Votre application est en production.** 🚀

Date de mise en production : _______________
Validé par : _______________
