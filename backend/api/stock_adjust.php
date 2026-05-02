<?php
require_once '../config.php';
require_once __DIR__ . '/_bootstrap.php';

init_api_headers(['GET', 'POST', 'OPTIONS']);
$claims = require_auth();
$currentUserId = trim((string)($claims['sub'] ?? ''));

// Créer la table stock_adjustments si elle n'existe pas
try {
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS `stock_adjustments` (
            `id` varchar(36) NOT NULL,
            `sessionId` varchar(36) NOT NULL,
            `productId` varchar(36) NOT NULL,
            `productName` varchar(255) DEFAULT NULL,
            `sku` varchar(100) DEFAULT NULL,
            `userId` varchar(36) DEFAULT NULL,
            `userName` varchar(255) DEFAULT NULL,
            `storeId` varchar(36) NOT NULL,
            `oldStock` int(11) DEFAULT NULL,
            `delta` int(11) NOT NULL,
            `newStock` int(11) DEFAULT NULL,
            `reason` varchar(500) DEFAULT NULL,
            `globalReason` varchar(500) DEFAULT NULL,
            `createdAt` bigint(20) NOT NULL,
            PRIMARY KEY (`id`),
            KEY `idx_storeId` (`storeId`),
            KEY `idx_createdAt` (`createdAt`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ");
} catch (\Throwable $e) { /* ignore si existe déjà */ }

// ===== GET : Récupérer l'historique des ajustements =====
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $storeId = ensure_store_access($claims, $_GET['storeId'] ?? null);
    try {
        $limit = min((int)($_GET['limit'] ?? 200), 500);

        // 1. Données depuis la nouvelle table stock_adjustments (ajustements récents structurés)
        $newRows = [];
        try {
            $stmt = $pdo->prepare("
                SELECT
                    id, sessionId, productId, productName, sku,
                    userId, userName, storeId,
                    oldStock, delta, newStock, reason, globalReason, createdAt
                FROM stock_adjustments
                WHERE storeId = ?
                ORDER BY createdAt DESC
                LIMIT ?
            ");
            $stmt->execute([$storeId, $limit]);
            $newRows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        } catch (\Throwable $e) { /* table peut ne pas encore exister */ }

        // 2. Données historiques depuis stock_signals (expenseId IS NULL = ajustements manuels)
        $oldRows = [];
        try {
            $stmt2 = $pdo->prepare("
                SELECT
                    ss.id,
                    NULL as sessionId,
                    ss.productId,
                    p.name as productName,
                    p.sku as sku,
                    ss.userId,
                    u.username as userName,
                    ss.storeId,
                    NULL as oldStock,
                    CASE WHEN ss.quantityBought > 0 THEN ss.quantityBought ELSE -ss.quantitySold END as delta,
                    NULL as newStock,
                    NULL as reason,
                    NULL as globalReason,
                    ss.createdAt
                FROM stock_signals ss
                LEFT JOIN products p ON p.id = ss.productId
                LEFT JOIN users u ON u.id = ss.userId
                WHERE ss.storeId = ?
                  AND ss.expenseId IS NULL
                ORDER BY ss.createdAt DESC
                LIMIT ?
            ");
            $stmt2->execute([$storeId, $limit]);
            $oldRows = $stmt2->fetchAll(PDO::FETCH_ASSOC);
        } catch (\Throwable $e) { /* ignore */ }

        // Fusionner et dédupliquer (la nouvelle table a priorité si même id)
        $newIds = array_column($newRows, 'id');
        $filtered = array_filter($oldRows, fn($r) => !in_array($r['id'], $newIds));
        $merged = array_merge($newRows, array_values($filtered));

        // Trier par date décroissante
        usort($merged, fn($a, $b) => (int)$b['createdAt'] - (int)$a['createdAt']);
        $merged = array_slice($merged, 0, $limit);

        echo json_encode(['ok' => true, 'data' => $merged]);
    } catch (\Throwable $e) {
        echo json_encode(['ok' => false, 'error' => $e->getMessage()]);
    }
    exit;
}

// Charger PHPMailer
require __DIR__ . '/../mail/PHPMailer-master/src/Exception.php';
require __DIR__ . '/../mail/PHPMailer-master/src/PHPMailer.php';
require __DIR__ . '/../mail/PHPMailer-master/src/SMTP.php';
use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception as MailException;

$raw = file_get_contents('php://input');
$data = json_decode($raw, true);
if (!$data) {
    echo json_encode(['ok' => false, 'error' => 'JSON invalide']);
    exit;
}

$storeId = ensure_store_access($claims, $data['storeId'] ?? null);
$requestedUserId = isset($data['userId']) ? trim((string)$data['userId']) : '';
if ($requestedUserId !== '' && $requestedUserId !== $currentUserId && !is_super_admin_claims($claims)) {
    echo json_encode(['ok' => false, 'error' => 'userId invalide']);
    exit;
}
$userId = $requestedUserId !== '' ? $requestedUserId : $currentUserId;
$globalReason = $data['reason'] ?? '';

// Compatibilité: ancien mode unitaire + nouveau mode batch
$adjustments = $data['adjustments'] ?? null;
if (!is_array($adjustments)) {
    $productId = $data['productId'] ?? null;
    $delta = isset($data['delta']) ? (int)$data['delta'] : null;
    if ($productId && $delta !== null) {
        $adjustments = [[
            'productId' => $productId,
            'delta' => $delta,
            'reason' => $data['reason'] ?? ''
        ]];
    }
}

if (!$userId || !is_array($adjustments) || count($adjustments) === 0) {
    echo json_encode(['ok' => false, 'error' => 'storeId, userId et adjustments[] requis']);
    exit;
}

try {
    $pdo->beginTransaction();

    $productStmt = $pdo->prepare('SELECT id, name, sku, trackStock FROM products WHERE id = ?');
    $stockStmt = $pdo->prepare('SELECT stock FROM product_stock WHERE productId = ? AND storeId = ? FOR UPDATE');
    $updateStmt = $pdo->prepare('UPDATE product_stock SET stock = ? WHERE productId = ? AND storeId = ?');
    $insertStmt = $pdo->prepare('INSERT INTO product_stock (productId, storeId, stock) VALUES (?, ?, ?)');
    $insSignalStmt = $pdo->prepare('INSERT INTO stock_signals (id, expenseId, productId, userId, storeId, startDate, endDate, purchaseAmount, quantityBought, quantitySold, revenue, margin, realMargin, marginPercentage, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');

    $createdAt = round(microtime(true) * 1000);
    $results = [];

    foreach ($adjustments as $idx => $adj) {
        $productId = $adj['productId'] ?? null;
        $delta = isset($adj['delta']) ? (int)$adj['delta'] : null;
        $lineReason = $adj['reason'] ?? '';

        if (!$productId || $delta === null || $delta === 0) {
            throw new \Exception('Ajustement invalide à la ligne ' . ($idx + 1));
        }

        $productStmt->execute([$productId]);
        $prod = $productStmt->fetch(PDO::FETCH_ASSOC);
        if (!$prod) {
            throw new \Exception('Produit introuvable: ' . $productId);
        }
        if (!(int)$prod['trackStock']) {
            throw new \Exception('Suivi de stock désactivé pour: ' . ($prod['name'] ?? $productId));
        }

        $stockStmt->execute([$productId, $storeId]);
        $row = $stockStmt->fetch(PDO::FETCH_ASSOC);
        $oldStock = $row ? (int)$row['stock'] : 0;
        $newStock = $oldStock + $delta;

        if ($row) {
            $updateStmt->execute([$newStock, $productId, $storeId]);
        } else {
            $insertStmt->execute([$productId, $storeId, $newStock]);
        }

        $signalId = uniqid();
        $quantityBought = $delta > 0 ? $delta : 0;
        $quantitySold = $delta < 0 ? (-$delta) : 0;
        $insSignalStmt->execute([
            $signalId,
            null,
            $productId,
            $userId,
            $storeId,
            null,
            null,
            null,
            $quantityBought,
            $quantitySold,
            null,
            null,
            null,
            null,
            $createdAt
        ]);

        $results[] = [
            'signalId' => $signalId,  // On garde le même ID !
            'productId' => $productId,
            'productName' => $prod['name'] ?? $productId,
            'sku' => $prod['sku'] ?? '',
            'oldStock' => $oldStock,
            'delta' => $delta,
            'newStock' => $newStock,
            'reason' => $lineReason
        ];
    }

    $pdo->commit();

    // Récupérer nom utilisateur pour l'historique
    $histUserName = null;
    try {
        $histUserStmt = $pdo->prepare('SELECT username FROM users WHERE id = ? LIMIT 1');
        $histUserStmt->execute([$userId]);
        $histUrow = $histUserStmt->fetch(PDO::FETCH_ASSOC);
        if ($histUrow) $histUserName = $histUrow['username'];
    } catch (\Throwable $e) { /* ignore */ }

    // Enregistrer dans stock_adjustments pour l'historique
    $sessionId = uniqid('adj_', true);
    try {
        $insHistStmt = $pdo->prepare('
            INSERT INTO stock_adjustments
            (id, sessionId, productId, productName, sku, userId, userName, storeId, oldStock, delta, newStock, reason, globalReason, createdAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ');
        foreach ($results as $item) {
            $insHistStmt->execute([
                $item['signalId'],  // Utiliser le même ID que stock_signals pour la déduplication
                $sessionId,
                $item['productId'],
                $item['productName'],
                $item['sku'] ?? '',
                $userId,
                $histUserName,
                $storeId,
                $item['oldStock'],
                $item['delta'],
                $item['newStock'],
                $item['reason'] ?? '',
                $globalReason,
                $createdAt
            ]);
        }
    } catch (\Throwable $e) {
        // L'historique échoue silencieusement pour ne pas bloquer l'ajustement
        @file_put_contents(__DIR__ . '/stock_adjust.log', date('c') . " History insert error: " . $e->getMessage() . "\n", FILE_APPEND);
    }

    // Récupérer nom du magasin et nom utilisateur pour un affichage lisible
    $storeName = null;
    try {
        $storeStmt = $pdo->prepare('SELECT name FROM stores WHERE id = ? LIMIT 1');
        $storeStmt->execute([$storeId]);
        $srow = $storeStmt->fetch(PDO::FETCH_ASSOC);
        $storeName = $srow ? $srow['name'] : null;
    } catch (\Throwable $e) { /* ignore */ }

    $userName = null;
    try {
        $userStmt = $pdo->prepare('SELECT username, phone FROM users WHERE id = ? LIMIT 1');
        $userStmt->execute([$userId]);
        $urow = $userStmt->fetch(PDO::FETCH_ASSOC);
        if ($urow) {
            $userName = $urow['username'] . (!empty($urow['phone']) ? ' (' . $urow['phone'] . ')' : '');
        }
    } catch (\Throwable $e) { /* ignore */ }

    // Construire résumé unique
    $summary = "Résumé des ajustements de stock:\n";
    $summary .= "Magasin: " . ($storeName ?: $storeId) . "\n";
    $summary .= "Effectué par: " . ($userName ?: $userId) . "\n";
    $summary .= "Nombre de produits ajustés: " . count($results) . "\n";
    if ($globalReason) {
        $summary .= "Motif global: $globalReason\n";
    }
    $summary .= "\nDétails:\n";
    foreach ($results as $item) {
        $deltaText = $item['delta'] > 0 ? '+' . $item['delta'] : (string)$item['delta'];
        $summary .= "- " . $item['productName'] . " (" . $item['sku'] . ") | " . $item['oldStock'] . " -> " . $item['newStock'] . " (" . $deltaText . ")";
        if (!empty($item['reason'])) {
            $summary .= " | Motif: " . $item['reason'];
        }
        $summary .= "\n";
    }

    // Récupérer emails des administrateurs pour ce magasin
    $emails = [];
    $adminStmt = $pdo->prepare("SELECT email FROM users WHERE (role = 'admin' OR role = 'owner') AND active = 1 AND email IS NOT NULL AND (storeId = ? OR id IN (SELECT userId FROM user_stores WHERE storeId = ?))");
    $adminStmt->execute([$storeId, $storeId]);
    $rows = $adminStmt->fetchAll(PDO::FETCH_COLUMN);
    foreach ($rows as $e) {
        if ($e) $emails[] = $e;
    }
    $emails = array_values(array_unique($emails));

    // Fallback si aucun admin trouvé
    if (empty($emails)) {
        $fallbackEmail = get_env_string('APP_DEFAULT_ADMIN_EMAIL', get_env_string('SMTP_FROM_EMAIL', get_env_string('SMTP_USERNAME', '')));
        if ($fallbackEmail !== '') {
            $emails[] = $fallbackEmail;
        }
    }

    // Envoyer email à chaque admin
    $mailErrors = [];
    foreach ($emails as $to) {
        try {
            $mail = new PHPMailer(true);
            configure_smtp_mailer($mail);
            $mail->addAddress($to);
            $mail->isHTML(true);
            $mail->CharSet = 'UTF-8';
            $mail->Encoding = '8bit';
            $mail->Subject = 'Ajustements de stock (' . count($results) . ' produits)';

            // Build an HTML body similar to send-email.php template
            $safeStore = htmlspecialchars($storeName ?: $storeId, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
            $safeUser = htmlspecialchars($userName ?: $userId, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
            $safeGlobalReason = htmlspecialchars($globalReason, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');

            $htmlDetails = '';
            foreach ($results as $item) {
                $pname = htmlspecialchars($item['productName'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
                $psku = htmlspecialchars($item['sku'] ?? '', ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
                $old = (int)$item['oldStock'];
                $new = (int)$item['newStock'];
                $deltaText = $item['delta'] > 0 ? '+' . $item['delta'] : (string)$item['delta'];
                $lineReason = htmlspecialchars($item['reason'] ?? '', ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
                $htmlDetails .= "<div style='padding:8px 0;border-bottom:1px solid #eee;display:flex;justify-content:space-between;align-items:center;'>" .
                    "<div style='max-width:70%'><strong>$pname</strong> <span style='color:#666'>($psku)</span>" .
                    ( $lineReason ? "<div style='font-size:12px;color:#666;margin-top:4px;'>Motif: $lineReason</div>" : "" ) .
                    "</div>" .
                    "<div style='text-align:right;min-width:160px;'><div style='font-weight:600;'>$old → $new <span style='color:#888;font-weight:400;'>($deltaText)</span></div></div>" .
                "</div>";
            }

            $htmlBody = "<!doctype html><html><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><style>body{font-family:Arial,Helvetica,sans-serif;background:#f6f8fb;color:#222;margin:0;padding:0} .container{max-width:680px;margin:20px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,0.06)} .header{background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:#fff;padding:20px} .content{padding:20px} .footer{padding:16px;font-size:12px;color:#888;background:#fafafa;border-top:1px solid #eee}</style></head><body>" .
                "<div class='container'>" .
                    "<div class='header'><h2 style='margin:0;font-size:18px'>📦 Ajustements de stock</h2><div style='opacity:0.9;margin-top:6px;font-size:13px'>Magasin: $safeStore — Effectué par: $safeUser</div></div>" .
                    "<div class='content'>" .
                        ($safeGlobalReason ? "<div style='background:#fff7e6;padding:10px;border-left:4px solid #ffc107;margin-bottom:12px;border-radius:4px;'><strong>Motif: </strong> $safeGlobalReason</div>" : "") .
                        "<div style='margin-bottom:8px;color:#555;font-size:14px'>Nombre de produits ajustés: <strong>" . count($results) . "</strong></div>" .
                        "<div style='border:1px solid #eee;border-radius:6px;padding:8px;background:#fff;'>$htmlDetails</div>" .
                    "</div>" .
                    "<div class='footer'>📧 Cet email a été envoyé automatiquement par le système POS Power Start</div>" .
                "</div></body></html>";

            $mail->Body = $htmlBody;
            $mail->AltBody = $summary;

            $mail->send();
        } catch (MailException $e) {
            // Log and collect error
            $errMsg = $e->getMessage();
            @file_put_contents(__DIR__ . '/stock_adjust.log', date('c') . " Mail error to $to: " . $errMsg . "\n", FILE_APPEND);
            $mailErrors[] = ['to' => $to, 'error' => $errMsg];
        }
    }

    $out = [
        'ok' => true,
        'storeId' => $storeId,
        'userId' => $userId,
        'count' => count($results),
        'results' => $results
    ];
    if (!empty($mailErrors)) $out['mailErrors'] = $mailErrors;
    echo json_encode($out);

} catch (\Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    @file_put_contents(__DIR__ . '/stock_adjust.log', date('c') . " ERROR: " . $e->getMessage() . "\nRaw: " . $raw . "\n", FILE_APPEND);
    echo json_encode(['ok' => false, 'error' => $e->getMessage()]);
}

?>
