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
        $sql = 'SELECT * FROM customers';
        if ($storeId) {
            $sql .= ' WHERE storeId = ?';
            $stmt = $pdo->prepare($sql);
            $stmt->execute([$storeId]);
        } else {
            $stmt = $pdo->query($sql);
        }
        $customers = $stmt->fetchAll();
        echo json_encode($customers);
        break;
    case 'POST':
        $data = json_decode(file_get_contents('php://input'), true);
        $data['storeId'] = ensure_store_access($authClaims, $data['storeId'] ?? null);
        $sql = 'INSERT INTO customers (id, name, phone, email, address, notes, balance, createdAt, storeId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)';
        $stmt = $pdo->prepare($sql);
        $id = $data['id'] ?? uniqid();
        $stmt->execute([
            $id,
            $data['name'],
            $data['phone'],
            $data['email'],
            $data['address'],
            $data['notes'],
            $data['balance'] ?? 0,
            $data['createdAt'] ?? time()*1000,
            $data['storeId'] ?? null
        ]);
        echo json_encode(['success' => true, 'id' => $id]);
        break;
    case 'PUT':
        $data = json_decode(file_get_contents('php://input'), true);
        $data['storeId'] = ensure_store_access($authClaims, $data['storeId'] ?? null);
        $sql = 'UPDATE customers SET name=?, phone=?, email=?, address=?, notes=?, balance=?, createdAt=?, storeId=? WHERE id=?';
        $stmt = $pdo->prepare($sql);
        $stmt->execute([
            $data['name'],
            $data['phone'],
            $data['email'],
            $data['address'],
            $data['notes'],
            $data['balance'],
            $data['createdAt'],
            $data['storeId'],
            $data['id']
        ]);
        echo json_encode(['success' => true]);
        break;
    case 'DELETE':
        $id = $_GET['id'] ?? null;
        if ($id) {
            if (!is_super_admin_claims($authClaims)) {
                $checkStmt = $pdo->prepare('SELECT storeId FROM customers WHERE id = ? LIMIT 1');
                $checkStmt->execute([$id]);
                $targetStoreId = $checkStmt->fetchColumn();
                ensure_store_access($authClaims, $targetStoreId !== false ? (string)$targetStoreId : null);
            }
            $stmt = $pdo->prepare('DELETE FROM customers WHERE id=?');
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
