<?php
// Headers CORS
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

require_once '../config.php';

$start = isset($_GET['start']) ? intval($_GET['start']) : null; // timestamps in ms
$end = isset($_GET['end']) ? intval($_GET['end']) : null;
$groupBy = $_GET['groupBy'] ?? 'days';
$userId = $_GET['userId'] ?? null;
$storeId = $_GET['storeId'] ?? null;
$startHour = $_GET['startHour'] ?? null; // "08:00" format
$endHour = $_GET['endHour'] ?? null; // "18:00" format

if (!$start || !$end) {
    echo json_encode(['error' => 'start and end parameters required']);
    exit;
}

// Build where clause
$where = ' WHERE createdAt >= ? AND createdAt <= ?';
$params = [$start, $end];

// Add hour filtering if provided
if ($startHour && $endHour) {
    // Extract hour and minute from "HH:MM" format
    list($startH, $startM) = explode(':', $startHour);
    list($endH, $endM) = explode(':', $endHour);
    
    // Add time filtering: only include sales within the specified hours for each day
    $where .= ' AND (HOUR(FROM_UNIXTIME(createdAt/1000)) * 60 + MINUTE(FROM_UNIXTIME(createdAt/1000))) >= ? AND (HOUR(FROM_UNIXTIME(createdAt/1000)) * 60 + MINUTE(FROM_UNIXTIME(createdAt/1000))) <= ?';
    $params[] = intval($startH) * 60 + intval($startM); // Convert to minutes since midnight
    $params[] = intval($endH) * 60 + intval($endM); // Convert to minutes since midnight
}

if ($userId) {
    $where .= ' AND userId = ?';
    $params[] = $userId;
} elseif ($storeId) {
    $where .= ' AND storeId = ?';
    $params[] = $storeId;
}

// Choose grouping expression and label
switch ($groupBy) {
    case 'minutes':
        $groupExpr = "DATE_FORMAT(FROM_UNIXTIME(createdAt/1000), '%Y-%m-%d %H:%i')";
        $labelExpr = "DATE_FORMAT(FROM_UNIXTIME(createdAt/1000), '%d %b %y, %H:%i')";
        break;
    case 'hours':
        $groupExpr = "DATE_FORMAT(FROM_UNIXTIME(createdAt/1000), '%Y-%m-%d %H:00')";
        $labelExpr = "DATE_FORMAT(FROM_UNIXTIME(createdAt/1000), '%d %b %y, %Hh')";
        break;
    case 'weeks':
        // Week label: Monday date
        $groupExpr = "STR_TO_DATE(CONCAT(YEAR(FROM_UNIXTIME(createdAt/1000)),'-', WEEK(FROM_UNIXTIME(createdAt/1000), 1),' 1'), '%X-%V %w')";
        $labelExpr = "DATE_FORMAT(STR_TO_DATE(CONCAT(YEAR(FROM_UNIXTIME(createdAt/1000)),'-', WEEK(FROM_UNIXTIME(createdAt/1000), 1),' 1'), '%X-%V %w'), '%d %b %y')";
        break;
    case 'months':
        $groupExpr = "DATE_FORMAT(FROM_UNIXTIME(createdAt/1000), '%Y-%m-01')";
        $labelExpr = "DATE_FORMAT(FROM_UNIXTIME(createdAt/1000), '%b %Y')";
        break;
    case 'days':
    default:
        $groupExpr = "DATE_FORMAT(FROM_UNIXTIME(createdAt/1000), '%Y-%m-%d')";
        $labelExpr = "DATE_FORMAT(FROM_UNIXTIME(createdAt/1000), '%d %b %y')";
        break;
}

// Aggregate ventes by group
$sql = "SELECT $groupExpr as period_key, $labelExpr as label, SUM(CAST(total AS DECIMAL(20,2))) as ventes FROM sales" . $where . " GROUP BY period_key ORDER BY period_key";
$stmt = $pdo->prepare($sql);
$stmt->execute($params);
$rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

$chartData = array_map(function($r) {
    return ['date' => $r['label'], 'ventes' => (float)$r['ventes']];
}, $rows);

// Totals: ventes brutes, remboursements
$totalsSql = 'SELECT SUM(CAST(total AS DECIMAL(20,2))) as ventesBrutes FROM sales' . $where;
$totalsStmt = $pdo->prepare($totalsSql);
$totalsStmt->execute($params);
$totalsRow = $totalsStmt->fetch(PDO::FETCH_ASSOC);
$ventesBrutes = (float)($totalsRow['ventesBrutes'] ?? 0);

$rembWhere = $where . ' AND refunded = 1';
$rembStmt = $pdo->prepare('SELECT SUM(CAST(total AS DECIMAL(20,2))) as remboursements FROM sales' . $rembWhere);
$rembStmt->execute($params);
$rembRow = $rembStmt->fetch(PDO::FETCH_ASSOC);
$remboursements = (float)($rembRow['remboursements'] ?? 0);

// Build marge query with hour filtering
$margeSql = "SELECT SUM( (CASE WHEN p.targetMargin IS NOT NULL AND p.targetMargin <> 0 THEN (COALESCE(si.price,0) * (p.targetMargin/100.0)) WHEN p.costPrice IS NOT NULL AND p.costPrice <> 0 THEN (COALESCE(si.price,0) - p.costPrice) ELSE (COALESCE(si.price,0) - COALESCE(p.costPrice,0)) END) * COALESCE(si.quantity,0) ) as margeBrute FROM sale_items si JOIN sales s ON si.saleId = s.id LEFT JOIN products p ON si.productId = p.id WHERE s.createdAt >= ? AND s.createdAt <= ? AND s.refunded = 0";

// Add hour filtering for marge calculation
if ($startHour && $endHour) {
    list($startH, $startM) = explode(':', $startHour);
    list($endH, $endM) = explode(':', $endHour);
    $margeSql .= ' AND (HOUR(FROM_UNIXTIME(s.createdAt/1000)) * 60 + MINUTE(FROM_UNIXTIME(s.createdAt/1000))) >= ? AND (HOUR(FROM_UNIXTIME(s.createdAt/1000)) * 60 + MINUTE(FROM_UNIXTIME(s.createdAt/1000))) <= ?';
}

$margeSql .= ($userId ? ' AND s.userId = ?' : ($storeId ? ' AND s.storeId = ?' : ''));

$margeStmt = $pdo->prepare($margeSql);
// Build params for marge query
$margeParams = [$start, $end];
if ($startHour && $endHour) {
    list($startH, $startM) = explode(':', $startHour);
    list($endH, $endM) = explode(':', $endHour);
    $margeParams[] = intval($startH) * 60 + intval($startM);
    $margeParams[] = intval($endH) * 60 + intval($endM);
}
if ($userId) $margeParams[] = $userId;
elseif ($storeId) $margeParams[] = $storeId;

$margeStmt->execute($margeParams);
$margeRow = $margeStmt->fetch(PDO::FETCH_ASSOC);
$margeBrute = (float)($margeRow['margeBrute'] ?? 0);

// Sales by product
$productsSql = "SELECT p.name as productName, SUM(COALESCE(si.quantity,0)) as quantity, SUM(CAST(si.price AS DECIMAL(20,2)) * COALESCE(si.quantity,0)) as total FROM sale_items si JOIN sales s ON si.saleId = s.id LEFT JOIN products p ON si.productId = p.id WHERE s.createdAt >= ? AND s.createdAt <= ? AND s.refunded = 0";

// Add hour filtering for products
if ($startHour && $endHour) {
    list($startH, $startM) = explode(':', $startHour);
    list($endH, $endM) = explode(':', $endHour);
    $productsSql .= ' AND (HOUR(FROM_UNIXTIME(s.createdAt/1000)) * 60 + MINUTE(FROM_UNIXTIME(s.createdAt/1000))) >= ? AND (HOUR(FROM_UNIXTIME(s.createdAt/1000)) * 60 + MINUTE(FROM_UNIXTIME(s.createdAt/1000))) <= ?';
}

$productsSql .= ($userId ? ' AND s.userId = ?' : ($storeId ? ' AND s.storeId = ?' : '')) . " GROUP BY p.name ORDER BY total DESC LIMIT 10";

$productsStmt = $pdo->prepare($productsSql);
// Build params for products query
$productsParams = [$start, $end];
if ($startHour && $endHour) {
    list($startH, $startM) = explode(':', $startHour);
    list($endH, $endM) = explode(':', $endHour);
    $productsParams[] = intval($startH) * 60 + intval($startM);
    $productsParams[] = intval($endH) * 60 + intval($endM);
}
if ($userId) $productsParams[] = $userId;
elseif ($storeId) $productsParams[] = $storeId;

$productsStmt->execute($productsParams);
$productsRows = $productsStmt->fetchAll(PDO::FETCH_ASSOC);

$salesByProduct = array_map(function($r) {
    return ['name' => $r['productName'] ?? 'Unknown', 'quantity' => (int)$r['quantity'], 'total' => (float)$r['total']];
}, $productsRows);

// Surplus / Manque from shifts table
$shiftsWhere = ' WHERE status = "closed" AND closedAt >= ? AND closedAt <= ?';
$shiftParams = [$start, $end];
if ($userId) {
    $shiftsWhere .= ' AND userId = ?';
    $shiftParams[] = $userId;
} elseif ($storeId) {
    $shiftsWhere .= ' AND storeId = ?';
    $shiftParams[] = $storeId;
}
$shiftStmt = $pdo->prepare('SELECT difference FROM shifts' . $shiftsWhere);
$shiftStmt->execute($shiftParams);
$shiftRows = $shiftStmt->fetchAll(PDO::FETCH_ASSOC);
$surplus = 0.0;
$manque = 0.0;
foreach ($shiftRows as $s) {
    $diff = isset($s['difference']) ? (float)$s['difference'] : 0.0;
    if ($diff > 0) $surplus += $diff;
    if ($diff < 0) $manque += abs($diff);
}

// Calculate previous period for evolutions
$periodLength = $end - $start;
$prevStart = $start - $periodLength - 1;
$prevEnd = $start - 1;

// Helper to build params for prev queries
$prevParams = [$prevStart, $prevEnd];
if ($startHour && $endHour) {
    list($startH, $startM) = explode(':', $startHour);
    list($endH, $endM) = explode(':', $endHour);
    $prevParams[] = intval($startH) * 60 + intval($startM);
    $prevParams[] = intval($endH) * 60 + intval($endM);
}
if ($userId) $prevParams[] = $userId;
elseif ($storeId) $prevParams[] = $storeId;

// Build previous period query with hour filtering
$prevTotalsSql = 'SELECT SUM(CAST(total AS DECIMAL(20,2))) as ventesBrutes FROM sales WHERE createdAt >= ? AND createdAt <= ?';
if ($startHour && $endHour) {
    $prevTotalsSql .= ' AND (HOUR(FROM_UNIXTIME(createdAt/1000)) * 60 + MINUTE(FROM_UNIXTIME(createdAt/1000))) >= ? AND (HOUR(FROM_UNIXTIME(createdAt/1000)) * 60 + MINUTE(FROM_UNIXTIME(createdAt/1000))) <= ?';
}
$prevTotalsSql .= ($userId ? ' AND userId = ?' : ($storeId ? ' AND storeId = ?' : ''));

$prevTotalsStmt = $pdo->prepare($prevTotalsSql);
$prevTotalsStmt->execute($prevParams);
$prevTotalsRow = $prevTotalsStmt->fetch(PDO::FETCH_ASSOC);
$prevVentesBrutes = (float)($prevTotalsRow['ventesBrutes'] ?? 0);

$prevRembSql = 'SELECT SUM(CAST(total AS DECIMAL(20,2))) as remboursements FROM sales WHERE createdAt >= ? AND createdAt <= ?';
if ($startHour && $endHour) {
    $prevRembSql .= ' AND (HOUR(FROM_UNIXTIME(createdAt/1000)) * 60 + MINUTE(FROM_UNIXTIME(createdAt/1000))) >= ? AND (HOUR(FROM_UNIXTIME(createdAt/1000)) * 60 + MINUTE(FROM_UNIXTIME(createdAt/1000))) <= ?';
}
$prevRembSql .= ($userId ? ' AND userId = ?' : ($storeId ? ' AND storeId = ?' : '')) . ' AND refunded = 1';

$prevRembStmt = $pdo->prepare($prevRembSql);
$prevRembStmt->execute($prevParams);
$prevRembRow = $prevRembStmt->fetch(PDO::FETCH_ASSOC);
$prevRemboursements = (float)($prevRembRow['remboursements'] ?? 0);

// Shifts prev - build the correct params array for previous period shifts
$prevShiftParams = [$prevStart, $prevEnd];
if ($userId) $prevShiftParams[] = $userId;
elseif ($storeId) $prevShiftParams[] = $storeId;

$prevShiftStmt = $pdo->prepare('SELECT difference FROM shifts WHERE status = "closed" AND closedAt >= ? AND closedAt <= ?' . ($userId ? ' AND userId = ?' : ($storeId ? ' AND storeId = ?' : '')));
$prevShiftStmt->execute($prevShiftParams);
$prevShiftRows = $prevShiftStmt->fetchAll(PDO::FETCH_ASSOC);
$prevSurplus = 0.0;
$prevManque = 0.0;
foreach ($prevShiftRows as $s) {
    $diff = isset($s['difference']) ? (float)$s['difference'] : 0.0;
    if ($diff > 0) $prevSurplus += $diff;
    if ($diff < 0) $prevManque += abs($diff);
}

$evolVentes = $ventesBrutes - $prevVentesBrutes;
$evolRemboursements = $remboursements - $prevRemboursements;
$evolSurplus = $surplus - $prevSurplus;
$evolManque = $manque - $prevManque;

// Calcul marge brute pour la période précédente
$prevMargeSql = "SELECT SUM( (CASE WHEN p.targetMargin IS NOT NULL AND p.targetMargin <> 0 THEN (COALESCE(si.price,0) * (p.targetMargin/100.0)) WHEN p.costPrice IS NOT NULL AND p.costPrice <> 0 THEN (COALESCE(si.price,0) - p.costPrice) ELSE (COALESCE(si.price,0) - COALESCE(p.costPrice,0)) END) * COALESCE(si.quantity,0) ) as margeBrutePrev FROM sale_items si JOIN sales s ON si.saleId = s.id LEFT JOIN products p ON si.productId = p.id WHERE s.createdAt >= ? AND s.createdAt <= ? AND s.refunded = 0";

if ($startHour && $endHour) {
    $prevMargeSql .= ' AND (HOUR(FROM_UNIXTIME(s.createdAt/1000)) * 60 + MINUTE(FROM_UNIXTIME(s.createdAt/1000))) >= ? AND (HOUR(FROM_UNIXTIME(s.createdAt/1000)) * 60 + MINUTE(FROM_UNIXTIME(s.createdAt/1000))) <= ?';
}
$prevMargeSql .= ($userId ? ' AND s.userId = ?' : ($storeId ? ' AND s.storeId = ?' : ''));

$prevMargeStmt = $pdo->prepare($prevMargeSql);
$prevMargeStmt->execute($prevParams);
$prevMargeRow = $prevMargeStmt->fetch(PDO::FETCH_ASSOC);
$prevMargeBrute = (float)($prevMargeRow['margeBrutePrev'] ?? 0);

$evolMarge = $margeBrute - $prevMargeBrute;
// margeBrutePourcent = margeBrute / ventesBrutes * 100 (si ventesBrutes > 0)
$margeBrutePourcent = $ventesBrutes != 0 ? ($margeBrute / $ventesBrutes) * 100.0 : 0.0;
$evolMargePercent = ($prevMargeBrute != 0) ? ($evolMarge / $prevMargeBrute) * 100.0 : ($evolMarge == 0 ? 0.0 : 100.0);

function percent_change($delta, $previous) {
    if ($previous == 0) return ($delta == 0) ? 0.0 : 100.0;
    return ($delta / $previous) * 100.0;
}

$recapStats = [
    'ventesBrutes' => $ventesBrutes,
    'remboursements' => $remboursements,
    'surplus' => $surplus,
    'manque' => $manque,
    'ventesNettes' => $ventesBrutes - $remboursements,
    'margeBrute' => $margeBrute,
    'margeBrutePourcent' => $margeBrutePourcent,
    'evolVentes' => $evolVentes,
    'evolVentesPercent' => percent_change($evolVentes, $prevVentesBrutes),
    'evolRemboursements' => $evolRemboursements,
    'evolRemboursementsPercent' => percent_change($evolRemboursements, $prevRemboursements),
    'evolSurplus' => $evolSurplus,
    'evolSurplusPercent' => percent_change($evolSurplus, $prevSurplus),
    'evolManque' => $evolManque,
    'evolManquePercent' => percent_change($evolManque, $prevManque),
    'evolNettes' => ($ventesBrutes - $remboursements) - (($prevVentesBrutes) - ($prevRemboursements)),
    'evolMarge' => $evolMarge,
    'evolMargePercent' => $evolMargePercent,
];

echo json_encode(['chartData' => $chartData, 'recapStats' => $recapStats, 'salesByProduct' => $salesByProduct]);

?>
