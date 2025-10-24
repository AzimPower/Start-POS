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
        $stmt = $pdo->query('SELECT * FROM stock_signals');
        $signals = $stmt->fetchAll();
        echo json_encode($signals);
        break;
    case 'POST':
        $data = json_decode(file_get_contents('php://input'), true);
        $sql = 'INSERT INTO stock_signals (id, expenseId, productId, userId, storeId, startDate, endDate, purchaseAmount, quantityBought, quantitySold, revenue, margin, realMargin, marginPercentage, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
        $stmt = $pdo->prepare($sql);
        $id = $data['id'] ?? uniqid();
        $stmt->execute([
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
        echo json_encode(['success' => true, 'id' => $id]);
        break;
    case 'PUT':
        $data = json_decode(file_get_contents('php://input'), true);
        $sql = 'UPDATE stock_signals SET expenseId=?, productId=?, userId=?, storeId=?, startDate=?, endDate=?, purchaseAmount=?, quantityBought=?, quantitySold=?, revenue=?, margin=?, realMargin=?, marginPercentage=?, createdAt=? WHERE id=?';
        $stmt = $pdo->prepare($sql);
        $stmt->execute([
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
        echo json_encode(['success' => true]);
        break;
    case 'DELETE':
        $id = $_GET['id'] ?? null;
        if ($id) {
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