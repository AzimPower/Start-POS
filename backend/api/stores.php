
<?php
// Afficher les erreurs PHP pour le debug
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);

// Headers CORS
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
header('Content-Type: application/json');
// ✅ Désactiver le cache pour garantir des données fraîches
header('Cache-Control: no-cache, no-store, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('Expires: 0');

// Gestion des requêtes OPTIONS (preflight)
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

require_once '../config.php';

$method = $_SERVER['REQUEST_METHOD'];

try {
    switch ($method) {
        case 'GET':
            // Retourne la liste des magasins en incluant le solde calculé
            // Par défaut on ne renvoie que les magasins actifs (active = 1)
            // Pour le super-admin ou debug vous pouvez ajouter `?include_inactive=1`
            $includeInactive = isset($_GET['include_inactive']) && $_GET['include_inactive'] === '1';
            if ($includeInactive) {
                $stmt = $pdo->query('SELECT * FROM stores');
                $stores = $stmt->fetchAll();
            } else {
                $stmt = $pdo->prepare('SELECT * FROM stores WHERE active = 1');
                $stmt->execute();
                $stores = $stmt->fetchAll();
            }

            // Pour chaque magasin, calculer le solde et les overrides manuels
            foreach ($stores as &$store) {
                try {
                    // Solde calculé (comme avant)
                    $ovStmt = $pdo->prepare('SELECT * FROM store_balance_overrides WHERE storeId = ? ORDER BY appliedAt DESC, createdAt DESC LIMIT 1');
                    $ovStmt->execute([$store['id']]);
                    $override = $ovStmt->fetch();
                    $base = 0.0;
                    $appliedAt = null;
                    if ($override) {
                        $base = (float)$override['value'];
                        $appliedAt = $override['appliedAt'] ? (int)$override['appliedAt'] : null;
                    }
                    // Load store-specific balance settings (which may list category IDs allocated to fond/benefice)
                    $settingsStmt = $pdo->prepare('SELECT * FROM store_balance_settings WHERE storeId = ? LIMIT 1');
                    $settingsStmt->execute([$store['id']]);
                    $settings = $settingsStmt->fetch();
                    $fondCats = [];
                    $benefCats = [];
                    if ($settings) {
                        $fondCats = isset($settings['fondCategories']) && $settings['fondCategories'] ? json_decode($settings['fondCategories'], true) : [];
                        $benefCats = isset($settings['beneficeCategories']) && $settings['beneficeCategories'] ? json_decode($settings['beneficeCategories'], true) : [];
                        if (!is_array($fondCats)) $fondCats = [];
                        if (!is_array($benefCats)) $benefCats = [];
                        // expose configured categories to the API consumer
                        $store['fondCategories'] = $fondCats;
                        $store['beneficeCategories'] = $benefCats;
                    }
                    // Compute revenue and COGS by aggregating sale_items joined with products so
                    // margins are calculated per product (price - costPrice).
                    if ($appliedAt) {
                        // total revenue (excluding tax) since appliedAt - only from closed shifts
                        $revStmt = $pdo->prepare('SELECT IFNULL(SUM(si.price * si.quantity),0) FROM sales s JOIN sale_items si ON s.id = si.saleId LEFT JOIN shifts sh ON s.shiftId = sh.id WHERE s.storeId = ? AND s.refunded = 0 AND s.createdAt >= ? AND (s.shiftId IS NULL OR sh.status = "closed")');
                        $revStmt->execute([$store['id'], $appliedAt]);
                        $salesRevenue = (float)$revStmt->fetchColumn();

                        // cost of goods sold since appliedAt - only from closed shifts
                        // Compute COGS from targetMargin when available:
                        // item_cogs = si.price * si.quantity * (1 - margin/100)
                        // margin priority: p.targetMargin (if not null) else fallback to derived margin from costPrice
                        $cogsStmt = $pdo->prepare(
                            'SELECT IFNULL(SUM(
                                CASE
                                    WHEN p.targetMargin IS NOT NULL THEN (si.price * si.quantity * (1 - (p.targetMargin/100)))
                                    WHEN p.costPrice IS NOT NULL THEN (p.costPrice * si.quantity)
                                    ELSE 0
                                END
                            ),0) FROM sales s JOIN sale_items si ON s.id = si.saleId LEFT JOIN products p ON p.id = si.productId LEFT JOIN shifts sh ON s.shiftId = sh.id WHERE s.storeId = ? AND s.refunded = 0 AND s.createdAt >= ? AND (s.shiftId IS NULL OR sh.status = "closed")'
                        );
                        $cogsStmt->execute([$store['id'], $appliedAt]);
                        $cogs = (float)$cogsStmt->fetchColumn();

                        $expStmt = $pdo->prepare('SELECT IFNULL(SUM(amount),0) as totalExpenses FROM expenses WHERE storeId = ? AND createdAt >= ?');
                        $expStmt->execute([$store['id'], $appliedAt]);
                        $expenses = (float)$expStmt->fetchColumn();
                        $expAdvStmt = $pdo->prepare('SELECT IFNULL(SUM(amount),0) as totalExpensesAdv FROM expenses_advanced WHERE storeId = ? AND date >= ?');
                        $expAdvStmt->execute([$store['id'], $appliedAt]);
                        $expensesAdv = (float)$expAdvStmt->fetchColumn();
                        $expenses += $expensesAdv;
                        $expDirectStmt = $pdo->prepare("SELECT IFNULL(SUM(amount),0) FROM expenses_advanced WHERE storeId = ? AND date >= ? AND type = 'direct'");
                        $expDirectStmt->execute([$store['id'], $appliedAt]);
                        $expensesDirect = (float)$expDirectStmt->fetchColumn();
                        // indirect expenses split by configured categories
                        $expensesIndirectFond = 0.0;
                        $expensesIndirectBenef = 0.0;
                        if (!empty($fondCats)) {
                            $ph = implode(',', array_fill(0, count($fondCats), '?'));
                            $sql = "SELECT IFNULL(SUM(amount),0) FROM expenses_advanced WHERE storeId = ? AND date >= ? AND type = 'indirect' AND categoryId IN ($ph)";
                            $params = array_merge([$store['id'], $appliedAt], $fondCats);
                            $stmt2 = $pdo->prepare($sql);
                            $stmt2->execute($params);
                            $expensesIndirectFond = (float)$stmt2->fetchColumn();
                        }
                        if (!empty($benefCats)) {
                            $ph = implode(',', array_fill(0, count($benefCats), '?'));
                            $sql = "SELECT IFNULL(SUM(amount),0) FROM expenses_advanced WHERE storeId = ? AND date >= ? AND type = 'indirect' AND categoryId IN ($ph)";
                            $params = array_merge([$store['id'], $appliedAt], $benefCats);
                            $stmt3 = $pdo->prepare($sql);
                            $stmt3->execute($params);
                            $expensesIndirectBenef = (float)$stmt3->fetchColumn();
                        }
                        $expensesIndirect = $expensesIndirectFond + $expensesIndirectBenef;
                        $expOpStmt = $pdo->prepare("SELECT IFNULL(SUM(amount),0) FROM expenses_advanced WHERE storeId = ? AND date >= ? AND type = 'operational'");
                        $expOpStmt->execute([$store['id'], $appliedAt]);
                        $expensesOperational = (float)$expOpStmt->fetchColumn();
                    } else {
                        $revStmt = $pdo->prepare('SELECT IFNULL(SUM(si.price * si.quantity),0) FROM sales s JOIN sale_items si ON s.id = si.saleId LEFT JOIN shifts sh ON s.shiftId = sh.id WHERE s.storeId = ? AND s.refunded = 0 AND (s.shiftId IS NULL OR sh.status = "closed")');
                        $revStmt->execute([$store['id']]);
                        $salesRevenue = (float)$revStmt->fetchColumn();

                        $cogsStmt = $pdo->prepare(
                            'SELECT IFNULL(SUM(
                                CASE
                                    WHEN p.targetMargin IS NOT NULL THEN (si.price * si.quantity * (1 - (p.targetMargin/100)))
                                    WHEN p.costPrice IS NOT NULL THEN (p.costPrice * si.quantity)
                                    ELSE 0
                                END
                            ),0) FROM sales s JOIN sale_items si ON s.id = si.saleId LEFT JOIN products p ON p.id = si.productId LEFT JOIN shifts sh ON s.shiftId = sh.id WHERE s.storeId = ? AND s.refunded = 0 AND (s.shiftId IS NULL OR sh.status = "closed")'
                        );
                        $cogsStmt->execute([$store['id']]);
                        $cogs = (float)$cogsStmt->fetchColumn();

                        $expStmt = $pdo->prepare('SELECT IFNULL(SUM(amount),0) as totalExpenses FROM expenses WHERE storeId = ?');
                        $expStmt->execute([$store['id']]);
                        $expenses = (float)$expStmt->fetchColumn();
                        $expAdvStmt = $pdo->prepare('SELECT IFNULL(SUM(amount),0) as totalExpensesAdv FROM expenses_advanced WHERE storeId = ?');
                        $expAdvStmt->execute([$store['id']]);
                        $expensesAdv = (float)$expAdvStmt->fetchColumn();
                        $expenses += $expensesAdv;
                        $expDirectStmt = $pdo->prepare("SELECT IFNULL(SUM(amount),0) FROM expenses_advanced WHERE storeId = ? AND type = 'direct'");
                        $expDirectStmt->execute([$store['id']]);
                        $expensesDirect = (float)$expDirectStmt->fetchColumn();
                        // indirect expenses split by configured categories (no date filter)
                        $expensesIndirectFond = 0.0;
                        $expensesIndirectBenef = 0.0;
                        if (!empty($fondCats)) {
                            $ph = implode(',', array_fill(0, count($fondCats), '?'));
                            $sql = "SELECT IFNULL(SUM(amount),0) FROM expenses_advanced WHERE storeId = ? AND type = 'indirect' AND categoryId IN ($ph)";
                            $params = array_merge([$store['id']], $fondCats);
                            $stmt2 = $pdo->prepare($sql);
                            $stmt2->execute($params);
                            $expensesIndirectFond = (float)$stmt2->fetchColumn();
                        }
                        if (!empty($benefCats)) {
                            $ph = implode(',', array_fill(0, count($benefCats), '?'));
                            $sql = "SELECT IFNULL(SUM(amount),0) FROM expenses_advanced WHERE storeId = ? AND type = 'indirect' AND categoryId IN ($ph)";
                            $params = array_merge([$store['id']], $benefCats);
                            $stmt3 = $pdo->prepare($sql);
                            $stmt3->execute($params);
                            $expensesIndirectBenef = (float)$stmt3->fetchColumn();
                        }
                        $expensesIndirect = $expensesIndirectFond + $expensesIndirectBenef;
                        $expOpStmt = $pdo->prepare("SELECT IFNULL(SUM(amount),0) FROM expenses_advanced WHERE storeId = ? AND type = 'operational'");
                        $expOpStmt->execute([$store['id']]);
                        $expensesOperational = (float)$expOpStmt->fetchColumn();
                    }

                    // Solde remains revenue - expenses (base override + revenue since appliedAt)
                    $solde = round($base + $salesRevenue - $expenses, 2);
                    // Fond de roulement: amount tied to goods (COGS) minus direct expenses and indirect expenses allocated to fond
                    $fond_roulement = round($cogs - $expensesDirect - ($expensesIndirectFond ?? 0), 2);
                    // Marge brute: gross margin (revenue - COGS) minus indirect expenses allocated to benefice
                    $marge_brute = ($salesRevenue - $cogs) - ($expensesIndirectBenef ?? ($expensesIndirect ?? 0));
                    // Benefice: gross margin after operational expenses
                    $benefice = round($marge_brute - $expensesOperational, 2);
                    // Chercher override fond_roulement
                    $fondOverride = $pdo->prepare("SELECT * FROM store_indicator_overrides WHERE storeId = ? AND indicator = 'fond_roulement' ORDER BY appliedAt DESC, createdAt DESC LIMIT 1");
                    $fondOverride->execute([$store['id']]);
                    $fondRow = $fondOverride->fetch();
                    if ($fondRow) {
                        $store['fond_roulement_manual'] = (float)$fondRow['value'];
                        $store['fond_roulement_manual_appliedAt'] = $fondRow['appliedAt'] ? (int)$fondRow['appliedAt'] : null;
                        $store['fond_roulement_manual_userId'] = $fondRow['userId'] ?? null;
                        $store['fond_roulement_manual_note'] = $fondRow['note'] ?? null;
                    } else {
                        $store['fond_roulement_manual'] = null;
                    }
                    // Chercher override benefice
                    $benOverride = $pdo->prepare("SELECT * FROM store_indicator_overrides WHERE storeId = ? AND indicator = 'benefice' ORDER BY appliedAt DESC, createdAt DESC LIMIT 1");
                    $benOverride->execute([$store['id']]);
                    $benRow = $benOverride->fetch();
                    if ($benRow) {
                        $store['benefice_manual'] = (float)$benRow['value'];
                        $store['benefice_manual_appliedAt'] = $benRow['appliedAt'] ? (int)$benRow['appliedAt'] : null;
                        $store['benefice_manual_userId'] = $benRow['userId'] ?? null;
                        $store['benefice_manual_note'] = $benRow['note'] ?? null;
                    } else {
                        $store['benefice_manual'] = null;
                    }
                    // Apply manual overrides for fond_roulement and benefice similarly to solde:
                    // If an override exists and has an appliedAt timestamp, compute the delta
                    // of transactions after that timestamp and add to the override base.
                    // Otherwise, expose the computed values.
                    // Fond de roulement override handling
                    if ($fondRow) {
                        $fondBase = (float)$fondRow['value'];
                        $fondAppliedAt = $fondRow['appliedAt'] ? (int)$fondRow['appliedAt'] : null;
                        if ($fondAppliedAt) {
                            // Compute COGS since appliedAt using targetMargin per product - only from closed shifts
                            $cogsSinceStmt = $pdo->prepare('SELECT IFNULL(SUM(
                                CASE
                                    WHEN p.targetMargin IS NOT NULL THEN (si.price * si.quantity * (1 - (p.targetMargin/100)))
                                    WHEN p.costPrice IS NOT NULL THEN (p.costPrice * si.quantity)
                                    ELSE 0
                                END
                            ),0) FROM sales s JOIN sale_items si ON s.id = si.saleId LEFT JOIN products p ON p.id = si.productId LEFT JOIN shifts sh ON s.shiftId = sh.id WHERE s.storeId = ? AND s.refunded = 0 AND s.createdAt >= ? AND (s.shiftId IS NULL OR sh.status = "closed")');
                            $cogsSinceStmt->execute([$store['id'], $fondAppliedAt]);
                            $cogsSince = (float)$cogsSinceStmt->fetchColumn();
                            $dStmt = $pdo->prepare("SELECT IFNULL(SUM(amount),0) FROM expenses_advanced WHERE storeId = ? AND date >= ? AND type = 'direct'");
                            $dStmt->execute([$store['id'], $fondAppliedAt]);
                            $expensesDirectSince = (float)$dStmt->fetchColumn();
                            // indirect expenses for fond since appliedAt
                            $expensesIndirectFondSince = 0.0;
                            if (!empty($fondCats)) {
                                $ph = implode(',', array_fill(0, count($fondCats), '?'));
                                $sql = "SELECT IFNULL(SUM(amount),0) FROM expenses_advanced WHERE storeId = ? AND date >= ? AND type = 'indirect' AND categoryId IN ($ph)";
                                $params = array_merge([$store['id'], $fondAppliedAt], $fondCats);
                                $stmtInd = $pdo->prepare($sql);
                                $stmtInd->execute($params);
                                $expensesIndirectFondSince = (float)$stmtInd->fetchColumn();
                            }
                            $store['fond_roulement'] = round($fondBase + $cogsSince - $expensesDirectSince - $expensesIndirectFondSince, 2);
                        } else {
                            // No appliedAt -> treat override value as base and include all transactions from closed shifts
                            $cogsAllStmt = $pdo->prepare('SELECT IFNULL(SUM(
                                CASE
                                    WHEN p.targetMargin IS NOT NULL THEN (si.price * si.quantity * (1 - (p.targetMargin/100)))
                                    WHEN p.costPrice IS NOT NULL THEN (p.costPrice * si.quantity)
                                    ELSE 0
                                END
                            ),0) FROM sales s JOIN sale_items si ON s.id = si.saleId LEFT JOIN products p ON p.id = si.productId LEFT JOIN shifts sh ON s.shiftId = sh.id WHERE s.storeId = ? AND s.refunded = 0 AND (s.shiftId IS NULL OR sh.status = "closed")');
                            $cogsAllStmt->execute([$store['id']]);
                            $cogsAll = (float)$cogsAllStmt->fetchColumn();
                            $dStmt = $pdo->prepare("SELECT IFNULL(SUM(amount),0) FROM expenses_advanced WHERE storeId = ? AND type = 'direct'");
                            $dStmt->execute([$store['id']]);
                            $expensesDirectAll = (float)$dStmt->fetchColumn();
                            $expensesIndirectFondAll = 0.0;
                            if (!empty($fondCats)) {
                                $ph = implode(',', array_fill(0, count($fondCats), '?'));
                                $sql = "SELECT IFNULL(SUM(amount),0) FROM expenses_advanced WHERE storeId = ? AND type = 'indirect' AND categoryId IN ($ph)";
                                $params = array_merge([$store['id']], $fondCats);
                                $stmtInd = $pdo->prepare($sql);
                                $stmtInd->execute($params);
                                $expensesIndirectFondAll = (float)$stmtInd->fetchColumn();
                            }
                            $store['fond_roulement'] = round($fondBase + $cogsAll - $expensesDirectAll - $expensesIndirectFondAll, 2);
                        }
                        $store['fond_roulement_manual'] = (float)$fondRow['value'];
                        $store['fond_roulement_manual_appliedAt'] = $fondRow['appliedAt'] ? (int)$fondRow['appliedAt'] : null;
                        $store['fond_roulement_manual_userId'] = $fondRow['userId'] ?? null;
                        $store['fond_roulement_manual_note'] = $fondRow['note'] ?? null;
                    } else {
                        $store['fond_roulement'] = $fond_roulement;
                        $store['fond_roulement_manual'] = null;
                    }

                    // Benefice override handling
                    if ($benRow) {
                        $benBase = (float)$benRow['value'];
                        $benAppliedAt = $benRow['appliedAt'] ? (int)$benRow['appliedAt'] : null;
                        if ($benAppliedAt) {
                            // revenue since appliedAt - only from closed shifts
                            $revSinceStmt = $pdo->prepare('SELECT IFNULL(SUM(si.price * si.quantity),0) FROM sales s JOIN sale_items si ON s.id = si.saleId LEFT JOIN shifts sh ON s.shiftId = sh.id WHERE s.storeId = ? AND s.refunded = 0 AND s.createdAt >= ? AND (s.shiftId IS NULL OR sh.status = "closed")');
                            $revSinceStmt->execute([$store['id'], $benAppliedAt]);
                            $salesSince = (float)$revSinceStmt->fetchColumn();
                            // cogs since appliedAt - only from closed shifts
                            $cogsSinceStmt = $pdo->prepare('SELECT IFNULL(SUM(
                                CASE
                                    WHEN p.targetMargin IS NOT NULL THEN (si.price * si.quantity * (1 - (p.targetMargin/100)))
                                    WHEN p.costPrice IS NOT NULL THEN (p.costPrice * si.quantity)
                                    ELSE 0
                                END
                            ),0) FROM sales s JOIN sale_items si ON s.id = si.saleId LEFT JOIN products p ON p.id = si.productId LEFT JOIN shifts sh ON s.shiftId = sh.id WHERE s.storeId = ? AND s.refunded = 0 AND s.createdAt >= ? AND (s.shiftId IS NULL OR sh.status = "closed")');
                            $cogsSinceStmt->execute([$store['id'], $benAppliedAt]);
                            $cogsSince = (float)$cogsSinceStmt->fetchColumn();
                            $dStmt = $pdo->prepare("SELECT IFNULL(SUM(amount),0) FROM expenses_advanced WHERE storeId = ? AND date >= ? AND type = 'direct'");
                            $dStmt->execute([$store['id'], $benAppliedAt]);
                            $expensesDirectSince = (float)$dStmt->fetchColumn();
                            // indirect expenses since appliedAt split by configured categories
                            $expensesIndirectFondSince = 0.0;
                            $expensesIndirectBenefSince = 0.0;
                            if (!empty($fondCats)) {
                                $ph = implode(',', array_fill(0, count($fondCats), '?'));
                                $sql = "SELECT IFNULL(SUM(amount),0) FROM expenses_advanced WHERE storeId = ? AND date >= ? AND type = 'indirect' AND categoryId IN ($ph)";
                                $params = array_merge([$store['id'], $benAppliedAt], $fondCats);
                                $stmt2 = $pdo->prepare($sql);
                                $stmt2->execute($params);
                                $expensesIndirectFondSince = (float)$stmt2->fetchColumn();
                            }
                            if (!empty($benefCats)) {
                                $ph = implode(',', array_fill(0, count($benefCats), '?'));
                                $sql = "SELECT IFNULL(SUM(amount),0) FROM expenses_advanced WHERE storeId = ? AND date >= ? AND type = 'indirect' AND categoryId IN ($ph)";
                                $params = array_merge([$store['id'], $benAppliedAt], $benefCats);
                                $stmt3 = $pdo->prepare($sql);
                                $stmt3->execute($params);
                                $expensesIndirectBenefSince = (float)$stmt3->fetchColumn();
                            }
                            $expensesIndirectSince = $expensesIndirectFondSince + $expensesIndirectBenefSince;
                            $opStmt = $pdo->prepare("SELECT IFNULL(SUM(amount),0) FROM expenses_advanced WHERE storeId = ? AND date >= ? AND type = 'operational'");
                            $opStmt->execute([$store['id'], $benAppliedAt]);
                            $expensesOperationalSince = (float)$opStmt->fetchColumn();
                            $margeSince = ($salesSince - $cogsSince) - ($expensesIndirectBenefSince ?? 0);
                            $store['benefice'] = round($benBase + $margeSince - $expensesOperationalSince, 2);
                        } else {
                            // No appliedAt -> treat override value as base and include all transactions from closed shifts
                            $revAllStmt = $pdo->prepare('SELECT IFNULL(SUM(si.price * si.quantity),0) FROM sales s JOIN sale_items si ON s.id = si.saleId LEFT JOIN shifts sh ON s.shiftId = sh.id WHERE s.storeId = ? AND s.refunded = 0 AND (s.shiftId IS NULL OR sh.status = "closed")');
                            $revAllStmt->execute([$store['id']]);
                            $salesAll = (float)$revAllStmt->fetchColumn();
                            $cogsAllStmt = $pdo->prepare('SELECT IFNULL(SUM(
                                CASE
                                    WHEN p.targetMargin IS NOT NULL THEN (si.price * si.quantity * (1 - (p.targetMargin/100)))
                                    WHEN p.costPrice IS NOT NULL THEN (p.costPrice * si.quantity)
                                    ELSE 0
                                END
                            ),0) FROM sales s JOIN sale_items si ON s.id = si.saleId LEFT JOIN products p ON p.id = si.productId LEFT JOIN shifts sh ON s.shiftId = sh.id WHERE s.storeId = ? AND s.refunded = 0 AND (s.shiftId IS NULL OR sh.status = "closed")');
                            $cogsAllStmt->execute([$store['id']]);
                            $cogsAll = (float)$cogsAllStmt->fetchColumn();
                            $dStmt = $pdo->prepare("SELECT IFNULL(SUM(amount),0) FROM expenses_advanced WHERE storeId = ? AND type = 'direct'");
                            $dStmt->execute([$store['id']]);
                            $expensesDirectAll = (float)$dStmt->fetchColumn();
                            // indirect expenses (no date) split by configured categories
                            $expensesIndirectFondAll = 0.0;
                            $expensesIndirectBenefAll = 0.0;
                            if (!empty($fondCats)) {
                                $ph = implode(',', array_fill(0, count($fondCats), '?'));
                                $sql = "SELECT IFNULL(SUM(amount),0) FROM expenses_advanced WHERE storeId = ? AND type = 'indirect' AND categoryId IN ($ph)";
                                $params = array_merge([$store['id']], $fondCats);
                                $stmt2 = $pdo->prepare($sql);
                                $stmt2->execute($params);
                                $expensesIndirectFondAll = (float)$stmt2->fetchColumn();
                            }
                            if (!empty($benefCats)) {
                                $ph = implode(',', array_fill(0, count($benefCats), '?'));
                                $sql = "SELECT IFNULL(SUM(amount),0) FROM expenses_advanced WHERE storeId = ? AND type = 'indirect' AND categoryId IN ($ph)";
                                $params = array_merge([$store['id']], $benefCats);
                                $stmt3 = $pdo->prepare($sql);
                                $stmt3->execute($params);
                                $expensesIndirectBenefAll = (float)$stmt3->fetchColumn();
                            }
                            $expensesIndirectAll = $expensesIndirectFondAll + $expensesIndirectBenefAll;
                            $opStmt = $pdo->prepare("SELECT IFNULL(SUM(amount),0) FROM expenses_advanced WHERE storeId = ? AND type = 'operational'");
                            $opStmt->execute([$store['id']]);
                            $expensesOperationalAll = (float)$opStmt->fetchColumn();
                            $margeAll = ($salesAll - $cogsAll) - ($expensesIndirectBenefAll ?? 0);
                            $store['benefice'] = round($benBase + $margeAll - $expensesOperationalAll, 2);
                        }
                        $store['benefice_manual'] = (float)$benRow['value'];
                        $store['benefice_manual_appliedAt'] = $benRow['appliedAt'] ? (int)$benRow['appliedAt'] : null;
                        $store['benefice_manual_userId'] = $benRow['userId'] ?? null;
                        $store['benefice_manual_note'] = $benRow['note'] ?? null;
                    } else {
                        $store['benefice'] = $benefice;
                        $store['benefice_manual'] = null;
                    }
                    $store['solde'] = $solde;
                    if ($override) {
                        $store['solde_manual'] = (float)$override['value'];
                        $store['solde_manual_appliedAt'] = $override['appliedAt'] ? (int)$override['appliedAt'] : null;
                        $store['solde_manual_userId'] = $override['userId'] ?? null;
                        $store['solde_manual_note'] = $override['note'] ?? null;
                    } else {
                        $store['solde_manual'] = null;
                    }
                } catch (Exception $e) {
                    error_log('Erreur calcul solde magasin '.$store['id'].': '.$e->getMessage());
                }
            }

            echo json_encode($stores);
            break;
        case 'POST':
            $data = json_decode(file_get_contents('php://input'), true);
            // Si l'action est de définir un solde manuel
            if ($data && isset($data['action'])) {
                if ($data['action'] === 'set_balance') {
                    // données attendues: storeId, value, appliedAt (optionnel), userId (optionnel), note (optionnel)
                    if (!isset($data['storeId']) || !isset($data['value'])) {
                        http_response_code(400);
                        echo json_encode(['success' => false, 'error' => 'storeId et value requis']);
                        exit;
                    }
                    $id = $data['id'] ?? uniqid();
                    $storeId = $data['storeId'];
                    $value = number_format((float)$data['value'], 2, '.', '');
                    $appliedAt = isset($data['appliedAt']) ? (int)$data['appliedAt'] : (int)(microtime(true)*1000);
                    $userId = $data['userId'] ?? null;
                    $note = $data['note'] ?? null;
                    try {
                        $sql = 'INSERT INTO store_balance_overrides (id, storeId, value, appliedAt, userId, note, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)';
                        $stmt = $pdo->prepare($sql);
                        $stmt->execute([$id, $storeId, $value, $appliedAt, $userId, $note, (int)(microtime(true)*1000)]);
                        echo json_encode(['success' => true, 'id' => $id]);
                    } catch (PDOException $ex) {
                        http_response_code(500);
                        echo json_encode(['success' => false, 'error' => $ex->getMessage()]);
                    }
                    exit;
                } else if ($data['action'] === 'set_fond_roulement' || $data['action'] === 'set_benefice') {
                    // données attendues: storeId, value, appliedAt (optionnel), userId (optionnel), note (optionnel)
                    if (!isset($data['storeId']) || !isset($data['value'])) {
                        http_response_code(400);
                        echo json_encode(['success' => false, 'error' => 'storeId et value requis']);
                        exit;
                    }
                    $id = $data['id'] ?? uniqid();
                    $storeId = $data['storeId'];
                    $indicator = $data['action'] === 'set_fond_roulement' ? 'fond_roulement' : 'benefice';
                    $value = number_format((float)$data['value'], 2, '.', '');
                    $appliedAt = isset($data['appliedAt']) ? (int)$data['appliedAt'] : (int)(microtime(true)*1000);
                    $userId = $data['userId'] ?? null;
                    $note = $data['note'] ?? null;
                    try {
                        $sql = 'INSERT INTO store_indicator_overrides (id, storeId, indicator, value, appliedAt, userId, note, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)';
                        $stmt = $pdo->prepare($sql);
                        $stmt->execute([$id, $storeId, $indicator, $value, $appliedAt, $userId, $note, (int)(microtime(true)*1000)]);
                        echo json_encode(['success' => true, 'id' => $id]);
                    } catch (PDOException $ex) {
                        http_response_code(500);
                        echo json_encode(['success' => false, 'error' => $ex->getMessage()]);
                    }
                    exit;
                } else if ($data['action'] === 'set_balance_settings') {
                    // données attendues: storeId, fondCategories (array of ids), beneficeCategories (array of ids)
                    if (!isset($data['storeId'])) {
                        http_response_code(400);
                        echo json_encode(['success' => false, 'error' => 'storeId requis']);
                        exit;
                    }
                    $storeId = $data['storeId'];
                    $fondCats = isset($data['fondCategories']) && is_array($data['fondCategories']) ? json_encode($data['fondCategories']) : null;
                    $benCats = isset($data['beneficeCategories']) && is_array($data['beneficeCategories']) ? json_encode($data['beneficeCategories']) : null;
                    try {
                        // upsert logic: if exists update else insert
                        $check = $pdo->prepare('SELECT COUNT(*) FROM store_balance_settings WHERE storeId = ?');
                        $check->execute([$storeId]);
                        $cnt = (int)$check->fetchColumn();
                        if ($cnt === 0) {
                            $id = $data['id'] ?? uniqid();
                            $ins = $pdo->prepare('INSERT INTO store_balance_settings (id, storeId, fondCategories, beneficeCategories, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)');
                            $ins->execute([$id, $storeId, $fondCats, $benCats, (int)(microtime(true)*1000), (int)(microtime(true)*1000)]);
                            echo json_encode(['success' => true, 'id' => $id]);
                        } else {
                            $upd = $pdo->prepare('UPDATE store_balance_settings SET fondCategories = ?, beneficeCategories = ?, updatedAt = ? WHERE storeId = ?');
                            $upd->execute([$fondCats, $benCats, (int)(microtime(true)*1000), $storeId]);
                            echo json_encode(['success' => true]);
                        }
                    } catch (PDOException $ex) {
                        http_response_code(500);
                        echo json_encode(['success' => false, 'error' => $ex->getMessage()]);
                    }
                    exit;
                }
            }

            // Sinon: création classique de magasin
                $sql = 'INSERT INTO stores (id, name, address, logo, active, createdAt, subscriptionStart, subscriptionEnd, lastPayment) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)';
                $stmt = $pdo->prepare($sql);
                $id = $data['id'] ?? uniqid();
                $stmt->execute([
                    $id,
                    $data['name'],
                    $data['address'],
                    $data['logo'] ?? null,
                    $data['active'] ?? true,
                    $data['createdAt'] ?? time()*1000,
                    $data['subscriptionStart'] ?? null,
                    $data['subscriptionEnd'] ?? null,
                    $data['lastPayment'] ?? null
                ]);

                // Optionally link or create an admin for this store
                if (!empty($data['adminId']) || !empty($data['admin'])) {
                    try {
                        // If adminId provided, just create mapping
                        if (!empty($data['adminId'])) {
                            $linkId = uniqid();
                            $ins = $pdo->prepare('INSERT INTO user_stores (id, userId, storeId) VALUES (?, ?, ?)');
                            $ins->execute([$linkId, $data['adminId'], $id]);
                            // Optionally update users.storeId for backward compatibility if empty
                            $upd = $pdo->prepare('UPDATE users SET storeId = ? WHERE id = ? AND (storeId IS NULL OR storeId = "")');
                            $upd->execute([$id, $data['adminId']]);
                        } elseif (!empty($data['admin']) && is_array($data['admin'])) {
                            // admin object contains username, phone, password, role (optional)
                            $admin = $data['admin'];
                            $uid = $admin['id'] ?? uniqid();
                            $insertUser = $pdo->prepare('INSERT INTO users (id, username, phone, password, pin, role, storeId, active, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
                            $insertUser->execute([
                                $uid,
                                $admin['username'] ?? $admin['phone'] ?? 'admin',
                                $admin['phone'] ?? null,
                                $admin['password'] ?? null,
                                $admin['pin'] ?? null,
                                $admin['role'] ?? 'admin',
                                $id,
                                $admin['active'] ?? true,
                                $admin['createdAt'] ?? time()*1000
                            ]);
                            $linkId = uniqid();
                            $ins = $pdo->prepare('INSERT INTO user_stores (id, userId, storeId) VALUES (?, ?, ?)');
                            $ins->execute([$linkId, $uid, $id]);
                        }
                    } catch (Exception $e) {
                        // don't fail store creation for mapping errors
                        error_log('store admin link/create error: '.$e->getMessage());
                    }
                }

                echo json_encode(['success' => true, 'id' => $id]);
            break;
        case 'PUT':
            $data = json_decode(file_get_contents('php://input'), true);
            if (!$data || !isset($data['id'])) {
                echo json_encode(['success' => false, 'error' => 'ID manquant ou données invalides']);
                exit;
            }
            $sql = 'UPDATE stores SET name=?, address=?, logo=?, active=?, createdAt=?, subscriptionStart=?, subscriptionEnd=?, lastPayment=? WHERE id=?';
            $stmt = $pdo->prepare($sql);
            $stmt->execute([
                $data['name'],
                $data['address'],
                $data['logo'] ?? null,
                $data['active'],
                $data['createdAt'],
                $data['subscriptionStart'],
                $data['subscriptionEnd'],
                $data['lastPayment'],
                $data['id']
            ]);

            // If adminId provided during edit, create mapping to this store
            if (!empty($data['adminId'])) {
                try {
                    // avoid duplicate mapping
                    $check = $pdo->prepare('SELECT COUNT(*) FROM user_stores WHERE userId = ? AND storeId = ?');
                    $check->execute([$data['adminId'], $data['id']]);
                    $cnt = (int)$check->fetchColumn();
                    if ($cnt === 0) {
                        $linkId = uniqid();
                        $ins = $pdo->prepare('INSERT INTO user_stores (id, userId, storeId) VALUES (?, ?, ?)');
                        $ins->execute([$linkId, $data['adminId'], $data['id']]);
                    }
                    // Update users.storeId for backward compatibility if empty
                    $upd = $pdo->prepare('UPDATE users SET storeId = ? WHERE id = ? AND (storeId IS NULL OR storeId = "")');
                    $upd->execute([$data['id'], $data['adminId']]);
                } catch (Exception $e) {
                    error_log('store admin link on PUT error: '.$e->getMessage());
                }
            }
            echo json_encode(['success' => true]);
            break;
        case 'DELETE':
            // Essayer d'obtenir l'id depuis le body JSON ou la query string
            $data = json_decode(file_get_contents('php://input'), true);
            $id = $data['id'] ?? ($_GET['id'] ?? null);
            // Support de la suppression douce (soft delete) : ?soft=1 ou {"soft": true} dans le body
            $soft = (isset($_GET['soft']) && $_GET['soft'] === '1') || (!empty($data) && !empty($data['soft']));
            if ($id) {
                // If soft delete requested, simply deactivate the store instead of removing all data
                if ($soft) {
                    try {
                        $upd = $pdo->prepare('UPDATE stores SET active = 0 WHERE id = ?');
                        $upd->execute([$id]);
                        echo json_encode(['success' => true, 'soft' => true, 'id' => $id]);
                    } catch (PDOException $ex) {
                        http_response_code(500);
                        echo json_encode(['success' => false, 'error' => $ex->getMessage()]);
                    }
                    exit;
                }
                // Log de debug
                error_log('Suppression magasin id=' . $id);
                try {
                    $pdo->beginTransaction();
                    // Supprimer les mappings user_stores pour ce magasin (ne pas supprimer les utilisateurs eux-mêmes)
                    $stmt = $pdo->prepare('DELETE FROM user_stores WHERE storeId=?');
                    $stmt->execute([$id]);
                    // Supprimer les items de vente liés aux ventes du magasin
                    $stmt = $pdo->prepare('DELETE si FROM sale_items si INNER JOIN sales s ON si.saleId = s.id WHERE s.storeId = ?');
                    $stmt->execute([$id]);
                    // Supprimer les ventes liées
                    $stmt = $pdo->prepare('DELETE FROM sales WHERE storeId=?');
                    $stmt->execute([$id]);
                    // Supprimer les clients liés
                    $stmt = $pdo->prepare('DELETE FROM customers WHERE storeId=?');
                    $stmt->execute([$id]);
                    // Supprimer les produits liés
                    $stmt = $pdo->prepare('DELETE FROM products WHERE storeId=?');
                    $stmt->execute([$id]);
                    // Supprimer les catégories liées
                    $stmt = $pdo->prepare('DELETE FROM categories WHERE storeId=?');
                    $stmt->execute([$id]);
                    // Supprimer les dépenses liées
                    $stmt = $pdo->prepare('DELETE FROM expenses WHERE storeId=?');
                    $stmt->execute([$id]);
                    $stmt = $pdo->prepare('DELETE FROM expenses_advanced WHERE storeId=?');
                    $stmt->execute([$id]);
                    $stmt = $pdo->prepare('DELETE FROM expense_categories WHERE storeId=?');
                    $stmt->execute([$id]);
                    // Supprimer les shifts liés
                    $stmt = $pdo->prepare('DELETE FROM shifts WHERE storeId=?');
                    $stmt->execute([$id]);
                    // Supprimer les signaux de stock liés
                    $stmt = $pdo->prepare('DELETE FROM stock_signals WHERE storeId=?');
                    $stmt->execute([$id]);
                    // Supprimer les réglages email liés (store_id)
                    try {
                        $stmt = $pdo->prepare('DELETE FROM email_settings WHERE store_id=?');
                        $stmt->execute([$id]);
                    } catch (Exception $e) {
                        // ignore if table/column not present
                    }
                    // Supprimer les overrides/paramètres de solde liés
                    $stmt = $pdo->prepare('DELETE FROM store_balance_overrides WHERE storeId=?');
                    $stmt->execute([$id]);
                    $stmt = $pdo->prepare('DELETE FROM store_balance_settings WHERE storeId=?');
                    $stmt->execute([$id]);
                    $stmt = $pdo->prepare('DELETE FROM store_indicator_overrides WHERE storeId=?');
                    $stmt->execute([$id]);
                    // Enfin, supprimer le magasin
                    $stmt = $pdo->prepare('DELETE FROM stores WHERE id=?');
                    $stmt->execute([$id]);
                    $deleted = $stmt->rowCount();
                    $pdo->commit();
                    error_log('Résultat suppression magasin: ' . $deleted . ' ligne(s) supprimée(s)');
                    echo json_encode(['success' => true, 'deleted' => $deleted]);
                } catch (PDOException $ex) {
                    $pdo->rollBack();
                    error_log('Erreur SQL suppression magasin: ' . $ex->getMessage());
                    http_response_code(500);
                    echo json_encode(['success' => false, 'error' => $ex->getMessage()]);
                }
            } else {
                echo json_encode(['error' => 'ID requis']);
            }
            break;
        default:
            http_response_code(405);
            echo json_encode(['error' => 'Méthode non autorisée']);
            break;
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
?>
