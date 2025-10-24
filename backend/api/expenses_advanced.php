<?php
// Afficher les erreurs PHP pour le debug
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);
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
        $stmt = $pdo->query('SELECT * FROM expenses_advanced');
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
        
        echo json_encode($expenses);
        break;
    case 'POST':
        $data = json_decode(file_get_contents('php://input'), true);
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
        echo json_encode(['success' => true, 'id' => $id]);
        break;
    case 'PUT':
        $data = json_decode(file_get_contents('php://input'), true);
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
        echo json_encode(['success' => true]);
        break;
    case 'DELETE':
        $id = $_GET['id'] ?? null;
        if ($id) {
            $stmt = $pdo->prepare('DELETE FROM expenses_advanced WHERE id=?');
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