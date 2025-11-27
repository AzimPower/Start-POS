<?php
require_once '../config.php';

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'];

try {
    switch ($method) {
        case 'GET':
            if (isset($_GET['storeId'])) {
                $stmt = $pdo->prepare("SELECT * FROM email_settings WHERE store_id = ?");
                $stmt->execute([$_GET['storeId']]);
                $result = $stmt->fetch(PDO::FETCH_ASSOC);
                
                if ($result) {
                    echo json_encode([
                        'id' => $result['id'],
                        'storeId' => $result['store_id'],
                        'shifts' => (bool)$result['shifts'],
                        'stockSignals' => (bool)$result['stock_signals'],
                        'expenses' => (bool)$result['expenses'],
                        'logins' => (bool)$result['logins'],
                        'refunds' => (bool)$result['refunds'],
                        'updatedAt' => $result['updated_at']
                    ]);
                } else {
                    // Return default settings if none exist
                    echo json_encode([
                        'id' => null,
                        'storeId' => $_GET['storeId'],
                        'shifts' => true,
                        'stockSignals' => true,
                        'expenses' => true,
                        'logins' => true,
                        'refunds' => true,
                        'updatedAt' => time() * 1000
                    ]);
                }
            } else {
                $stmt = $pdo->query("SELECT * FROM email_settings ORDER BY updated_at DESC");
                $results = $stmt->fetchAll(PDO::FETCH_ASSOC);
                
                $formatted = array_map(function($row) {
                    return [
                        'id' => $row['id'],
                        'storeId' => $row['store_id'],
                        'shifts' => (bool)$row['shifts'],
                        'stockSignals' => (bool)$row['stock_signals'],
                        'expenses' => (bool)$row['expenses'],
                        'logins' => (bool)$row['logins'],
                        'refunds' => (bool)$row['refunds'],
                        'updatedAt' => $row['updated_at']
                    ];
                }, $results);
                
                echo json_encode($formatted);
            }
            break;
            
        case 'POST':
        case 'PUT':
            $input = json_decode(file_get_contents('php://input'), true);
            
            if (!$input || !isset($input['storeId'])) {
                http_response_code(400);
                echo json_encode(['error' => 'storeId is required']);
                break;
            }
            
            $storeId = $input['storeId'];
            $shifts = isset($input['shifts']) ? (int)$input['shifts'] : 1;
            $stockSignals = isset($input['stockSignals']) ? (int)$input['stockSignals'] : 1;
            $expenses = isset($input['expenses']) ? (int)$input['expenses'] : 1;
            $logins = isset($input['logins']) ? (int)$input['logins'] : 1;
            $refunds = isset($input['refunds']) ? (int)$input['refunds'] : 1;
            $updatedAt = $input['updatedAt'] ?? (time() * 1000);
            
            // Check if settings already exist for this store
            $checkStmt = $pdo->prepare("SELECT id FROM email_settings WHERE store_id = ?");
            $checkStmt->execute([$storeId]);
            $existing = $checkStmt->fetch(PDO::FETCH_ASSOC);
            
            if ($existing) {
                // Update existing record
                $stmt = $pdo->prepare("
                    UPDATE email_settings 
                    SET shifts = ?, stock_signals = ?, expenses = ?, logins = ?, refunds = ?, updated_at = ?
                    WHERE store_id = ?
                ");
                $stmt->execute([$shifts, $stockSignals, $expenses, $logins, $refunds, $updatedAt, $storeId]);
                $id = $existing['id'];
            } else {
                // Insert new record
                $id = uniqid();
                $stmt = $pdo->prepare("
                    INSERT INTO email_settings (id, store_id, shifts, stock_signals, expenses, logins, refunds, updated_at) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ");
                $stmt->execute([$id, $storeId, $shifts, $stockSignals, $expenses, $logins, $refunds, $updatedAt]);
            }
            
            echo json_encode([
                'id' => $id,
                'storeId' => $storeId,
                'shifts' => (bool)$shifts,
                'stockSignals' => (bool)$stockSignals,
                'expenses' => (bool)$expenses,
                'logins' => (bool)$logins,
                'refunds' => (bool)$refunds,
                'updatedAt' => $updatedAt
            ]);
            break;
            
        case 'DELETE':
            if (isset($_GET['id'])) {
                $stmt = $pdo->prepare("DELETE FROM email_settings WHERE id = ?");
                $stmt->execute([$_GET['id']]);
                echo json_encode(['success' => true]);
            } else {
                http_response_code(400);
                echo json_encode(['error' => 'ID is required']);
            }
            break;
            
        default:
            http_response_code(405);
            echo json_encode(['error' => 'Method not allowed']);
            break;
    }
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Database error: ' . $e->getMessage()]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Server error: ' . $e->getMessage()]);
}
?>