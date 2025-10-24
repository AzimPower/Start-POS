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
        $sql = 'SELECT * FROM shifts';
        if ($storeId) {
            $sql .= ' WHERE storeId = ?';
            $stmt = $pdo->prepare($sql);
            $stmt->execute([$storeId]);
        } else {
            $stmt = $pdo->query($sql);
        }
        $shifts = $stmt->fetchAll();
        echo json_encode($shifts);
        break;
    case 'POST':
        $data = json_decode(file_get_contents('php://input'), true);
        $sql = 'INSERT INTO shifts (id, userId, storeId, openingAmount, closingAmount, expectedAmount, difference, cashAmount, mobileMoneyAmount, otherAmount, openedAt, closedAt, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
        $stmt = $pdo->prepare($sql);
        $id = $data['id'] ?? uniqid();
        $stmt->execute([
            $id,
            $data['userId'],
            $data['storeId'],
            $data['openingAmount'],
            $data['closingAmount'] ?? null,
            $data['expectedAmount'] ?? null,
            $data['difference'] ?? null,
            isset($data['cashAmount']) ? $data['cashAmount'] : null,
            isset($data['mobileMoneyAmount']) ? $data['mobileMoneyAmount'] : null,
            isset($data['otherAmount']) ? $data['otherAmount'] : null,
            $data['openedAt'] ?? time()*1000,
            $data['closedAt'] ?? null,
            $data['status']
        ]);
        echo json_encode(['success' => true, 'id' => $id]);
        break;
    case 'PUT':
        $data = json_decode(file_get_contents('php://input'), true);
        
        // Log pour déboguer les données reçues
        error_log('Données PUT reçues: ' . json_encode($data));
        error_log('cashAmount: ' . ($data['cashAmount'] ?? 'NULL'));
        error_log('mobileMoneyAmount: ' . ($data['mobileMoneyAmount'] ?? 'NULL'));
        error_log('otherAmount: ' . ($data['otherAmount'] ?? 'NULL'));
        
        $sql = 'UPDATE shifts SET userId=?, storeId=?, openingAmount=?, closingAmount=?, expectedAmount=?, difference=?, cashAmount=?, mobileMoneyAmount=?, otherAmount=?, openedAt=?, closedAt=?, status=? WHERE id=?';
        $stmt = $pdo->prepare($sql);
        $stmt->execute([
            $data['userId'],
            $data['storeId'],
            $data['openingAmount'],
            $data['closingAmount'],
            $data['expectedAmount'],
            $data['difference'],
            isset($data['cashAmount']) ? $data['cashAmount'] : 0,
            isset($data['mobileMoneyAmount']) ? $data['mobileMoneyAmount'] : 0,
            isset($data['otherAmount']) ? $data['otherAmount'] : 0,
            $data['openedAt'],
            $data['closedAt'],
            $data['status'],
            $data['id']
        ]);
        echo json_encode(['success' => true]);
        break;
    case 'DELETE':
        $id = $_GET['id'] ?? null;
        if ($id) {
            $stmt = $pdo->prepare('DELETE FROM shifts WHERE id=?');
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