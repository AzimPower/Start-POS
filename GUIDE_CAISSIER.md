# Guide Caissier - POS v2

## 1. Objectif du guide

Ce guide est destine aux caissiers qui utilisent POS v2 au quotidien.

Il explique de facon pratique :

- comment se connecter
- comment ouvrir la caisse
- comment vendre
- comment imprimer un recu
- comment retrouver ou rembourser une vente
- comment fermer un shift correctement
- comment reagir en cas de probleme courant

Ce document est volontairement centre sur l'usage terrain, sans entrer dans les fonctions reserves aux administrateurs.

## 2. Ce que le caissier peut faire dans l'application

Le caissier utilise principalement ces pages :

- Vente
- Services
- Recus
- Clients
- Depenses
- Stock
- Parametres

Le caissier n'est pas cense gerer :

- les utilisateurs
- les magasins
- les paiements d'abonnement
- la gestion avancee du catalogue si le role ne l'autorise pas

## 3. Avant de commencer le service

Avant la premiere vente, verifier :

- que vous avez votre numero de telephone
- que vous connaissez votre mot de passe
- que vous connaissez votre PIN si votre session en utilise un
- que l'appareil est charge ou branche
- que l'imprimante est disponible si le magasin imprime les recus
- que le reseau ou le serveur est joignable si possible

## 4. Connexion

### 4.1 Comment se connecter

1. Ouvrir l'application.
2. Saisir les 8 chiffres du numero de telephone.
3. Saisir le mot de passe.
4. Appuyer sur Se connecter.

Important :

- le prefixe +226 est deja gere par l'application
- vous devez saisir seulement les 8 chiffres

Exemple :

- numero complet : +22670123456
- saisie dans l'app : 70123456

### 4.2 Si un PIN apparait

L'application peut demander un code PIN a 4 chiffres pour deverrouiller la session.

Dans ce cas :

1. saisir les 4 chiffres du PIN
2. attendre la reprise de la session

Regle de securite :

- apres 5 essais incorrects, la session est fermee
- vous devrez vous reconnecter avec vos identifiants

## 5. Comprendre le haut de l'ecran

Selon l'appareil, l'application affiche en haut :

- l'etat du serveur
- un bouton Synchroniser
- un badge avec le nombre d'operations en attente

### 5.1 Signification rapide

- OK ou icone reseau verte : le serveur est joignable
- Offline ou indicateur rouge : le serveur ne repond pas
- badge chiffre : certaines operations locales ne sont pas encore envoyees

### 5.2 Ce qu'il faut faire si le reseau est coupe

Le caissier peut souvent continuer a vendre si les donnees sont deja presentes localement.

Mais il faut :

- surveiller le nombre d'operations en attente
- synchroniser des que la connexion revient
- eviter de fermer la journee sans tentative de synchronisation

## 6. Procedure standard de debut de service

Au debut du service, le caissier doit suivre cet ordre :

1. se connecter
2. verifier le statut reseau
3. aller dans Services
4. ouvrir le shift si aucun shift n'est actif
5. verifier le montant d'ouverture
6. aller dans Vente
7. tester si l'impression fonctionne si le magasin imprime les recus

## 7. Ouvrir un shift ou service

La page Services permet d'ouvrir et de fermer la caisse.

### 7.1 Pourquoi c'est important

Le shift sert a rattacher :

- les ventes
- les mouvements de caisse
- la fermeture du service
- le calcul de surplus ou de manque

### 7.2 Ouvrir le shift

1. Aller dans Services.
2. Chercher l'action d'ouverture du shift.
3. Saisir le montant reel present en caisse au debut du service.
4. Valider.

### 7.3 Exemple

Si vous commencez la journee avec 25000 FCFA dans la caisse :

1. saisir 25000
2. confirmer l'ouverture

### 7.4 Bon reflexe

Ne pas commencer les ventes sans avoir verifie qu'un shift est bien ouvert.

## 8. Faire une vente

La page Vente est la page principale du caissier.

Elle permet de :

- chercher des produits
- ajouter des produits au panier
- modifier les quantites
- associer un client
- encaisser
- imprimer le recu

## 9. Rechercher un produit

Le produit peut etre retrouve de plusieurs manieres :

- par la barre de recherche
- par categorie
- via les favoris

### 9.1 Quand utiliser la recherche

Utiliser la recherche si :

- le catalogue est grand
- vous ne voyez pas le produit a l'ecran
- vous connaissez son nom ou une partie du nom

### 9.2 Quand utiliser les categories

Utiliser les categories pour aller plus vite sur des familles de produits :

- boissons
- plats
- accessoires
- etc.

### 9.3 Quand utiliser les favoris

Les favoris servent pour les produits vendus tres souvent.

Exemple :

- eau
- soda
- pain
- menu standard

## 10. Ajouter un produit au panier

Pour ajouter un article :

1. retrouver le produit
2. toucher ou cliquer sur le produit
3. verifier que la ligne apparait dans le panier

Si le produit existe deja dans le panier, l'application peut augmenter la quantite au lieu de creer une nouvelle ligne.

## 11. Produits a prix variable

Certains produits ne possedent pas un seul prix.

L'application peut demander de choisir une variante, par exemple :

- petit
- moyen
- grand

### Procedure

1. selectionner le produit
2. choisir la bonne variante
3. verifier le prix dans le panier

## 12. Produits a prix saisi manuellement

Dans certains cas, l'application peut permettre un prix personnalise.

Dans ce cas :

1. ouvrir le produit concerne
2. saisir le prix demande
3. valider
4. verifier le panier avant encaissement

Ne jamais saisir un prix au hasard. Si le prix vous semble anormal, demander validation a un responsable.

## 13. Modifier le panier

Dans le panier, le caissier peut :

- augmenter la quantite
- diminuer la quantite
- supprimer une ligne
- verifier le sous-total
- verifier la taxe
- verifier le total final

### 13.1 Avant d'encaisser, toujours verifier

- la bonne quantite
- le bon prix
- le bon total
- la presence ou non d'un client rattache

## 14. Associer un client a la vente

Le client peut etre associe a la vente si le magasin suit les historiques clients.

### 14.1 Pourquoi le faire

Cela permet de :

- retrouver plus facilement un recu
- suivre les habitudes d'achat
- rattacher certaines ventes a un client connu

### 14.2 Selectionner un client existant

1. ouvrir la zone client dans la page Vente
2. rechercher le client
3. le selectionner
4. verifier qu'il apparait sur la vente

### 14.3 Ajouter un nouveau client rapidement

Si le client n'existe pas encore :

1. ouvrir l'ajout client
2. saisir les informations utiles
3. enregistrer
4. reprendre la vente

Informations frequentes :

- nom
- telephone
- email
- adresse
- notes

## 15. Encaisser la vente

Quand le panier est pret :

1. ouvrir le panneau de paiement
2. choisir le mode de paiement
3. saisir les montants recus
4. verifier le total
5. valider la vente

## 16. Modes de paiement

### 16.1 Especes

Choisir Especes si le client paye entierement en cash.

L'application peut pre-remplir le montant a encaisser avec le total du ticket.

### 16.2 Mobile money

Choisir Mobile Money si le client regle entierement par transfert mobile.

### 16.3 Paiement mixte

Choisir Mixte si le client paie avec deux moyens de paiement.

Exemple :

- 2000 FCFA en especes
- 3000 FCFA en mobile money

La somme doit correspondre au montant du ticket.

## 17. Monnaie a rendre

En paiement especes, verifier :

- le montant recu du client
- le total du ticket
- la monnaie a rendre

Toujours annoncer clairement la monnaie au client avant de remettre le recu.

## 18. Finaliser la vente

Apres validation :

- la vente est enregistree
- un recu peut s'afficher
- l'impression peut se lancer automatiquement selon les reglages
- la vente est synchronisee ou mise en attente selon le reseau

## 19. Impression du recu

### 19.1 Cas standard

Si l'auto-impression est activee, le recu peut sortir automatiquement apres la vente.

Sinon, le caissier peut lancer l'impression manuellement.

### 19.2 Si vous etes sur ordinateur

L'impression passe en general par l'ecran d'impression du navigateur.

### 19.3 Si vous etes sur Android

L'application peut essayer :

- une impression native
- une impression Bluetooth si configuree
- un fallback impression web si le mode natif echoue

### 19.4 Verifications utiles

- papier present
- imprimante allumee
- connexion Bluetooth si necessaire
- bon format de recu

## 20. Enregistrer un brouillon de vente

Le brouillon sert a mettre une vente en attente.

Exemples :

- le client n'a pas encore fini sa commande
- le client va payer plus tard
- vous devez interrompre la saisie

### Procedure

1. enregistrer le panier en brouillon
2. ajouter un commentaire si l'ecran le propose
3. reprendre le brouillon plus tard

## 21. Retrouver un recu

La page Recus sert a retrouver les ventes deja effectuees.

### 21.1 Ce que vous pouvez y faire

- rechercher une vente
- consulter son detail
- reimprimer un recu
- lancer un remboursement si autorise

### 21.2 Procedure pour retrouver un recu

1. Aller dans Recus.
2. Utiliser la recherche.
3. Ouvrir la vente souhaitee.
4. Verifier la date, le montant et les articles.

## 22. Reimprimer un recu

1. Aller dans Recus.
2. Ouvrir la vente.
3. Lancer l'impression.
4. Verifier que le bon recu sort.

Utiliser cette fonction si :

- le client a perdu son recu
- la premiere impression n'est pas sortie
- le responsable demande une verification papier

## 23. Rembourser une vente

Selon les droits du compte et les regles du magasin, un caissier peut avoir acces au remboursement.

### Procedure recommandee

1. Ouvrir la page Recus.
2. Retrouver la bonne vente.
3. Verifier le montant et les articles.
4. Lancer le remboursement.
5. Renseigner le motif ou commentaire si demande.
6. Confirmer.

### Points importants

- ne jamais rembourser sans verifier la bonne vente
- ne pas rembourser deux fois la meme operation
- signaler tout doute a un responsable

## 24. Enregistrer une depense simple

Le caissier peut avoir acces a la page Depenses pour enregistrer certaines sorties.

### Exemples

- petit achat urgent
- frais de fonctionnement simple
- depense demandee par le responsable

### Procedure

1. Aller dans Depenses.
2. Choisir le bon type de depense.
3. Saisir le montant.
4. Ajouter une description claire.
5. Enregistrer.

### Regle importante

Ne pas choisir un type de depense au hasard. Si vous ne savez pas si la depense est directe, indirecte ou operationnelle, demander au gestionnaire ou a l'admin.

## 25. Consulter les clients

La page Clients permet de :

- retrouver un client
- modifier une fiche si besoin et si la politique du magasin l'autorise
- consulter son historique de ventes

### Quand s'en servir

- un client reclame un ancien recu
- un client veut corriger son numero
- vous devez retrouver rapidement un acheteur connu

## 26. Consulter la page Stock

Le caissier peut voir certains signaux stock ou marge.

Cette page sert surtout a alerter sur des situations comme :

- manque
- surplus
- suivi de depenses liees aux produits

Si vous voyez une anomalie repetee sur un produit, prevenir un gestionnaire ou un admin.

## 27. Fermer le shift en fin de service

La fermeture du shift est une etape critique.

Elle permet de comparer :

- ce que la caisse devrait contenir
- ce que vous avez reellement compte

### 27.1 Avant de fermer

Faire ces verifications :

1. terminer les ventes en cours
2. traiter les recus manquants si besoin
3. verifier les remboursements du service
4. essayer de synchroniser si le reseau est disponible
5. compter la caisse physiquement

### 27.2 Informations de cloture a preparer

- montant cash reel
- montant mobile money du service si demande
- autre montant si le formulaire le demande

### 27.3 Procedure de fermeture

1. Aller dans Services.
2. Ouvrir le shift actif.
3. Choisir la fermeture.
4. Saisir les montants reels.
5. Verifier le montant attendu.
6. Confirmer la fermeture.

### 27.4 Comprendre le resultat

- si le reel est superieur a l'attendu : surplus
- si le reel est inferieur a l'attendu : manque
- si le reel est egal a l'attendu : caisse juste

### 27.5 Bon reflexe en cas d'ecart

Si l'ecart n'est pas normal :

1. recompter la caisse
2. verifier les tickets recents
3. verifier si une vente a ete annulee ou remboursee
4. avertir le responsable avant validation definitive si necessaire

## 28. Checklist complete du caissier

### 28.1 Ouverture

1. Se connecter.
2. Entrer le PIN si demande.
3. Verifier l'etat reseau.
4. Ouvrir le shift.
5. Verifier l'imprimante.
6. Ouvrir la page Vente.

### 28.2 Pendant le service

1. Verifier les articles avant chaque encaissement.
2. Associer le client si utile.
3. Verifier le mode de paiement.
4. Donner le recu.
5. Corriger rapidement toute erreur constatee.

### 28.3 Fermeture

1. Finaliser les ventes en attente.
2. Rechercher les recus necessaires.
3. Synchroniser.
4. Compter la caisse.
5. Fermer le shift.
6. Noter tout ecart si la procedure du magasin le demande.

## 29. Problemes courants et solutions

### 29.1 Je ne peux pas me connecter

Verifier :

- que le numero saisi contient 8 chiffres
- que vous n'avez pas ajoute le prefixe +226 a la main
- que le mot de passe est correct
- que vous utilisez bien votre propre compte

### 29.2 Le PIN est refuse

Verifier :

- que vous saisissez le bon PIN
- que vous n'avez pas confondu avec le PIN d'un collegue

Attention :

- apres 5 erreurs, vous serez renvoye vers la connexion

### 29.3 Le produit n'apparait pas

Essayer :

1. la recherche
2. la bonne categorie
3. la synchronisation si le serveur est accessible

Si le produit reste absent, prevenir un responsable.

### 29.4 La vente ne part pas au serveur

Verifier :

- le statut reseau
- le badge des operations en attente
- la synchronisation manuelle

Ne pas ressaisir plusieurs fois la meme vente sans verification.

### 29.5 L'imprimante ne sort rien

Verifier :

- l'alimentation de l'imprimante
- le papier
- la connexion Bluetooth si applicable
- la possibilite de reimprimer depuis Recus

### 29.6 Le shift affiche un ecart

Faire :

1. un nouveau comptage de caisse
2. une verification des derniers tickets
3. une verification des remboursements
4. un signalement au responsable si l'ecart persiste

### 29.7 L'application affiche Offline

Vous pouvez souvent continuer a travailler si les donnees sont deja chargees.

Mais il faut :

- eviter de quitter l'application brutalement
- synchroniser des que le serveur revient
- informer le responsable si la coupure dure trop longtemps

## 30. Bonnes pratiques du caissier

- Utiliser uniquement votre compte personnel.
- Verifier chaque montant avant validation.
- Ne pas ouvrir plusieurs ventes confuses en meme temps si ce n'est pas necessaire.
- Donner un recu au client chaque fois que possible.
- Rechercher un recu avant de declarer qu'il est introuvable.
- Ne pas rembourser sans controle.
- Ne pas fermer le shift sans compter la caisse reellement.
- Synchroniser avant de quitter le poste.

## 31. Resume ultra court a retenir

Le cycle normal d'un caissier est :

1. connexion
2. ouverture du shift
3. vente
4. impression du recu
5. gestion des recus si besoin
6. synchronisation
7. fermeture du shift

Si vous respectez ce cycle et que vous verifiez les montants avant validation, vous reduisez fortement les erreurs de caisse.