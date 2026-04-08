# Guide Administrateur - POS v2

## 1. Objectif du guide

Ce guide est destine aux administrateurs de magasin qui utilisent POS v2 pour piloter l'activite quotidienne, superviser les equipes et maintenir la qualite des donnees du point de vente.

Il explique de facon pratique :

- comment utiliser le tableau de bord
- comment suivre les shifts et les recus
- comment superviser les ventes et les remboursements
- comment gerer les produits, le stock et les depenses
- comment gerer les utilisateurs et les magasins rattaches
- comment utiliser les parametres du magasin
- comment travailler correctement en cas de coupure reseau

Ce document concerne le role administrateur. Il ne couvre pas les fonctions reservees au super administrateur, sauf lorsqu'il est utile de rappeler la limite de droit.

## 2. Perimetre du role administrateur

L'administrateur est le responsable operationnel d'un ou de plusieurs magasins rattaches a son compte.

Dans l'application, il peut en general acceder a :

- Tableau
- Vente
- Services
- Recus
- Clients
- Depenses
- Stock
- Produits
- Utilisateurs
- Magasins
- Parametres

## 3. Ce que l'administrateur fait au quotidien

Le role admin couvre en pratique quatre missions principales :

- superviser les ventes et les ecarts de caisse
- maintenir la qualite des donnees du magasin
- gerer l'equipe et les droits d'acces du magasin
- assurer la disponibilite operationnelle du point de vente

En clair, l'administrateur ne se limite pas a observer. Il agit sur les reglages, les utilisateurs, les produits, les depenses et le suivi du magasin.

## 4. Ce que l'admin ne fait pas ou fait avec limite

Par rapport au super administrateur, l'admin n'est pas le pilote global du reseau.

Les limites principales a retenir sont :

- la page Encaissements d'abonnement est reservee au super admin
- la creation globale des magasins est reservee au super admin dans l'interface visible actuelle
- la creation d'autres administrateurs peut etre reservee ou encadree selon l'ecran disponible
- l'admin travaille surtout sur les magasins qui lui sont rattaches

## 5. Avant de commencer la journee

Avant d'entamer le suivi de la journee, l'administrateur devrait verifier :

- que son compte s'ouvre correctement
- que le serveur est joignable si possible
- qu'aucun badge anormal d'operations en attente ne persiste
- que les shifts du matin sont ouverts correctement
- que les produits critiques sont disponibles
- que l'impression des recus fonctionne
- que les utilisateurs du jour ont acces a leur magasin

## 6. Connexion et securite de session

### 6.1 Connexion

La connexion se fait avec :

- le numero de telephone saisi sur 8 chiffres
- le mot de passe

Le prefixe +226 est ajoute par l'application.

### 6.2 Verrouillage par PIN

Comme les autres profils, l'admin peut retrouver sa session protegee par un PIN.

Le PIN sert a :

- deverrouiller rapidement la session
- proteger le poste sans perdre la page courante

Apres 5 erreurs de PIN, la session est fermee et il faut repasser par la connexion complete.

## 7. Navigation admin

L'admin doit se familiariser avec les pages suivantes.

### 7.1 Tableau

Page de pilotage et d'analyse des performances.

### 7.2 Vente

Page de caisse. L'admin peut aussi encaisser directement si besoin.

### 7.3 Services

Page de supervision et de cloture des shifts.

### 7.4 Recus

Page de recherche, impression et remboursement.

### 7.5 Clients

Page de gestion de la base clients du magasin.

### 7.6 Depenses

Page de saisie et d'analyse des depenses.

### 7.7 Stock

Page de suivi des signaux de marge, surplus, manque et consommation.

### 7.8 Produits

Page de maintenance du catalogue et du stock.

### 7.9 Utilisateurs

Page de consultation et de modification des comptes du magasin.

### 7.10 Magasins

Page de consultation, edition, bascule de magasin actif et renouvellement des magasins rattaches.

### 7.11 Parametres

Page de reglages operationnels, impression, logo, notifications et donnees de gestion du magasin.

## 8. Routine admin recommandee

Un administrateur efficace utilise l'application selon une routine claire.

### 8.1 En debut de journee

1. Se connecter.
2. Verifier le statut serveur.
3. Verifier le tableau de bord du jour.
4. Verifier qu'au moins un shift est correctement ouvert si le service a commence.
5. Verifier les recus ou remboursements en attente de verification.
6. Verifier l'etat du magasin actif.

### 8.2 Pendant la journee

1. Suivre le chiffre d'affaires et les remboursements.
2. Verifier les shifts ouverts et les ecarts eventuels.
3. Contrôler les depenses saisies.
4. Verifier les alertes ou signaux de stock.
5. Corriger les produits ou utilisateurs si necessaire.

### 8.3 En fin de journee

1. Verifier les recus importants ou litigieux.
2. Verifier les shifts fermes et les ecarts de caisse.
3. Synchroniser manuellement.
4. Verifier que le badge d'attente reseau n'est pas anormalement eleve.
5. Exporter les rapports si votre organisation l'exige.

## 9. Utiliser le tableau de bord

Le tableau de bord est l'outil principal de pilotage admin.

### 9.1 A quoi sert-il

Il permet de suivre sur une periode donnee :

- les ventes brutes
- les remboursements
- les ventes nettes
- le surplus de caisse
- le manque de caisse
- la marge brute
- la repartition des ventes dans le temps
- les ventes par produit

### 9.2 Choisir une periode

L'admin peut filtrer les donnees par :

- date de debut
- date de fin
- heure de debut
- heure de fin

Des raccourcis existent pour aller plus vite :

- Aujourd'hui
- Hier
- Cette semaine
- La semaine derniere
- Ce mois
- Le mois dernier
- Cette annee
- 7 derniers jours
- 30 derniers jours

### 9.3 Changer la granularite

Les courbes et histogrammes peuvent etre regroupes par :

- minutes
- heures
- jours
- semaines
- mois

Utiliser :

- heures pour le suivi d'une journee
- jours pour la lecture d'une semaine ou d'un mois
- semaines ou mois pour les tendances longues

### 9.4 Comprendre les indicateurs principaux

#### Ventes brutes

Montant total des ventes avant deduction des remboursements.

#### Remboursements

Montant total des tickets rembourses sur la periode.

#### Ventes nettes

Montant reel apres retrait des remboursements.

#### Surplus

Montant de caisse superieur au montant attendu lors des fermetures de shift.

#### Manque

Montant de caisse inferieur au montant attendu lors des fermetures de shift.

#### Marge brute

Indicateur de performance calcule a partir des ventes et des couts disponibles.

### 9.5 Lire les evolutions

Le tableau de bord compare la periode choisie avec une periode precedente equivalente.

L'admin doit surveiller en particulier :

- une hausse forte des remboursements
- un manque de caisse recurrent
- une baisse de marge
- un chiffre d'affaires stable mais une marge en recul

### 9.6 Exports

Le tableau de bord permet l'export des rapports, notamment en :

- Excel ou CSV
- PDF

Avant export :

1. verifier la periode
2. verifier les heures si vous travaillez par plage horaire
3. verifier le magasin actif

## 10. Superviser les shifts dans Services

La page Services est essentielle pour le controle admin.

### 10.1 Ce que l'admin y suit

- les shifts ouverts
- les shifts fermes
- la duree de chaque shift
- le caissier lie au shift
- le montant encaissé
- les details de cloture
- les ecarts de caisse

### 10.2 Usage admin standard

L'admin utilise cette page pour :

- verifier qu'un caissier a bien ouvert son shift
- consulter un shift en cours
- verifier un shift ferme
- analyser un surplus ou un manque
- acceder au detail d'un recu ou d'une vente liee au shift

### 10.3 Ce qu'il faut verifier sur un shift ferme

- montant d'ouverture coherent
- montant de fermeture coherent
- bon repartition cash et mobile money
- difference expliquee si elle n'est pas nulle
- chronologie compatible avec la journee de travail

### 10.4 En cas d'ecart de caisse

Procedure recommandee :

1. ouvrir le detail du shift
2. verifier les ventes du shift
3. verifier les remboursements
4. verifier les montants saisis a la fermeture
5. demander une explication au caissier si necessaire
6. noter l'incident dans la procedure interne du magasin

## 11. Utiliser la page Recus

La page Recus est l'outil de controle transactionnel.

### 11.1 Ce que l'admin y fait

- rechercher une vente
- verifier le detail d'un recu
- reimprimer un recu
- confirmer ou auditer un remboursement

### 11.2 Quand l'admin doit y aller

- un client conteste un ticket
- un caissier demande une verification
- un remboursement doit etre verifie
- un recu doit etre reimprime
- une anomalie de montant est signalee

### 11.3 Procedure de verification d'un recu

1. Aller dans Recus.
2. Rechercher la vente.
3. Ouvrir le detail.
4. Verifier les articles, le total, le mode de paiement et le statut.

### 11.4 Remboursements

L'administrateur doit surveiller :

- la frequence des remboursements
- les montants rembourses
- les motifs ou commentaires saisis
- la coherence entre le remboursement et la plainte client

Bon reflexe :

- ne pas banaliser les remboursements repetes
- recouper avec le tableau de bord et les shifts si necessaire

## 12. Utiliser la page Vente en tant qu'admin

L'admin peut aussi utiliser directement la caisse lorsque cela est necessaire.

Cas typiques :

- remplacement ponctuel d'un caissier
- verification d'un produit ou d'une impression
- test d'un flux de paiement

Dans ce cas, l'admin utilise la meme logique que le caissier :

- panier
- client
- paiement
- impression
- recu

Important :

- si l'admin encaisse lui-meme, il doit respecter les memes regles de shift et de cloture

## 13. Gerer les clients

La page Clients permet a l'admin de maintenir une base propre et exploitable.

### 13.1 Fonctions principales

- creation de client
- modification de fiche
- suppression selon les besoins
- recherche rapide
- consultation de l'historique des ventes par client

### 13.2 Ce qu'un admin doit surveiller

- doublons de clients
- numeros mal saisis
- clients sans informations minimales
- clients souvent impliques dans des demandes de recu ou remboursement

### 13.3 Bonnes pratiques

- harmoniser les noms clients
- verifier les numeros a 8 chiffres
- eviter les fiches dupliquees pour le meme client

## 14. Gerer les depenses

La page Depenses est importante pour l'analyse de la rentabilite et du stock.

### 14.1 Les trois types de depenses

#### Depense directe

Liee directement a un produit ou a une quantite achetee.

#### Depense indirecte

Depense a repartir sur plusieurs produits ou sur une categorie.

#### Depense operationnelle

Depense generale du magasin.

### 14.2 Ce que l'admin doit verifier

- que le type de depense est correct
- que le montant est realiste
- que la date est correcte
- que la description permet de comprendre la depense
- que le bon produit ou la bonne categorie est rattache

### 14.3 Filtres utiles

L'admin peut lire les depenses selon :

- aujourd'hui
- hier
- cette semaine
- ce mois
- cette annee
- plage personnalisee
- type de depense
- recherche texte

### 14.4 Analyse admin recommande

Verifier chaque jour :

- les depenses operationnelles du jour
- les depenses directes rattachees aux produits sensibles
- les depenses indirectes pouvant impacter les marges

## 15. Utiliser la page Stock

La page Stock Signals permet a l'admin de ne pas piloter seulement le stock theorique, mais aussi les signaux d'ecart et de rentabilite.

### 15.1 Ce que l'admin peut y lire

- les stocks actifs suivis
- les signaux termines
- les surplus
- les manques
- les marges observees
- l'impact de certaines depenses sur les produits

### 15.2 Filtres utiles

- periode
- type surplus ou manque
- type depense directe ou indirecte
- recherche

### 15.3 Quand intervenir

Intervenir si vous observez :

- un manque recurrent sur le meme produit
- une marge anormalement basse
- une depense rattachee a un produit sans retour de vente coherent
- des anomalies persistantes sur une categorie

## 16. Gerer les produits

La page Produits sert a maintenir le catalogue du magasin a jour.

### 16.1 Ce que l'admin peut faire

- creer un produit
- modifier un produit
- supprimer un produit si necessaire
- definir le prix de vente
- definir le prix de revient
- definir la marge cible
- definir le taux de taxe
- definir les variantes de prix
- activer le suivi de stock
- definir le stock initial et le stock minimum

### 16.2 Utilisation du formulaire produit

Le formulaire est organise en etapes :

- Informations
- Prix
- Variantes
- Stock

### 16.3 Informations a soigner

- nom clair
- categorie coherente
- unite correcte
- prix de vente renseigne
- cout si vous souhaitez suivre la marge
- stock initial fiable si le suivi de stock est actif

### 16.4 Variantes de prix

Si un article existe en plusieurs formats, l'admin doit creer les variantes avec un libelle compréhensible.

Exemples :

- petit
- moyen
- grand
- portion simple
- portion double

### 16.5 Recommandations catalogue

- eviter les produits en doublon
- utiliser une logique constante de nommage
- controler les articles sans prix
- definir un stock minimum sur les produits critiques

## 17. Categories et organisation du catalogue

La gestion des categories peut se faire via les ecrans dedies ou via le flux produit selon le contexte d'usage.

### 17.1 Ce qu'il faut savoir

- certaines categories sont propres au magasin
- certaines categories peuvent etre des categories par defaut du systeme
- une categorie par defaut peut etre masquee pour un magasin sans etre supprimee du systeme

### 17.2 Bon usage

- limiter les categories inutiles
- eviter les noms presque identiques
- garder des categories compréhensibles pour la caisse

## 18. Ajustements de stock

Les ajustements de stock sont utiles lorsque le stock reel ne correspond plus au stock attendu.

### 18.1 Cas typiques

- inventaire manuel
- perte ou casse
- erreur de saisie
- regularisation apres controle

### 18.2 Ce qu'un ajustement peut contenir

- produit
- quantite physique
- delta calcule ou saisi
- raison globale
- raison detaillee par article

### 18.3 Regle admin

Un ajustement doit toujours laisser une trace exploitable.

Il faut donc :

- renseigner la raison
- verifier la quantite avant validation
- synchroniser rapidement apres un ajustement important

## 19. Gerer les utilisateurs

La page Utilisateurs sert a piloter les comptes de l'equipe du magasin.

### 19.1 Informations disponibles sur un compte

- nom d'utilisateur
- telephone
- email
- role
- magasin ou magasins rattaches
- mot de passe
- PIN optionnel

### 19.2 Ce que l'admin peut faire

L'admin peut au minimum :

- consulter les utilisateurs de son perimetre
- rechercher par nom, telephone ou email
- filtrer par role
- filtrer par magasin
- modifier un compte existant
- supprimer un compte selon la procedure disponible

### 19.3 Limites a retenir

Dans l'interface visible actuelle :

- la creation directe d'un nouvel utilisateur peut etre reservee au super admin selon le bouton disponible
- l'admin ne doit pas se servir de cet ecran pour creer librement d'autres admins sans procedure definie

### 19.4 Regles de role

Pour le perimetre admin, les comptes les plus frequents a encadrer sont :

- caissier
- gestionnaire

### 19.5 Controles utiles lors d'une modification

Verifier :

- le bon numero de telephone
- le bon magasin rattache
- le role correct
- la presence ou non d'un PIN

### 19.6 PIN utilisateur

Le PIN permet le deverrouillage rapide de session.

Bon usage :

- le garder confidentiel
- ne pas reutiliser un PIN trop evident si la politique interne l'interdit

## 20. Gerer les magasins rattaches

La page Magasins permet a l'admin de piloter les magasins de son perimetre.

### 20.1 Ce que l'admin y voit

- la liste de ses magasins assignes
- le magasin actif actuel
- le statut actif ou inactif
- l'etat d'abonnement
- les dates d'expiration
- les actions disponibles sur chaque magasin

### 20.2 Magasin actif

Si l'admin est rattache a plusieurs magasins, l'application peut afficher un magasin actif.

L'admin doit toujours verifier qu'il travaille sur le bon magasin avant :

- de lire les indicateurs
- de modifier des produits
- de verifier des depenses
- de traiter un remboursement

### 20.3 Basculer sur un autre magasin

L'interface propose une action de bascule du magasin actif.

Procedure :

1. Aller dans Magasins.
2. Choisir le bon magasin.
3. Lancer l'action Basculer.
4. Confirmer.
5. Verifier ensuite que le magasin actif affiche est le bon.

### 20.4 Modifier un magasin

L'admin peut modifier les magasins de son perimetre, notamment :

- nom
- adresse

### 20.5 Renouveler un abonnement magasin

L'interface permet le renouvellement d'abonnement sur la base d'un tarif de reference de 5000 FCFA par mois.

Le dialogue de renouvellement affiche en general :

- le magasin concerne
- la date de fin actuelle
- le nombre de mois ajoute
- le total a payer
- la nouvelle date estimee de fin

Procedure :

1. Aller dans Magasins.
2. Ouvrir le magasin concerne.
3. Choisir Renouveler l'abonnement.
4. Selectionner le nombre de mois.
5. Verifier le total.
6. Confirmer.

### 20.6 Activer ou desactiver un magasin

L'interface actuelle permet aussi de basculer le statut d'un magasin.

Attention :

- desactiver un magasin peut rendre inactifs les utilisateurs lies
- cette action doit suivre une vraie decision de gestion

Ne pas desactiver un magasin sans comprendre l'impact sur les comptes utilisateurs.

## 21. Utiliser les Parametres

La page Parametres sert a regler la facon dont le magasin fonctionne dans l'application.

### 21.1 Notifications email

L'admin peut activer ou desactiver les notifications pour :

- shifts
- stock
- depenses
- connexions
- remboursements

Bon usage :

- activer les notifications qui ont une vraie valeur de suivi
- eviter de tout desactiver si vous comptez sur les alertes a distance

### 21.2 Solde manuel

Le magasin peut disposer d'un solde manuel de gestion.

Cette valeur doit etre modifiee avec prudence et idealement avec une note interne.

### 21.3 Fond de roulement

L'admin peut renseigner un fond de roulement pour le magasin.

Ce reglage est utile pour suivre la sante operationnelle et certains indicateurs de gestion.

### 21.4 Benefice

Le benefice peut aussi etre renseigne ou ajuste selon la logique interne du magasin.

### 21.5 Categories de repartition

La page permet aussi d'associer certaines categories au fond de roulement ou au benefice.

L'admin doit veiller a garder une logique constante pour ne pas fausser les chiffres.

### 21.6 Logo magasin

Le logo du magasin peut etre configure ou remplace.

Cela impacte notamment :

- certains affichages locaux
- les recus

### 21.7 Impression et imprimante

L'admin peut preparer la configuration d'impression :

- selection de l'imprimante
- connexion ou reconnexion
- auto-connexion
- diagnostic imprimante
- format papier selon les options disponibles

### 21.8 Version et mise a jour

La page permet aussi de consulter la version de l'application et, selon le contexte, de verifier les mises a jour.

## 22. Mode hors ligne et synchronisation

L'administrateur doit mieux maitriser ce sujet qu'un simple utilisateur.

### 22.1 Ce qu'il faut retenir

- l'application peut continuer a travailler localement
- le serveur reste la reference finale une fois synchronise
- un badge indique les operations en attente
- le bouton Synchroniser force l'envoi et le rafraichissement des donnees

### 22.2 Reflexes admin en cas de coupure

1. Ne pas paniquer si les donnees locales sont encore visibles.
2. Eviter les modifications multiples contradictoires sur les memes fiches.
3. Controler les ventes, remboursements et ajustements critiques.
4. Synchroniser manuellement des que le serveur revient.
5. Verifier apres synchronisation que les donnees sensibles sont bien presentes.

### 22.3 Operations sensibles a surveiller apres reconnexion

- remboursements
- ajustements de stock
- modifications de produits
- modifications de clients
- depenses importantes
- changements de statut magasin

## 23. Checklist admin quotidienne

### 23.1 Ouverture

1. Se connecter.
2. Verifier le magasin actif.
3. Verifier le serveur.
4. Verifier le tableau de bord du jour.
5. Verifier les shifts ouverts.
6. Verifier l'impression.

### 23.2 Pendant la journee

1. Controler les ventes nettes.
2. Controler les remboursements.
3. Controler les depenses.
4. Controler les signaux de stock.
5. Corriger les anomalies sur produits, clients ou utilisateurs.

### 23.3 Fermeture

1. Verifier les shifts fermes.
2. Verifier surplus et manque.
3. Revoir les recus litigieux.
4. Synchroniser.
5. Exporter les rapports si besoin.

## 24. Checklist hebdomadaire admin

Chaque semaine, il est recommande de :

1. passer en revue les remboursements
2. verifier les utilisateurs actifs
3. controler les produits sans prix ou incoherents
4. verifier les magasins proches de l'expiration si vous en gerez plusieurs
5. revoir les depenses operationnelles de la semaine
6. revoir les produits avec manque recurrent

## 25. Problemes courants et solutions

### 25.1 Les chiffres du tableau de bord semblent anormaux

Verifier :

- la periode choisie
- les heures choisies
- le magasin actif
- la presence de remboursements importants
- la presence d'ecarts de shift

### 25.2 Un caissier ne voit pas ses bons produits

Verifier :

- le bon magasin actif
- le rattachement utilisateur au bon magasin
- la synchronisation
- la coherence des categories et du catalogue

### 25.3 Les recus ne s'impriment plus

Verifier :

- la configuration imprimante dans Parametres
- la connexion Bluetooth ou native
- l'impression web en secours
- les recus disponibles dans l'historique

### 25.4 Un magasin semble bloque ou expire

Verifier :

- la date d'abonnement
- le statut actif ou inactif
- la possibilite de renouvellement depuis Magasins

### 25.5 Des operations restent en attente trop longtemps

Verifier :

- le statut serveur
- la connexion internet reelle
- la synchronisation manuelle
- les operations sensibles modifiees hors ligne

### 25.6 Des ecarts de caisse se repetent

Procedure recommandee :

1. verifier les shifts concernes
2. verifier les recus rembourses
3. verifier les clotures de service
4. verifier le process de comptage des caissiers
5. mettre en place un suivi interne si le probleme persiste

## 26. Relation entre admin et super admin

L'admin doit savoir a quel moment escalader vers le super admin.

Escalader lorsque le besoin porte sur :

- les encaissements d'abonnement globaux
- la creation ou reorganisation globale du reseau de magasins
- la supervision multi-boutiques complete au niveau global
- des arbitrages de droit ou de structure qui depassent votre perimetre

## 27. Bonnes pratiques admin

- Toujours verifier le magasin actif avant une action critique.
- Ne pas corriger les donnees sensibles sans comprendre l'origine du probleme.
- Garder une logique stable de categories, produits et roles.
- Suivre les remboursements comme un indicateur de risque, pas comme une simple formalite.
- Controler les ecarts de caisse avant qu'ils deviennent habituels.
- Synchroniser regulierement, surtout apres des modifications administratives.
- Tester l'impression et les reglages en dehors des heures de pointe si possible.

## 28. Resume pratique

Le cycle normal d'un administrateur est :

1. verifier le tableau de bord
2. superviser les shifts
3. controler les recus et remboursements
4. maintenir les produits, depenses et utilisateurs
5. gerer le magasin actif et son abonnement si necessaire
6. synchroniser et cloturer proprement la journee

Si l'admin garde ce cycle simple et rigoureux, l'application devient un vrai outil de pilotage et pas seulement une caisse.