# Manuel Utilisateur - POS v2

## 1. Objet du manuel

Ce document sert de guide d'utilisation complet pour l'application POS v2.

Il est destine aux utilisateurs metier de l'application :

- caissiers
- gestionnaires
- administrateurs de magasin
- super administrateurs

Le manuel est centre sur l'usage quotidien reel de l'application telle qu'elle est implementee dans le projet actuel : caisse, gestion des services, recus, clients, produits, depenses, stock, magasins, utilisateurs, parametres et abonnements.

## 2. Vue d'ensemble de l'application

POS v2 est une application de point de vente multi-boutiques, utilisable sur navigateur et sur mobile Android, avec fonctionnement hybride :

- consultation et saisie locale via IndexedDB
- synchronisation avec le backend PHP des qu'une connexion serveur est disponible
- impression des recus via impression web ou imprimante native Bluetooth sur Android
- gestion du verrouillage par PIN sans perdre la page en cours
- prise en charge des operations en ligne et hors ligne

L'application couvre les besoins suivants :

- encaissement et vente en caisse
- suivi des shifts ou services
- gestion des recus et remboursements
- gestion des clients
- gestion des produits, du stock et des categories
- suivi des depenses et des signaux de stock ou marge
- administration des utilisateurs et des magasins
- suivi des abonnements boutiques

## 3. Roles et droits d'acces

L'affichage du menu depend du role connecte.

| Role | Acces principal | Usage type |
| --- | --- | --- |
| Caissier | Vente, Services, Recus, Clients, Depenses, Stock, Parametres | Encaisser, imprimer, rembourser, fermer un shift |
| Gestionnaire | Meme base que le caissier + Produits | Suivre l'activite, mettre a jour certains produits, faire des ajustements de stock |
| Admin | Tableau de bord, Vente, Services, Recus, Clients, Depenses, Stock, Produits, Utilisateurs, Magasins, Parametres | Gerer un ou plusieurs magasins, l'equipe, le catalogue et les indicateurs |
| Super admin | Tous les acces admin + vue globale + Encaissements d'abonnement | Superviser tout le reseau de magasins et les paiements d'abonnement |

### Points importants

- Le caissier est redirige vers la caisse apres connexion.
- L'admin et le super admin sont rediriges vers le tableau de bord.
- Si le magasin est desactive ou si l'abonnement est expire, l'utilisateur standard est bloque sur un ecran d'abonnement expire.
- Le super admin n'est pas bloque par le statut d'abonnement d'un magasin.

## 4. Premiere prise en main

### 4.1 Ce qu'il faut avoir avant de commencer

Avant d'utiliser l'application, verifiez que vous disposez de :

- votre numero de telephone professionnel
- votre mot de passe
- votre code PIN si votre compte en utilise un
- un magasin actif rattache a votre compte
- une connexion internet au moins lors de la premiere initialisation de l'appareil

### 4.2 Interface generale

Sur ordinateur, l'application affiche une barre laterale gauche avec les groupes de menu :

- Essentiel
- Vente
- Gestion
- Administration

Sur mobile, le menu s'ouvre via un bouton en haut a gauche.

En haut de l'interface, l'utilisateur peut voir selon la page :

- le statut reseau ou serveur
- le bouton de synchronisation manuelle
- un badge avec le nombre d'operations en attente de synchronisation

## 5. Connexion a l'application

### 5.1 Ecran de connexion

L'ecran de connexion demande :

- le numero de telephone
- le mot de passe

### 5.2 Regle de saisie du numero

Le prefixe +226 est deja gere par l'application.

L'utilisateur saisit uniquement les 8 chiffres du numero.

Exemple :

- si votre numero complet est +22670123456
- vous devez saisir 70123456

### 5.3 Procedure de connexion

1. Ouvrir l'application.
2. Saisir les 8 chiffres du numero dans le champ Telephone.
3. Saisir le mot de passe.
4. Appuyer sur Se connecter.
5. Attendre la redirection automatique selon votre role.

### 5.4 Messages frequents a cet ecran

- Numero de telephone ou mot de passe incorrect : les identifiants sont invalides ou non synchronises.
- Numero a 8 chiffres requis : le numero saisi est incomplet.
- Erreur de premiere connexion hors ligne : le compte doit parfois etre initialise une premiere fois avec Internet.

## 6. Deverrouillage par PIN

### 6.1 Quand le PIN apparait

Le PIN peut s'afficher dans deux cas :

- a la reprise d'une session deja ouverte
- en surcouche sur la page courante lorsque la session est verrouillee

Le but est de proteger la session sans faire perdre le travail en cours.

### 6.2 Fonctionnement

- le PIN est compose de 4 chiffres
- la saisie se fait via un pave numerique
- si le PIN est correct, la session reprend sur la derniere page active
- si le PIN est faux, le nombre d'essais restants est affiche

### 6.3 Regle de securite

Apres 5 tentatives incorrectes :

- le PIN est considere comme bloque
- la session est fermee
- l'utilisateur est renvoye vers l'ecran de connexion

### 6.4 Bonnes pratiques

- ne pas partager son PIN
- eviter de laisser l'app ouverte sans surveillance
- si un collegue reprend la caisse, il doit utiliser son propre compte

## 7. Navigation par role

### 7.1 Menu caissier

Le caissier utilise principalement :

- Vente
- Services
- Recus
- Clients
- Depenses
- Stock
- Parametres

### 7.2 Menu gestionnaire

Le gestionnaire retrouve les fonctions du caissier avec en plus :

- Produits

Selon l'organisation interne, il peut aussi intervenir sur le stock et les categories de travail.

### 7.3 Menu administrateur

L'administrateur voit en general :

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

### 7.4 Menu super administrateur

Le super administrateur dispose en plus de :

- un tableau de bord global multi-boutiques
- la page Encaissements pour les abonnements

## 8. Statut reseau, mode hors ligne et synchronisation

L'application est concue pour continuer a travailler meme si Internet ou le serveur n'est pas disponible.

### 8.1 Ce que signifient les indicateurs

- indicateur vert ou OK : le serveur est joignable
- indicateur rouge ou Offline : l'application ne joint pas le serveur
- badge chiffre : nombre d'operations locales pas encore synchronisees
- bouton Synchroniser : tentative manuelle d'envoi et de rafraichissement des donnees

### 8.2 Ce qui continue de fonctionner hors ligne

Selon la nature des donnees deja presentes localement, l'utilisateur peut generalement continuer a :

- vendre
- consulter des produits et clients deja synchronises
- ajouter ou modifier des clients
- enregistrer des depenses
- consulter certains recus deja en local
- ouvrir ou fermer un shift

### 8.3 Ce qu'il faut retenir

- le backend reste la source de verite finale
- les operations sont mises en file d'attente lorsqu'il n'y a pas de connexion
- a la reconnexion, l'application tente une synchronisation automatique
- le bouton Synchroniser permet de forcer cette operation

### 8.4 Reflexe recommande

Avant la fermeture d'un service ou avant de quitter le magasin :

1. verifier que le serveur est joignable
2. appuyer sur Synchroniser
3. attendre la fin de la synchronisation
4. verifier que le badge d'attente revient a zero si possible

## 9. Procedure complete du caissier

Cette section decrit le parcours standard d'un caissier du debut a la fin de son service.

### 9.1 Debut de journee

1. Ouvrir l'application.
2. Se connecter avec le numero et le mot de passe.
3. Debloquer la session avec le PIN si demande.
4. Verifier en haut de l'ecran que le serveur est accessible ou, a defaut, que les donnees locales sont disponibles.
5. Ouvrir ou verifier le shift actif dans la page Services.
6. Se rendre sur la page Vente.

### 9.2 Ouvrir un shift ou service

La page Services permet de demarrer officiellement une session de caisse.

#### Informations utilisees a l'ouverture

- montant d'ouverture
- utilisateur courant
- magasin courant
- date et heure de debut

#### Procedure

1. Aller dans Services.
2. Cliquer sur l'action d'ouverture du shift.
3. Saisir le montant d'ouverture reel dans la caisse.
4. Valider.

#### Resultat attendu

Une ligne de shift ouvert apparait avec le statut Ouvert.

#### Point important

La caisse attend en pratique qu'un shift soit actif pour travailler normalement.

### 9.3 Utiliser la page Vente

La page Vente est le coeur de l'application.

Elle permet de :

- chercher des produits
- filtrer les produits par categorie
- utiliser les favoris
- ajouter des articles au panier
- modifier les quantites
- associer un client
- encaisser en especes, mobile money ou paiement mixte
- imprimer le recu
- enregistrer un brouillon de vente

### 9.4 Rechercher et ajouter un produit

#### Moyens de retrouver un article

- saisie dans la recherche produit
- filtrage par categorie
- utilisation des favoris

#### Quand on touche un produit

Selon la configuration du produit, l'application peut :

- l'ajouter directement au panier
- demander de choisir une variante de prix
- ouvrir une saisie de prix personnalise

### 9.5 Variantes et prix personnalises

Un produit peut proposer plusieurs prix, par exemple :

- petit
- moyen
- grand

Dans ce cas, l'utilisateur choisit la variante avant l'ajout au panier.

Certains produits peuvent aussi accepter un prix saisi manuellement selon la procedure mise en place par le magasin.

### 9.6 Gerer le panier

Dans le panier, l'utilisateur peut :

- augmenter la quantite
- diminuer la quantite
- supprimer une ligne
- consulter le sous-total
- consulter la taxe calculee
- consulter le total a payer

### 9.7 Regles a connaitre sur la vente

- un produit sans prix valide ne doit pas etre vendu
- si le stock semble insuffisant, l'application peut afficher un avertissement
- le suivi du stock depend du parametre du produit
- les favoris sont enregistres par utilisateur sur l'appareil

### 9.8 Associer un client a la vente

L'association d'un client est facultative mais recommandee lorsque le magasin suit :

- l'historique d'achat
- les recus par client
- les credits ou soldes clients

Depuis la caisse, l'utilisateur peut :

- rechercher un client existant
- selectionner un client dans la liste
- ajouter rapidement un nouveau client

#### Informations client disponibles ou saisissables

- nom
- telephone
- email
- adresse
- notes

### 9.9 Enregistrer rapidement un nouveau client depuis la caisse

1. Ouvrir la zone de selection client.
2. Choisir l'ajout d'un nouveau client.
3. Saisir au minimum le nom et les informations utiles.
4. Valider.
5. Revenir a la vente.

### 9.10 Lancer l'encaissement

Quand le panier est pret :

1. ouvrir le panneau de paiement
2. choisir le mode de paiement
3. saisir les montants recus
4. verifier le total
5. confirmer la vente

### 9.11 Modes de paiement disponibles

#### Especes

Utiliser ce mode lorsque le client regle entierement en cash.

L'application pre-remplit generalement le montant cash avec le total a payer.

#### Mobile money

Utiliser ce mode lorsque la vente est entierement payee par portefeuille mobile.

#### Mixte

Utiliser ce mode lorsque le paiement est partage, par exemple :

- une partie en especes
- une partie en mobile money

Dans ce cas, la somme des montants saisis doit correspondre au total de la vente.

### 9.12 Monnaie a rendre

En paiement especes, l'application aide au calcul de la monnaie a rendre en comparant :

- le montant du ticket
- le montant recu

Si le magasin suit la monnaie ou les ecarts client, certaines options supplementaires peuvent etre actives selon le profil utilisateur.

### 9.13 Finaliser la vente

Apres validation :

- la vente est enregistree
- le recu peut s'afficher immediatement
- l'impression peut etre automatique selon les parametres
- la vente part en synchronisation ou en file d'attente selon l'etat reseau

### 9.14 Gerer un brouillon de vente

La caisse propose un systeme de brouillons pour les ventes interrompues.

Cas d'usage typiques :

- client qui revient plus tard payer
- commande en attente
- panier a reprendre apres interruption

Bon usage :

1. enregistrer le brouillon avec un commentaire si necessaire
2. reprendre le brouillon depuis le panneau dedie
3. verifier les lignes avant validation definitive

### 9.15 Imprimer un recu depuis la caisse

Apres la vente, le recu peut etre :

- imprime automatiquement
- imprime manuellement
- reimprime plus tard depuis la page Recus

Le recu contient normalement :

- le nom et les coordonnees du magasin
- la date et l'heure
- le numero de recu
- les articles vendus
- les quantites
- les prix unitaires
- les taxes
- le total
- le mode de paiement

## 10. Page Services ou Shifts

La page Services sert a piloter l'ouverture, le suivi et la fermeture des shifts.

### 10.1 Ce qu'on y trouve

- les shifts ouverts
- les shifts fermes
- les dates et heures
- le montant encaisse
- la duree du service
- le caissier concerne
- le detail d'un shift

### 10.2 Ouvrir un shift

Voir la procedure de la section 9.2.

### 10.3 Fermer un shift

Lors de la fermeture, l'utilisateur doit en general renseigner :

- le montant cash compte reellement
- le montant mobile money
- un montant autre si ce champ est active
- le montant final de cloture

L'application calcule ensuite :

- le montant attendu
- la difference entre reel et attendu
- le surplus ou le manque

### 10.4 Interpretrer la difference de caisse

- difference positive : surplus
- difference negative : manque
- difference nulle : caisse juste

### 10.5 Detail du shift

Le detail peut inclure :

- les ventes rattachees au service
- les montants d'ouverture et de fermeture
- les paiements par type
- le recapitulatif du service
- l'impression d'un recu de shift

### 10.6 Restrictions d'acces

- un caissier voit surtout son propre shift
- un admin de magasin peut voir les shifts du magasin
- les informations affichees peuvent etre masquees partiellement pour certains profils tant que le shift est ouvert

## 11. Page Recus

La page Recus sert a retrouver les ventes deja enregistrees.

### 11.1 Fonctions principales

- liste paginee des recus
- recherche
- consultation du detail d'un recu
- impression ou reimpression
- remboursement avec justification
- filtrage implicite par magasin selon le profil

### 11.2 Rechercher un recu

L'utilisateur peut rechercher selon les informations visibles dans la liste, par exemple :

- identifiant de vente
- reference
- client
- montant
- informations reliees au shift

### 11.3 Ouvrir le detail d'un recu

1. Aller dans Recus.
2. Rechercher si necessaire.
3. Ouvrir la ligne voulue.
4. Verifier les articles, le montant et le statut.

### 11.4 Reimprimer un recu

Depuis le detail ou la liste, utiliser l'action d'impression.

Le comportement depend du support :

- sur web : impression navigateur
- sur Android : tentative d'impression native, sinon bascule vers l'impression web

### 11.5 Rembourser une vente

La page permet de lancer un remboursement avec confirmation.

Procedure recommandee :

1. ouvrir le recu concerne
2. verifier qu'il s'agit de la bonne vente
3. lancer l'action de remboursement
4. saisir le commentaire ou motif demande
5. confirmer

Apres remboursement :

- le recu est marque comme rembourse
- une date de remboursement peut etre enregistree
- l'information entre dans les statistiques et l'audit

## 12. Page Clients

La page Clients sert a gerer la base clients du magasin.

### 12.1 Fonctions principales

- creer un client
- modifier un client
- supprimer un client
- rechercher un client
- consulter ses ventes ou recus

### 12.2 Informations d'une fiche client

- nom
- telephone
- email
- adresse
- notes
- solde ou balance selon l'usage du magasin

### 12.3 Regle telephone

Comme sur l'ecran de connexion, le numero attendu localement est base sur 8 chiffres du Burkina Faso, avec ajout du prefixe +226 par l'application lors de l'enregistrement.

### 12.4 Creer un client

1. Aller dans Clients.
2. Cliquer sur Nouveau client ou l'action d'ajout.
3. Remplir les champs utiles.
4. Enregistrer.

### 12.5 Modifier ou supprimer un client

Depuis la ligne du client :

- utiliser Modifier pour corriger les informations
- utiliser Supprimer avec prudence si la politique du magasin l'autorise

### 12.6 Historique client

L'application peut afficher les ventes rattachees au client pour aider a :

- retrouver un recu
- verifier la frequence d'achat
- suivre un credit ou un solde

## 13. Page Depenses

La page Depenses sert a enregistrer et analyser les sorties d'argent du magasin.

### 13.1 Trois types de depenses

#### Depense directe

Liee directement a un produit ou a un achat precis.

Exemples :

- achat d'un lot de produit
- matiere premiere pour une reference donnee

#### Depense indirecte

Depense a repartir entre plusieurs produits ou une categorie de produits.

Exemples :

- gaz
- energie d'une preparation
- charge partagee sur plusieurs articles

#### Depense operationnelle

Charge generale de fonctionnement.

Exemples :

- loyer
- salaires
- transport
- frais administratifs

### 13.2 Informations de saisie

Selon le type choisi, l'utilisateur peut renseigner :

- montant
- description
- date et heure
- produit direct
- quantite produit
- categorie de depense

### 13.3 Filtres disponibles

La page permet de filtrer les depenses par :

- aujourd'hui
- hier
- cette semaine
- ce mois
- cette annee
- plage personnalisee
- type de depense
- recherche texte

### 13.4 Onglets et analyses

La page peut proposer :

- une liste des depenses
- des graphiques par type ou categorie
- une repartition des montants sur la periode

### 13.5 Procedure standard de creation

1. Aller dans Depenses.
2. Ouvrir la fenetre d'ajout.
3. Choisir le type.
4. Renseigner le montant et la date.
5. Completer les champs metier requis.
6. Enregistrer.

### 13.6 Bon usage

- enregistrer la depense le plus tot possible
- choisir le bon type de depense
- utiliser une description explicite
- verifier la date avant validation

## 14. Page Stock

La page Stock, nommee Stock Signals dans l'application, sert a suivre les signaux de marge, de consommation et d'ecart sur le stock.

### 14.1 Finalite de cette page

Elle ne remplace pas seulement le stock theorique. Elle sert aussi a detecter :

- les signaux de surplus
- les signaux de manque
- les impacts des depenses directes et indirectes
- l'evolution de la marge sur certaines references

### 14.2 Ce que l'utilisateur peut y trouver

- les stocks actifs lies a des depenses ouvertes
- l'historique des signaux termines
- les filtres par periode
- les filtres par type de signal
- des indicateurs de marge

### 14.3 Filtres disponibles

- toute periode
- aujourd'hui
- hier
- semaine
- mois
- type surplus ou manque
- type de depense directe ou indirecte

### 14.4 Cas d'usage typiques

- verifier si une depense directe a bien ete absorbee par les ventes
- surveiller une baisse de marge sur un produit
- identifier un manque sur une reference suivie
- cloturer une periode d'observation en fixant une date de fin

## 15. Gestion des produits

La page Produits est surtout utilisee par les gestionnaires et administrateurs.

### 15.1 Fonctions principales

- creer un produit
- modifier un produit
- supprimer un produit
- charger les donnees locales puis les synchroniser
- gerer les variantes de prix
- definir le suivi de stock
- definir les seuils mini
- preparer des ajustements de stock

### 15.2 Formulaire de creation en plusieurs etapes

Le formulaire suit en general quatre etapes :

- Informations
- Prix
- Variantes
- Stock

### 15.3 Informations du produit

L'utilisateur peut definir :

- nom du produit
- SKU
- categorie
- unite
- image ou URL d'image

### 15.4 Donnees de prix

L'utilisateur peut renseigner :

- prix de vente
- prix de revient
- marge cible
- taux de taxe

La marge peut etre calculee automatiquement a partir du prix de vente et du prix de revient.

### 15.5 Variantes de prix

Un produit peut porter une ou plusieurs variantes, par exemple :

- petit
- moyen
- grand

Chaque variante possede son propre prix.

### 15.6 Parametres de stock

L'utilisateur peut fixer :

- le stock initial
- le stock minimum
- l'activation ou non du suivi de stock

### 15.7 Categories depuis la fiche produit

Si la categorie saisie n'existe pas, l'application peut la creer dans le flux de creation produit.

### 15.8 Images produit

Les images peuvent etre gerees localement puis synchronisees avec le backend selon la disponibilite reseau.

### 15.9 Regles pratiques

- ne pas laisser un produit vendable sans prix
- choisir une categorie claire pour faciliter la caisse
- activer le suivi de stock pour les references sensibles
- renseigner un stock minimum pour les produits critiques

## 16. Ajustements de stock

Les ajustements de stock permettent de corriger les ecarts entre le stock theorique et le stock reel.

### 16.1 Ce que l'ajustement peut contenir

- un produit concerne
- une quantite physique constatee
- un delta automatique ou deduit
- une raison globale
- une raison specifique par ligne

### 16.2 Quand faire un ajustement

- apres inventaire
- apres casse ou perte
- apres erreur de saisie
- apres regularisation manuelle

### 16.3 Recommandations

- toujours indiquer une raison claire
- eviter les ajustements approximatifs
- synchroniser rapidement apres correction

## 17. Page Categories

La page Categories peut etre utilisee lorsque le profil y a acces, ou indirectement depuis la creation produit.

### 17.1 Fonctions principales

- creer une categorie
- modifier une categorie
- supprimer une categorie
- masquer une categorie par defaut pour un magasin

### 17.2 Categories par defaut et categories magasin

Le systeme gere deux grandes familles :

- categories par defaut du systeme
- categories propres a un magasin

### 17.3 Regle importante

Une categorie par defaut ne peut pas etre supprimee de la meme facon par un utilisateur standard.

Dans certains cas, elle est simplement masquee pour le magasin courant.

## 18. Tableau de bord administrateur

Le tableau de bord administrateur sert a analyser les ventes et la performance sur une periode donnee.

### 18.1 Filtres de periode

L'admin peut definir :

- date de debut
- date de fin
- heure de debut
- heure de fin

Des raccourcis rapides existent, par exemple :

- Aujourd'hui
- Hier
- Cette semaine
- La semaine derniere
- Ce mois
- Le mois dernier
- Cette annee
- 7 derniers jours
- 30 derniers jours

### 18.2 Navigation temporelle

L'utilisateur peut :

- reculer d'une periode equivalente
- avancer d'une periode equivalente

L'application empeche normalement de naviguer au-dela de la date du jour.

### 18.3 Regroupement des donnees

Les graphiques peuvent etre regroupes par :

- minutes
- heures
- jours
- semaines
- mois

### 18.4 Types de graphique

Pour les ventes :

- ligne
- barre

Pour les produits :

- barre
- repartition type camembert selon la vue choisie

### 18.5 Principaux indicateurs affiches

- ventes brutes
- remboursements
- surplus
- manque
- ventes nettes
- marge brute
- evolution par rapport a la periode precedente

### 18.6 Interpretion rapide

- ventes brutes : total avant retrait des remboursements
- remboursements : montant rembourse sur la periode
- ventes nettes : ventes brutes moins remboursements
- surplus : excédent de caisse constate a la fermeture des shifts
- manque : deficit de caisse constate a la fermeture des shifts
- marge brute : difference entre vente nette et cout estime

### 18.7 Exports

Le tableau de bord propose des exports de rapports, notamment :

- export Excel ou CSV selon l'implementation
- export PDF

Avant export :

1. choisir la bonne periode
2. verifier le magasin concerne
3. verifier les heures si vous travaillez sur une plage specifique

## 19. Page Utilisateurs

La page Utilisateurs permet de gerer les comptes d'acces.

### 19.1 Informations d'un utilisateur

- nom d'utilisateur
- telephone
- email
- mot de passe
- role
- magasin principal
- PIN optionnel

### 19.2 Creer un utilisateur

1. Aller dans Utilisateurs.
2. Cliquer sur l'action d'ajout.
3. Renseigner les champs obligatoires.
4. Choisir le role.
5. Choisir le magasin.
6. Enregistrer.

### 19.3 Regles de controle

- le telephone doit contenir 8 chiffres saisis localement
- le nom d'utilisateur doit etre unique
- le telephone doit etre unique
- l'email doit etre unique si renseigne

### 19.4 Regles de role

Un admin standard ne doit pas creer d'autre admin dans le flux habituel.

Il cree principalement :

- des caissiers
- des gestionnaires

### 19.5 PIN utilisateur

Le PIN est optionnel.

Quand il est configure, il sert au deverrouillage rapide de la session.

## 20. Page Magasins

La page Magasins est utilisee pour administrer les boutiques, leur statut et leur abonnement.

### 20.1 Ce que l'on peut faire

- lister les magasins
- creer un magasin
- modifier un magasin
- affecter un admin a un magasin
- renouveler l'abonnement
- activer ou desactiver un magasin
- filtrer par statut ou abonnement

### 20.2 Informations visibles sur un magasin

- nom
- adresse
- statut actif ou inactif
- date de creation
- date de debut d'abonnement
- date de fin d'abonnement
- date du dernier paiement

### 20.3 Creation d'un magasin

Lors de la creation, le systeme peut aussi gerer l'affectation d'un administrateur :

- selection d'un admin existant
- ou creation d'un nouvel admin rattache au magasin

### 20.4 Renouvellement de l'abonnement

Le prix de reference actuellement applique est de 5000 FCFA par mois.

Lors d'un renouvellement :

- le nombre de mois est choisi
- le paiement est enregistre
- la date de fin d'abonnement est prolongee
- le magasin peut etre reactive si besoin

### 20.5 Desactivation automatique possible

Si la date de fin d'abonnement est depassee, le systeme peut desactiver :

- le magasin
- les utilisateurs lies a ce magasin

## 21. Tableau de bord super administrateur

Le tableau de bord super admin donne une vision reseau.

### 21.1 Ce qu'il permet de suivre

- nombre de magasins actifs et inactifs
- magasins proches de l'expiration
- magasins expires
- nombre d'utilisateurs par role
- chiffre d'affaires par magasin
- evolution des revenus globaux
- encaissements d'abonnement

### 21.2 Cas d'usage concret

- identifier les magasins a relancer
- surveiller les boutiques les plus performantes
- verifier la repartition des comptes par role
- suivre les encaissements abonnement du mois

## 22. Page Encaissements d'abonnement

Cette page est reservee au super administrateur.

### 22.1 Fonctions principales

- consulter l'historique des paiements d'abonnement
- filtrer par boutique
- filtrer par periode
- rechercher par boutique, note ou montant
- enregistrer un nouvel encaissement
- supprimer un encaissement
- exporter en CSV

### 22.2 Donnees d'un paiement

- boutique
- nombre de mois payes
- montant
- date de paiement
- note optionnelle

### 22.3 Ajouter un paiement

1. Ouvrir la fenetre d'ajout.
2. Choisir la boutique.
3. Saisir le nombre de mois.
4. Saisir le montant.
5. Renseigner la date de paiement.
6. Ajouter une note si necessaire.
7. Enregistrer.

### 22.4 Export CSV

L'export est utile pour :

- la comptabilite
- le suivi des encaissements
- le reporting periodique

## 23. Parametres

La page Parametres centralise les reglages utilisateur et magasin.

### 23.1 Notifications email

Le magasin peut activer ou desactiver les notifications sur :

- shifts
- stock
- depenses
- connexions
- remboursements

### 23.2 Solde manuel du magasin

Selon le profil, il est possible de definir un solde manuel pour le magasin.

Cette operation demande une saisie rigoureuse et, si possible, une note explicative.

### 23.3 Fond de roulement et benefice

L'administrateur peut renseigner :

- une valeur de fond de roulement
- une valeur de benefice
- des categories a rattacher a chaque logique de repartition

### 23.4 Logo magasin

Le logo du magasin peut etre configure pour apparaitre sur les recus et sur certains ecrans.

### 23.5 Impression

La page Parametres peut servir a :

- regler l'impression automatique
- configurer l'impression native Android
- preparer l'usage d'une imprimante Bluetooth

### 23.6 Version et mise a jour

L'application affiche sa version et peut proposer une verification ou une mise a jour selon le contexte PWA ou mobile.

## 24. Impression des recus et documents

### 24.1 Types d'impression

L'application sait utiliser :

- l'impression du navigateur
- l'impression native Android
- l'impression Bluetooth si elle est configuree

### 24.2 Quand l'impression se declenche

- apres une vente si l'auto-impression est activee
- depuis la page Recus pour une reimpression
- depuis le detail d'un shift selon l'ecran

### 24.3 Si l'impression native ne fonctionne pas

L'application peut basculer vers une impression web de secours.

### 24.4 Bonnes pratiques impression

- tester l'imprimante au debut du service
- verifier le papier avant les heures de pointe
- garder une solution de secours si le Bluetooth est instable

## 25. Ecran Abonnement expire ou magasin inactif

Si le magasin est desactive ou si l'abonnement est arrive a expiration, l'utilisateur standard voit un ecran de blocage.

### 25.1 Ce que cela signifie

- le magasin n'est plus autorise a utiliser l'application normalement
- un renouvellement ou une reactivation est necessaire

### 25.2 Action disponible

Un bouton de re-verification peut etre propose apres regularisation.

### 25.3 Qui n'est pas bloque

Le super administrateur conserve l'acces pour pouvoir regulariser la situation.

## 26. Checklist journaliere recommandee

### 26.1 Checklist caissier ouverture

1. Se connecter.
2. Verifier le statut reseau.
3. Ouvrir le shift.
4. Verifier l'imprimante.
5. Verifier les produits principaux visibles.

### 26.2 Checklist caissier fermeture

1. Verifier les ventes du jour.
2. Reimprimer si un client manque son recu.
3. Synchroniser.
4. Compter la caisse.
5. Fermer le shift.
6. Verifier la difference.

### 26.3 Checklist administrateur

1. Verifier le tableau de bord.
2. Verifier les remboursements du jour.
3. Verifier les depenses enregistrees.
4. Verifier les alertes de stock.
5. Synchroniser avant la fin de journee.

## 27. Incidents courants et resolution

### 27.1 Impossible de se connecter

Verifier :

- que le numero comporte 8 chiffres
- que vous saisissez uniquement les chiffres sans +226 dans le champ
- que le mot de passe est correct
- qu'une premiere connexion a bien deja ete faite en ligne sur l'appareil si necessaire

### 27.2 PIN refuse

Verifier :

- que vous utilisez le bon PIN
- que ce n'est pas le PIN d'un autre utilisateur
- que vous n'etes pas deja proche de la limite des 5 essais

### 27.3 Le serveur est inaccessible

Reflexes :

1. verifier la connexion internet
2. continuer a travailler si les donnees locales sont disponibles
3. surveiller le compteur d'operations en attente
4. relancer Synchroniser des que le serveur revient

### 27.4 Un recu n'est pas parti au serveur

Verifier :

- le badge d'attente de synchronisation
- le statut reseau
- la possibilite de forcer une synchronisation

### 27.5 L'impression ne sort pas

Verifier :

- l'etat de l'imprimante
- la connexion Bluetooth si Android
- les parametres d'impression
- le fallback impression navigateur

### 27.6 Le magasin semble bloque

Verifier :

- la date d'abonnement
- le statut actif du magasin
- la presence d'un paiement de renouvellement

## 28. Bonnes pratiques d'utilisation

- Utiliser un compte par personne.
- Ouvrir un shift avant d'encaisser.
- Associer les clients quand c'est utile pour le suivi.
- Enregistrer les depenses au bon moment et dans le bon type.
- Synchroniser regulierement au lieu d'attendre la fin de semaine.
- Verifier les recus rembourses pour garder une bonne tracabilite.
- Eviter les modifications de produits pendant un pic d'encaissement sans verification.
- Tester l'impression en debut de journee.

## 29. Glossaire rapide

### Shift ou service

Periode d'ouverture de caisse d'un utilisateur, du debut a la fermeture.

### Vente brute

Total encaisse avant retrait des remboursements.

### Vente nette

Vente brute moins remboursements.

### Surplus

Montant de caisse reel superieur au montant attendu.

### Manque

Montant de caisse reel inferieur au montant attendu.

### Depense directe

Depense rattachee a un produit precis.

### Depense indirecte

Depense a repartir sur plusieurs produits ou une categorie.

### Depense operationnelle

Depense de fonctionnement general du magasin.

### Synchronisation

Operation qui envoie les donnees locales vers le serveur et recharge les donnees a jour.

## 30. Conclusion

Ce manuel couvre les usages principaux de POS v2 pour l'exploitation quotidienne.

Pour une documentation encore plus operationnelle sur le terrain, la suite recommandee est :

- ajouter des captures d'ecran pour chaque page cle
- ajouter une version courte par role
- ajouter une procedure interne de cloture de caisse propre a votre organisation
- ajouter un guide de formation express pour les nouveaux caissiers