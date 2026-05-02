<?php
require_once './_bootstrap.php';
init_api_headers();
//
//
//

// Gestion des requêtes OPTIONS (preflight)
if (false && $_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

require_once '../config.php';

$method = $_SERVER['REQUEST_METHOD'];
$authClaims = require_auth();

switch ($method) {
    case 'GET':
        $storeId = ensure_store_access($authClaims, $_GET['storeId'] ?? null);
        $productId = $_GET['productId'] ?? null;
        $sql = 'SELECT * FROM stock_signals';
        $params = [];
        $conditions = [];
        if ($storeId) {
            $conditions[] = 'storeId = ?';
            $params[] = $storeId;
        }
        if ($productId) {
            $conditions[] = 'productId = ?';
            $params[] = $productId;
        }
        if (!empty($conditions)) {
            $sql .= ' WHERE ' . implode(' AND ', $conditions);
        }
        $sql .= ' ORDER BY createdAt DESC';
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $signals = $stmt->fetchAll();
        echo json_encode($signals);
        break;
    case 'POST':
        $data = json_decode(file_get_contents('php://input'), true);
        $data['storeId'] = ensure_store_access($authClaims, $data['storeId'] ?? null);
        // Log incoming payload for debugging
        file_put_contents(__DIR__ . '/stock_signals.log', date('c') . " POST\n" . json_encode($data) . "\n", FILE_APPEND);
        $sql = 'INSERT INTO stock_signals (id, expenseId, productId, userId, storeId, startDate, endDate, purchaseAmount, quantityBought, quantitySold, revenue, margin, realMargin, marginPercentage, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
        $stmt = $pdo->prepare($sql);
        $id = $data['id'] ?? uniqid();
        try {
            $res = $stmt->execute([
                $id,
                $data['expenseId'],
                $data['productId'],
                $data['userId'],
                $data['storeId'],
                $data['startDate'],
                $data['endDate'],
                $data['purchaseAmount'],
                $data['quantityBought'],
                $data['quantitySold'],
                $data['revenue'],
                $data['margin'],
                $data['realMargin'] ?? $data['margin'], // Fallback pour la compatibilité
                $data['marginPercentage'],
                $data['createdAt'] ?? time()*1000
            ]);
            if (!$res) {
                $err = $stmt->errorInfo();
                file_put_contents(__DIR__ . '/stock_signals.log', date('c') . " PDO ERROR\n" . json_encode($err) . "\n", FILE_APPEND);
                echo json_encode(['success' => false, 'error' => $err]);
            } else {
                echo json_encode(['success' => true, 'id' => $id]);
            }
        } catch (\Exception $e) {
            file_put_contents(__DIR__ . '/stock_signals.log', date('c') . " EXCEPTION\n" . $e->getMessage() . "\n", FILE_APPEND);
            echo json_encode(['success' => false, 'error' => $e->getMessage()]);
        }
        break;
    case 'PUT':
        $data = json_decode(file_get_contents('php://input'), true);
        $data['storeId'] = ensure_store_access($authClaims, $data['storeId'] ?? null);
        file_put_contents(__DIR__ . '/stock_signals.log', date('c') . " PUT\n" . json_encode($data) . "\n", FILE_APPEND);
        $sql = 'UPDATE stock_signals SET expenseId=?, productId=?, userId=?, storeId=?, startDate=?, endDate=?, purchaseAmount=?, quantityBought=?, quantitySold=?, revenue=?, margin=?, realMargin=?, marginPercentage=?, createdAt=? WHERE id=?';
        $stmt = $pdo->prepare($sql);
        try {
            $res = $stmt->execute([
                $data['expenseId'],
                $data['productId'],
                $data['userId'],
                $data['storeId'],
                $data['startDate'],
                $data['endDate'],
                $data['purchaseAmount'],
                $data['quantityBought'],
                $data['quantitySold'],
                $data['revenue'],
                $data['margin'],
                $data['realMargin'] ?? $data['margin'], // Fallback pour la compatibilité
                $data['marginPercentage'],
                $data['createdAt'],
                $data['id']
            ]);
            if (!$res) {
                $err = $stmt->errorInfo();
                file_put_contents(__DIR__ . '/stock_signals.log', date('c') . " PDO ERROR\n" . json_encode($err) . "\n", FILE_APPEND);
                echo json_encode(['success' => false, 'error' => $err]);
            } else {
                echo json_encode(['success' => true]);
            }
        } catch (\Exception $e) {
            file_put_contents(__DIR__ . '/stock_signals.log', date('c') . " EXCEPTION\n" . $e->getMessage() . "\n", FILE_APPEND);
            echo json_encode(['success' => false, 'error' => $e->getMessage()]);
        }
        break;
    case 'DELETE':
        $id = $_GET['id'] ?? null;
        if ($id) {
            if (!is_super_admin_claims($authClaims)) {
                $checkStmt = $pdo->prepare('SELECT storeId FROM stock_signals WHERE id = ? LIMIT 1');
                $checkStmt->execute([$id]);
                $targetStoreId = $checkStmt->fetchColumn();
                ensure_store_access($authClaims, $targetStoreId !== false ? (string)$targetStoreId : null);
            }
            $stmt = $pdo->prepare('DELETE FROM stock_signals WHERE id=?');
            $stmt->execute([$id]);
            echo json_encode(['success' => true]);
        } else {
            echo json_encode(['error' => 'ID requis']);
        }
        break;
    default:
        http_response_code(405);
        echo json_encode(['error' => 'Méthode non autorisée']);
        break;
}
?>
