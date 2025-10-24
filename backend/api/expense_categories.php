<?php
// Headers CORS
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
header('Content-Type: application/json');

// Gestion des requêtes OPTIONS (preflight)
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

require_once '../config.php';

$method = $_SERVER['REQUEST_METHOD'];

switch ($method) {
    case 'GET':
        $storeId = $_GET['storeId'] ?? null;
        $sql = 'SELECT * FROM expense_categories';
        if ($storeId) {
            $sql .= ' WHERE storeId = ?';
            $stmt = $pdo->prepare($sql);
            $stmt->execute([$storeId]);
        } else {
            $stmt = $pdo->query($sql);
        }
        $categories = $stmt->fetchAll();
        
        // Décoder le champ productIds pour chaque catégorie
        foreach ($categories as &$category) {
            if (isset($category['productIds']) && $category['productIds']) {
                $category['productIds'] = json_decode($category['productIds'], true);
            } else {
                $category['productIds'] = [];
            }
        }
        
        echo json_encode($categories);
        break;
    case 'POST':
        $data = json_decode(file_get_contents('php://input'), true);
        $sql = 'INSERT INTO expense_categories (id, name, type, description, storeId, active, productIds, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)';
        $stmt = $pdo->prepare($sql);
        $id = $data['id'] ?? uniqid();
        $stmt->execute([
            $id,
            $data['name'],
            $data['type'],
            $data['description'],
            $data['storeId'],
            $data['active'] ?? true,
            isset($data['productIds']) && is_array($data['productIds']) ? json_encode($data['productIds']) : null,
            $data['createdAt'] ?? time()*1000
        ]);
        echo json_encode(['success' => true, 'id' => $id]);
        break;
    case 'PUT':
        $data = json_decode(file_get_contents('php://input'), true);
        $sql = 'UPDATE expense_categories SET name=?, type=?, description=?, storeId=?, active=?, productIds=?, createdAt=? WHERE id=?';
        $stmt = $pdo->prepare($sql);
        $stmt->execute([
            $data['name'],
            $data['type'],
            $data['description'],
            $data['storeId'],
            $data['active'],
            isset($data['productIds']) && is_array($data['productIds']) ? json_encode($data['productIds']) : null,
            $data['createdAt'],
            $data['id']
        ]);
        echo json_encode(['success' => true]);
        break;
    case 'DELETE':
        $id = $_GET['id'] ?? null;
        if ($id) {
            $stmt = $pdo->prepare('DELETE FROM expense_categories WHERE id=?');
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