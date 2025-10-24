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
        // Récupérer tous les utilisateurs
        $stmt = $pdo->query('SELECT id, username, phone, password, pin, role, storeId, active, createdAt FROM users');
        $users = $stmt->fetchAll();
        echo json_encode($users);
        break;
    case 'POST':
        // Ajouter un utilisateur
        $data = json_decode(file_get_contents('php://input'), true);
        $sql = 'INSERT INTO users (id, username, phone, password, pin, role, storeId, active, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)';
        $stmt = $pdo->prepare($sql);
        $id = $data['id'] ?? uniqid();
        $stmt->execute([
            $id,
            $data['username'],
            $data['phone'],
            $data['password'],
            $data['pin'] ?? null,
            $data['role'],
            $data['storeId'],
            $data['active'] ?? true,
            $data['createdAt'] ?? time()*1000
        ]);
        echo json_encode(['success' => true, 'id' => $id]);
        break;
    case 'PUT':
        // Modifier un utilisateur
        $data = json_decode(file_get_contents('php://input'), true);
        $sql = 'UPDATE users SET username=?, phone=?, password=?, pin=?, role=?, storeId=?, active=?, createdAt=? WHERE id=?';
        $stmt = $pdo->prepare($sql);
        $stmt->execute([
            $data['username'],
            $data['phone'],
            $data['password'],
            $data['pin'] ?? null,
            $data['role'],
            $data['storeId'],
            $data['active'],
            $data['createdAt'],
            $data['id']
        ]);
        echo json_encode(['success' => true]);
        break;
    case 'DELETE':
        // Supprimer un utilisateur
        $id = $_GET['id'] ?? null;
        if ($id) {
            $stmt = $pdo->prepare('DELETE FROM users WHERE id=?');
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