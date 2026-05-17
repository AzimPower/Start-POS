# 🔐 Système de Gestion d'Abonnement - Guide Complet

## 📋 Vue d'ensemble

Ce système bloque automatiquement l'accès aux utilisateurs d'un magasin désactivé (abonnement expiré) tout en permettant au super admin de gérer les magasins sans restriction.

---

## ✅ Fonctionnalités Implémentées

### 1. **Blocage Automatique** 🚫
- Les utilisateurs d'un magasin désactivé ne peuvent plus travailler
- Affichage immédiat d'une page de blocage au login
- Vérification continue du statut pendant l'utilisation

### 2. **Page de Réabonnement** 💳
- Affichage des informations de contact (WhatsApp, téléphone, email)
- Tarif d'abonnement clairement affiché (15.000 FCFA/mois)
- Bouton "Vérifier si mon abonnement est actif" pour re-tester après paiement

### 3. **Accès Super Admin** 👑
- Le super admin peut accéder à TOUS les magasins même désactivés
- Gestion complète des magasins via l'interface admin
- Activation/désactivation manuelle des magasins

### 4. **API Optimisée** ⚡
- `GET /backend/api/stores.php` : retourne uniquement les magasins actifs
- `GET /backend/api/stores.php?include_inactive=1` : retourne TOUS les magasins (super admin)
- `DELETE /backend/api/stores.php?id=X&soft=1` : désactivation douce (soft delete)
- `PUT /backend/api/stores.php` : réactivation manuelle

---

## 🧪 Tests à Effectuer

### Test 1 : Désactiver un Magasin

**Via l'Interface Admin (recommandé) :**
1. Connectez-vous en tant que super admin
2. Allez dans "Magasins"
3. Trouvez le magasin à désactiver
4. Cliquez sur "Désactiver" (icône rouge ❌)
5. Le magasin passe en statut `active = 0`

**Via API (curl) :**
```bash
# Soft delete (désactivation)
curl -X DELETE "https://start-pos.com/backend/api/stores.php?id=STOREID&soft=1"

# Réponse attendue :
# {"success":true,"soft":true,"id":"STOREID"}
```

**Via phpMyAdmin (SQL direct) :**
```sql
UPDATE stores SET active = 0 WHERE id = 'STOREID';
```

---

### Test 2 : Vérifier le Blocage

**Scénario :**
1. Désactivez un magasin (Test 1)
2. Connectez-vous avec un utilisateur de ce magasin (role: `admin`, `cashier`, ou `manager`)
3. **Résultat attendu :** Page de blocage "Abonnement Expiré" s'affiche

**Ce qui doit apparaître :**
- 🔒 Message "L'accès à votre point de vente est temporairement suspendu"
- 💳 Tarif : 15.000 FCFA/mois
- 📞 Liens contact : WhatsApp, Téléphone, Email
- 🔄 Bouton "Vérifier si mon abonnement est actif"

---

### Test 3 : Super Admin Non Bloqué

**Scénario :**
1. Désactivez un magasin (Test 1)
2. Connectez-vous avec le super admin (`role = 'super_admin'`)
3. **Résultat attendu :** Accès complet, aucun blocage

**Vérification :**
- Le super admin peut voir et gérer tous les magasins
- Le super admin peut naviguer dans toute l'application
- Aucune popup de blocage n'apparaît

---

### Test 4 : Réactivation du Magasin

**Méthode 1 : Via API (PUT)**
```bash
curl -X PUT \
  -H "Content-Type: application/json" \
  -d '{"id":"STOREID","name":"Mon Magasin","address":"Adresse","active":1}' \
  "https://start-pos.com/backend/api/stores.php"
```

**Méthode 2 : Via phpMyAdmin (SQL)**
```sql
UPDATE stores SET active = 1 WHERE id = 'STOREID';
```

**Méthode 3 : Via l'Interface Admin**
1. Connectez-vous en super admin
2. Allez dans "Magasins"
3. Affichez les magasins inactifs : `?include_inactive=1` dans l'URL
4. Modifiez le magasin et changez `active` à `true`
5. Sauvegardez

---

### Test 5 : Vérification Post-Réactivation

**Scénario :**
1. Réactivez un magasin (Test 4)
2. L'utilisateur du magasin clique sur "Vérifier si mon abonnement est actif"
3. **Résultat attendu :** Redirection vers l'application normale

**OU**

1. Réactivez un magasin (Test 4)
2. L'utilisateur se déconnecte et se reconnecte
3. **Résultat attendu :** Login réussi, pas de blocage

---

## 🔧 Configuration des Contacts

### Modifier les Informations de Contact

Éditez le fichier : `src/components/SubscriptionExpired.tsx`

**Lignes à modifier :**

```tsx
// WhatsApp (ligne ~60)
<a 
  href="https://wa.me/22670000000"  // ← Votre numéro WhatsApp
  ...
>
  <p className="text-sm text-gray-600">+226 70 00 00 00</p>  // ← Affichage
</a>

// Téléphone (ligne ~75)
<a 
  href="tel:+22670000000"  // ← Votre numéro
  ...
>
  <p className="text-sm text-gray-600">+226 70 00 00 00</p>  // ← Affichage
</a>

// Email (ligne ~90)
<a 
  href="mailto:support@votre-domaine.com"  // ← Votre email
  ...
>
  <p className="text-sm text-gray-600">support@votre-domaine.com</p>  // ← Affichage
</a>

// Tarif (ligne ~105)
<span className="text-3xl font-bold text-primary">15.000 FCFA</span>  // ← Votre tarif
```

---

## 📊 Workflow Complet

### Nouveau Client

```
1. Super Admin crée le magasin → active = 1
2. Client reçoit ses identifiants
3. Client peut travailler normalement
4. Abonnement valide jusqu'à subscriptionEnd
```

### Expiration d'Abonnement

```
1. subscriptionEnd atteint
2. Super Admin désactive le magasin → active = 0
3. Utilisateurs du magasin voient la page de blocage
4. Client contacte pour renouveler
```

### Renouvellement

```
1. Client paie l'abonnement
2. Super Admin réactive le magasin → active = 1
3. Super Admin met à jour subscriptionEnd
4. Client clique "Vérifier" ou se reconnecte
5. Accès rétabli immédiatement
```

---

## 🛠️ Gestion Super Admin

### Voir Tous les Magasins (actifs + inactifs)

**Via URL :**
```
https://votre-domaine.com/stores?include_inactive=1
```

**Via API :**
```bash
curl "https://start-pos.com/backend/api/stores.php?include_inactive=1"
```

### Désactiver un Magasin (Soft Delete)

**Via API :**
```bash
curl -X DELETE \
  "https://start-pos.com/backend/api/stores.php?id=STOREID&soft=1"
```

**Résultat :**
- Le magasin reste en base de données
- `active = 0`
- Toutes les données conservées
- Utilisateurs bloqués

### Réactiver un Magasin

**Via API :**
```bash
curl -X PUT \
  -H "Content-Type: application/json" \
  -d '{
    "id":"STOREID",
    "name":"Nom du Magasin",
    "address":"Adresse",
    "logo":null,
    "active":1,
    "createdAt":1234567890,
    "subscriptionStart":1234567890,
    "subscriptionEnd":1267103890,
    "lastPayment":1234567890
  }' \
  "https://start-pos.com/backend/api/stores.php"
```

**Minimal (just reactivate) :**
```bash
curl -X PUT \
  -H "Content-Type: application/json" \
  -d '{"id":"STOREID","active":1}' \
  "https://start-pos.com/backend/api/stores.php"
```

---

## 🚨 Troubleshooting

### Problème : L'utilisateur reste bloqué après réactivation

**Solutions :**
1. L'utilisateur doit cliquer sur "Vérifier si mon abonnement est actif"
2. OU se déconnecter puis se reconnecter
3. Vider le cache du navigateur (Ctrl+Shift+Delete)
4. Vérifier que `active = 1` en base de données

### Problème : Le super admin est bloqué

**Cause :** Le rôle n'est pas `super_admin` en base

**Solution :**
```sql
-- Vérifier le rôle
SELECT id, username, role FROM users WHERE username = 'super_admin_username';

-- Corriger si nécessaire
UPDATE users SET role = 'super_admin' WHERE id = 'USER_ID';
```

### Problème : La page de blocage ne s'affiche pas

**Vérifications :**
1. Le store est bien `active = 0` en base ?
2. L'utilisateur n'est pas super_admin ?
3. Cache navigateur vidé ?
4. Le store est bien synchro en local (IndexedDB) ?

**Forcer la synchronisation :**
```javascript
// Dans la console du navigateur
const db = await indexedDB.databases();
console.log('Bases disponibles:', db);

// Supprimer la base locale pour forcer resync
indexedDB.deleteDatabase('pos-db');
// Puis recharger la page
```

---

## 📱 Déploiement

### Fichiers Modifiés/Créés

1. ✅ `backend/api/stores.php` - API modifiée (GET avec filtre, DELETE soft)
2. ✅ `src/components/SubscriptionExpired.tsx` - Page de blocage
3. ✅ `src/App.tsx` - Vérificateur de statut ajouté

### Étapes de Déploiement

```bash
# 1. Upload backend
# Via File Manager Hostinger ou FTP
# Uploader : backend/api/stores.php

# 2. Build frontend
npm run build

# 3. Upload dist/ vers public_html/
# Via File Manager Hostinger ou FTP

# 4. Test immédiat
# Désactiver un magasin test et vérifier le blocage
```

---

## 📞 Support

**Informations à Personnaliser :**
- Numéro WhatsApp : Ligne ~60 de `SubscriptionExpired.tsx`
- Numéro Téléphone : Ligne ~75
- Email Support : Ligne ~90
- Tarif : Ligne ~105

**Fichier :** `src/components/SubscriptionExpired.tsx`

---

## ✅ Checklist Finale

- [ ] Tester désactivation magasin
- [ ] Vérifier blocage utilisateur normal
- [ ] Vérifier accès super admin
- [ ] Tester réactivation
- [ ] Vérifier déblocage après réactivation
- [ ] Personnaliser contacts (WhatsApp, Tel, Email)
- [ ] Personnaliser tarif
- [ ] Déployer en production
- [ ] Former les super admins

---

**Version :** 1.0  
**Date :** 16 Mars 2026  
**Status :** ✅ Production Ready
