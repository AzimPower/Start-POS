<?php
require_once '../config.php';
require_once __DIR__ . '/_bootstrap.php';
require_once __DIR__ . '/_ambassadors.php';

init_api_headers(['GET', 'POST', 'DELETE', 'OPTIONS']);
header('Cache-Control: no-cache, no-store, must-revalidate');
header('Pragma: no-cache');
header('Expires: 0');

$claims = require_auth();
ensure_ambassador_schema($pdo);

// Auto-create table if it doesn't exist yet
try {
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS `subscription_payments` (
          `id`        varchar(36)    NOT NULL,
          `storeId`   varchar(36)    NOT NULL,
          `storeName` varchar(255)   NOT NULL,
          `months`    int(11)        NOT NULL DEFAULT 1,
          `amount`    decimal(10,2)  NOT NULL,
          `paidAt`    bigint(20)     NOT NULL,
          `note`      varchar(255)   DEFAULT NULL,
          PRIMARY KEY (`id`),
          KEY `idx_sp_storeId` (`storeId`),
          KEY `idx_sp_paidAt`  (`paidAt`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ");
} catch (Exception $e) {
    // Table already exists or unsupported syntax – ignore
}

$method = $_SERVER['REQUEST_METHOD'];

try {
    switch ($method) {
        case 'GET':
            // Optional filters: ?storeId=xxx  ?limit=50  ?offset=0
            $storeId = isset($_GET['storeId']) && $_GET['storeId'] !== '' ? $_GET['storeId'] : null;
            $limit   = isset($_GET['limit'])   ? max(1, (int)$_GET['limit'])  : 200;
            $offset  = isset($_GET['offset'])  ? max(0, (int)$_GET['offset']) : 0;

            if ($storeId !== null) {
                $storeId = ensure_store_access($claims, $storeId);
            } elseif (!is_super_admin_claims($claims)) {
                $storeId = ensure_store_access($claims, null);
            }

            if ($storeId) {
                $stmt = $pdo->prepare(
                    'SELECT * FROM subscription_payments WHERE storeId = ? ORDER BY paidAt DESC LIMIT ? OFFSET ?'
                );
                $stmt->execute([$storeId, $limit, $offset]);
            } else {
                $stmt = $pdo->prepare(
                    'SELECT * FROM subscription_payments ORDER BY paidAt DESC LIMIT ? OFFSET ?'
                );
                $stmt->execute([$limit, $offset]);
            }
            $rows = $stmt->fetchAll();

            // Also return totals for convenience
            if ($storeId) {
                $totStmt = $pdo->prepare('SELECT IFNULL(SUM(amount),0) as total, COUNT(*) as count FROM subscription_payments WHERE storeId = ?');
                $totStmt->execute([$storeId]);
            } else {
                $totStmt = $pdo->query('SELECT IFNULL(SUM(amount),0) as total, COUNT(*) as count FROM subscription_payments');
            }
            $totals = $totStmt->fetch();

            echo json_encode([
                'success'  => true,
                'data'     => $rows,
                'total'    => (float)$totals['total'],
                'count'    => (int)$totals['count'],
            ]);
            break;

        case 'POST':
            $data = json_decode(file_get_contents('php://input'), true);
            if (!$data || empty($data['storeId']) || !isset($data['amount'])) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'Données manquantes']);
                exit;
            }

            $id        = $data['id']        ?? uniqid('sp_', true);
            $storeId   = ensure_store_access($claims, (string)$data['storeId']);
            $storeName = $data['storeName'] ?? '';
            $months    = isset($data['months']) ? (int)$data['months'] : 1;
            $amount    = (float)$data['amount'];
            $paidAt    = isset($data['paidAt']) ? (int)$data['paidAt'] : (int)(microtime(true) * 1000);
            $note      = $data['note'] ?? null;

            $stmt = $pdo->prepare(
                'INSERT INTO subscription_payments (id, storeId, storeName, months, amount, paidAt, note)
                 VALUES (?, ?, ?, ?, ?, ?, ?)'
            );
            $stmt->execute([$id, $storeId, $storeName, $months, $amount, $paidAt, $note]);
            create_first_subscription_commission($pdo, [
                'id' => $id,
                'storeId' => $storeId,
                'storeName' => $storeName,
                'amount' => $amount,
                'paidAt' => $paidAt,
            ]);

            echo json_encode(['success' => true, 'id' => $id]);
            break;

        case 'DELETE':
            $id = isset($_GET['id']) && $_GET['id'] !== '' ? $_GET['id'] : null;
            if (!$id) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'Identifiant manquant']);
                exit;
            }

            $lookup = $pdo->prepare('SELECT storeId FROM subscription_payments WHERE id = ? LIMIT 1');
            $lookup->execute([$id]);
            $existing = $lookup->fetch(PDO::FETCH_ASSOC);
            if (!$existing) {
                http_response_code(404);
                echo json_encode(['success' => false, 'error' => 'Enregistrement introuvable']);
                exit;
            }

            ensure_store_access($claims, (string)($existing['storeId'] ?? ''));

            $stmt = $pdo->prepare('DELETE FROM subscription_payments WHERE id = ?');
            $stmt->execute([$id]);
            try {
                $deleteCommission = $pdo->prepare('DELETE FROM ambassador_commissions WHERE subscriptionPaymentId = ?');
                $deleteCommission->execute([$id]);
            } catch (Exception $e) {
            }
            echo json_encode(['success' => true]);
            break;

        default:
            http_response_code(405);
            echo json_encode(['success' => false, 'error' => 'Méthode non autorisée']);
    }
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
