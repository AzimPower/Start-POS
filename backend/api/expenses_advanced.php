<?php
// Afficher les erreurs PHP pour le debug
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);
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
require_once '../store_metrics.php';

$method = $_SERVER['REQUEST_METHOD'];
$authClaims = require_auth();

switch ($method) {
    case 'GET':
        $storeId = ensure_store_access($authClaims, $_GET['storeId'] ?? null);
        $expenseId = $_GET['id'] ?? null;
        $offset = isset($_GET['offset']) ? intval($_GET['offset']) : 0;
        $limit = isset($_GET['limit']) ? intval($_GET['limit']) : 25;
        $sql = 'SELECT * FROM expenses_advanced';
        $params = [];
        $conditions = [];
        if ($storeId) {
            $conditions[] = 'storeId = ?';
            $params[] = $storeId;
        }
        if ($expenseId) {
            $conditions[] = 'id = ?';
            $params[] = $expenseId;
        }
        if (!empty($conditions)) {
            $sql .= ' WHERE ' . implode(' AND ', $conditions);
        }
        $sql .= ' ORDER BY createdAt DESC';
        if (!$expenseId) {
            $sql .= ' LIMIT ? OFFSET ?';
            $params[] = $limit;
            $params[] = $offset;
        }
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $expenses = $stmt->fetchAll();

        // Reconstruire la structure directProduct pour chaque expense
        foreach ($expenses as &$expense) {
            if ($expense['type'] === 'direct' && ($expense['directProduct_productId'] || $expense['directProduct_quantity'] || $expense['directProduct_startDate'])) {
                $expense['directProduct'] = [
                    'productId' => $expense['directProduct_productId'],
                    'quantity' => (int)$expense['directProduct_quantity'],
                    'startDate' => (int)$expense['directProduct_startDate'],
                    'endDate' => $expense['directProduct_endDate'] ? (int)$expense['directProduct_endDate'] : null
                ];
            }
            // Nettoyer les colonnes individuelles pour éviter la confusion
            unset($expense['directProduct_productId']);
            unset($expense['directProduct_quantity']);
            unset($expense['directProduct_startDate']);
            unset($expense['directProduct_endDate']);
        }

        // Compter le total pour la pagination
        $countSql = 'SELECT COUNT(*) as total FROM expenses_advanced';
        $countParams = [];
        if (!empty($conditions)) {
            $countSql .= ' WHERE ' . implode(' AND ', $conditions);
            $countParams = array_slice($params, 0, count($conditions));
        }
        $countStmt = $pdo->prepare($countSql);
        $countStmt->execute($countParams);
        $total = $countStmt->fetchColumn();

        echo json_encode([
            'data' => $expenses,
            'total' => intval($total),
            'offset' => $offset,
            'limit' => $limit
        ]);
        break;
    case 'POST':
        $data = json_decode(file_get_contents('php://input'), true);
        $data['storeId'] = ensure_store_access($authClaims, $data['storeId'] ?? null);
        // Log pour debug
        file_put_contents(__DIR__.'/expenses_advanced.log', date('c')."\n".json_encode($data)."\n", FILE_APPEND);
        $directProduct = $data['directProduct'] ?? [];
        $stmt = $pdo->prepare('INSERT INTO expenses_advanced (id, type, name, amount, description, date, userId, storeId, status, directProduct_productId, directProduct_quantity, directProduct_startDate, directProduct_endDate, categoryId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        $id = $data['id'] ?? uniqid();
        $stmt->execute([
            $id,
            $data['type'],
            $data['name'],
            $data['amount'],
            $data['description'],
            $data['date'],
            $data['userId'],
            $data['storeId'],
            $data['status'],
            $directProduct['productId'] ?? $data['directProduct_productId'] ?? null,
            $directProduct['quantity'] ?? $data['directProduct_quantity'] ?? null,
            $directProduct['startDate'] ?? $data['directProduct_startDate'] ?? null,
            $directProduct['endDate'] ?? $data['directProduct_endDate'] ?? null,
            $data['categoryId'] ?? null,
            $data['createdAt'] ?? time()*1000,
            $data['updatedAt'] ?? time()*1000
        ]);
        store_metrics_refresh_expense_summary_for_timestamp($pdo, $data['storeId'] ?? null, (int)($data['date'] ?? 0));
        store_metrics_invalidate_cache($data['storeId'] ?? null);
        echo json_encode(['success' => true, 'id' => $id]);
        break;
    case 'PUT':
        $data = json_decode(file_get_contents('php://input'), true);
        $data['storeId'] = ensure_store_access($authClaims, $data['storeId'] ?? null);
        $existingStmt = $pdo->prepare('SELECT storeId, date FROM expenses_advanced WHERE id = ? LIMIT 1');
        $existingStmt->execute([$data['id'] ?? '']);
        $existingExpense = $existingStmt->fetch(PDO::FETCH_ASSOC) ?: [];
        $directProduct = $data['directProduct'] ?? [];
        $sql = 'UPDATE expenses_advanced SET type=?, name=?, amount=?, description=?, date=?, userId=?, storeId=?, status=?, directProduct_productId=?, directProduct_quantity=?, directProduct_startDate=?, directProduct_endDate=?, categoryId=?, createdAt=?, updatedAt=? WHERE id=?';
        $stmt = $pdo->prepare($sql);
        $stmt->execute([
            $data['type'],
            $data['name'],
            $data['amount'],
            $data['description'] ?? '',
            $data['date'],
            $data['userId'],
            $data['storeId'],
            $data['status'],
            $directProduct['productId'] ?? $data['directProduct_productId'] ?? null,
            $directProduct['quantity'] ?? $data['directProduct_quantity'] ?? null,
            $directProduct['startDate'] ?? $data['directProduct_startDate'] ?? null,
            $directProduct['endDate'] ?? $data['directProduct_endDate'] ?? null,
            $data['categoryId'] ?? null,
            $data['createdAt'],
            $data['updatedAt'],
            $data['id']
        ]);
        store_metrics_refresh_expense_summary_for_timestamp($pdo, $existingExpense['storeId'] ?? null, isset($existingExpense['date']) ? (int)$existingExpense['date'] : null);
        store_metrics_refresh_expense_summary_for_timestamp($pdo, $data['storeId'] ?? null, (int)($data['date'] ?? 0));
        store_metrics_invalidate_cache($data['storeId'] ?? ($existingExpense['storeId'] ?? null));
        echo json_encode(['success' => true]);
        break;
    case 'DELETE':
        $id = $_GET['id'] ?? null;
        if ($id) {
            $targetStoreId = null;
            $targetDate = null;
            if (!is_super_admin_claims($authClaims)) {
                $checkStmt = $pdo->prepare('SELECT storeId FROM expenses_advanced WHERE id = ? LIMIT 1');
                $checkStmt->execute([$id]);
                $targetStoreId = $checkStmt->fetchColumn();
                ensure_store_access($authClaims, $targetStoreId !== false ? (string)$targetStoreId : null);
            }
            $summaryStmt = $pdo->prepare('SELECT storeId, date FROM expenses_advanced WHERE id = ? LIMIT 1');
            $summaryStmt->execute([$id]);
            $summaryRow = $summaryStmt->fetch(PDO::FETCH_ASSOC) ?: [];
            $targetStoreId = $summaryRow['storeId'] ?? $targetStoreId;
            $targetDate = isset($summaryRow['date']) ? (int)$summaryRow['date'] : null;
            $stmt = $pdo->prepare('DELETE FROM expenses_advanced WHERE id=?');
            $stmt->execute([$id]);
            store_metrics_refresh_expense_summary_for_timestamp($pdo, $targetStoreId, $targetDate);
            store_metrics_invalidate_cache($targetStoreId);
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
