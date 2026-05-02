<?php
// Headers CORS
require_once './_bootstrap.php';
init_api_headers();
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
        $sql = 'SELECT * FROM categories';
        if ($storeId) {
            $sql .= ' WHERE storeId = ?';
            $stmt = $pdo->prepare($sql);
            $stmt->execute([$storeId]);
        } else {
            $stmt = $pdo->query($sql);
        }
        $categories = $stmt->fetchAll();
        echo json_encode($categories);
        break;
    case 'POST':
        $data = json_decode(file_get_contents('php://input'), true);
        $id = $data['id'] ?? uniqid();
        $name = $data['name'] ?? '';
        $description = $data['description'] ?? null;
        $createdAt = $data['createdAt'] ?? time()*1000;
        // storeId: si non fourni ou vide, NULL (catégorie par défaut), sinon valeur reçue
        $storeId = isset($data['storeId']) && $data['storeId'] !== '' ? ensure_store_access($authClaims, $data['storeId']) : ensure_store_access($authClaims, null);
        $sql = 'INSERT INTO categories (id, name, description, createdAt, storeId) VALUES (?, ?, ?, ?, ?)';
        $stmt = $pdo->prepare($sql);
        $stmt->execute([
            $id,
            $name,
            $description,
            $createdAt,
            $storeId
        ]);
        echo json_encode(['success' => true, 'id' => $id, 'storeId' => $storeId]);
        break;
    case 'PUT':
        $data = json_decode(file_get_contents('php://input'), true);
        if (!is_array($data)) {
            parse_str(file_get_contents('php://input'), $data);
        }
        $storeId = ensure_store_access($authClaims, $data['storeId'] ?? null);
        $sql = 'UPDATE categories SET name=?, description=?, createdAt=?, storeId=? WHERE id=?';
        $stmt = $pdo->prepare($sql);
        $stmt->execute([
            $data['name'],
            $data['description'],
            $data['createdAt'],
            $storeId,
            $data['id']
        ]);
        echo json_encode(['success' => true]);
        break;
    case 'DELETE':
        $id = $_GET['id'] ?? null;
        if ($id) {
            if (!is_super_admin_claims($authClaims)) {
                $checkStmt = $pdo->prepare('SELECT storeId FROM categories WHERE id = ? LIMIT 1');
                $checkStmt->execute([$id]);
                $targetStoreId = $checkStmt->fetchColumn();
                ensure_store_access($authClaims, $targetStoreId !== false ? (string)$targetStoreId : null);
            }
            $stmt = $pdo->prepare('DELETE FROM categories WHERE id=?');
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
