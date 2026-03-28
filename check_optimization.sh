#!/bin/bash

###############################################################################
# Script de vérification des optimisations pour POS v2
# Exécutez ce script après avoir appliqué les optimisations
###############################################################################

echo "======================================================================"
echo "   VÉRIFICATION DES OPTIMISATIONS - POS v2"
echo "======================================================================"
echo ""

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

success_count=0
fail_count=0
warning_count=0

check_success() {
    echo -e "${GREEN}✓${NC} $1"
    ((success_count++))
}

check_fail() {
    echo -e "${RED}✗${NC} $1"
    ((fail_count++))
}

check_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
    ((warning_count++))
}

echo "1. Vérification de PHP et extensions"
echo "--------------------------------------"

# Vérifier PHP
if command -v php &> /dev/null; then
    PHP_VERSION=$(php -v | head -n 1)
    check_success "PHP installé: $PHP_VERSION"
else
    check_fail "PHP n'est pas installé"
fi

# Vérifier APCu
if php -m | grep -q apcu; then
    check_success "APCu extension installée"
else
    check_warning "APCu non trouvé - le cache utilisera les fichiers (plus lent)"
fi

# Vérifier OPcache
if php -m | grep -q opcache; then
    check_success "OPcache extension installée"
else
    check_warning "OPcache non trouvé - les performances seront réduites"
fi

# Vérifier PDO MySQL
if php -m | grep -q pdo_mysql; then
    check_success "PDO MySQL extension installée"
else
    check_fail "PDO MySQL manquant - requis!"
fi

echo ""
echo "2. Vérification des fichiers d'optimisation"
echo "--------------------------------------"

# Vérifier que les fichiers créés existent
if [ -f "backend/migrations/001_performance_indexes.sql" ]; then
    check_success "Script d'optimisation SQL présent"
else
    check_fail "Script SQL manquant: backend/migrations/001_performance_indexes.sql"
fi

if [ -f "backend/cache.php" ]; then
    check_success "Système de cache présent"
else
    check_fail "Cache système manquant: backend/cache.php"
fi

if [ -f "backend/config.php" ]; then
    check_success "Fichier de configuration présent"
else
    check_fail "Configuration manquante: backend/config.php"
fi

if [ -f "PRODUCTION_DEPLOYMENT.md" ]; then
    check_success "Documentation de déploiement présente"
else
    check_warning "Documentation manquante: PRODUCTION_DEPLOYMENT.md"
fi

echo ""
echo "3. Vérification des permissions"
echo "--------------------------------------"

# Créer le dossier cache s'il n'existe pas
if [ ! -d "backend/cache" ]; then
    mkdir -p backend/cache
    check_success "Dossier cache créé"
fi

# Vérifier les permissions
if [ -w "backend/cache" ]; then
    check_success "Dossier cache accessible en écriture"
else
    check_fail "Dossier cache non accessible en écriture"
fi

# Créer le dossier logs s'il n'existe pas
if [ ! -d "backend/logs" ]; then
    mkdir -p backend/logs
    check_success "Dossier logs créé"
fi

if [ -w "backend/logs" ]; then
    check_success "Dossier logs accessible en écriture"
else
    check_fail "Dossier logs non accessible en écriture"
fi

echo ""
echo "4. Tests de connexion base de données"
echo "--------------------------------------"

# Test simple de connexion PHP
php -r "
try {
    require_once 'backend/config.php';
    echo 'OK: Connexion base de données réussie\n';
    exit(0);
} catch (Exception \$e) {
    echo 'ERREUR: ' . \$e->getMessage() . '\n';
    exit(1);
}
" && check_success "Connexion à la base de données" || check_fail "Connexion à la base de données échouée"

echo ""
echo "5. Configuration recommandée"
echo "--------------------------------------"

# Vérifier memory_limit
MEMORY_LIMIT=$(php -r "echo ini_get('memory_limit');")
echo "   Memory limit PHP: $MEMORY_LIMIT"
if [[ ${MEMORY_LIMIT%M} -ge 256 ]] 2>/dev/null; then
    check_success "Memory limit suffisant (>= 256M)"
else
    check_warning "Memory limit bas: $MEMORY_LIMIT (recommandé: 256M+)"
fi

# Vérifier max_execution_time
MAX_EXEC=$(php -r "echo ini_get('max_execution_time');")
echo "   Max execution time: ${MAX_EXEC}s"
if [ "$MAX_EXEC" -ge 60 ] 2>/dev/null || [ "$MAX_EXEC" -eq 0 ]; then
    check_success "Max execution time correct"
else
    check_warning "Max execution time bas: ${MAX_EXEC}s (recommandé: 60s+)"
fi

echo ""
echo "======================================================================"
echo "   RÉSUMÉ"
echo "======================================================================"
echo -e "${GREEN}Succès: $success_count${NC}"
echo -e "${YELLOW}Avertissements: $warning_count${NC}"
echo -e "${RED}Échecs: $fail_count${NC}"
echo ""

if [ $fail_count -eq 0 ]; then
    echo -e "${GREEN}✓ Système prêt pour la production!${NC}"
    echo ""
    echo "Prochaines étapes:"
    echo "1. Exécuter le script SQL: mysql -u user -p database < backend/migrations/001_performance_indexes.sql"
    echo "2. Configurer PHP selon PRODUCTION_DEPLOYMENT.md"
    echo "3. Exécuter des tests de charge"
    echo ""
    exit 0
else
    echo -e "${RED}✗ Des problèmes doivent être résolus avant la production${NC}"
    echo "Consultez PRODUCTION_DEPLOYMENT.md pour plus de détails"
    echo ""
    exit 1
fi
