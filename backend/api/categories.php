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
        $stmt = $pdo->query('SELECT * FROM categories');
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
        $storeId = isset($data['storeId']) && $data['storeId'] !== '' ? $data['storeId'] : null;
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
        parse_str(file_get_contents('php://input'), $data);
        $sql = 'UPDATE categories SET name=?, description=?, createdAt=? WHERE id=?';
        $stmt = $pdo->prepare($sql);
        $stmt->execute([
            $data['name'],
            $data['description'],
            $data['createdAt'],
            $data['id']
        ]);
        echo json_encode(['success' => true]);
        break;
    case 'DELETE':
        $id = $_GET['id'] ?? null;
        if ($id) {
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