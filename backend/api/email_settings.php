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

function format_settings_row(array $row) {
    return [
        'id' => $row['id'] ?? null,
        'storeId' => $row['store_id'] ?? null,
        'shifts' => !empty($row['shifts']),
        'stockSignals' => !empty($row['stock_signals']),
        'stockAdjustments' => !array_key_exists('stock_adjustments', $row) || !empty($row['stock_adjustments']),
        'expenses' => !empty($row['expenses']),
        'logins' => !empty($row['logins']),
        'refunds' => !empty($row['refunds']),
        'lowStockEmails' => !array_key_exists('low_stock_emails', $row) || !empty($row['low_stock_emails']),
        'outOfStockEmails' => !array_key_exists('out_of_stock_emails', $row) || !empty($row['out_of_stock_emails']),
        'inboxShifts' => !array_key_exists('inbox_shifts', $row) || !empty($row['inbox_shifts']),
        'inboxStockSignals' => !array_key_exists('inbox_stock_signals', $row) || !empty($row['inbox_stock_signals']),
        'inboxStockAdjustments' => !array_key_exists('inbox_stock_adjustments', $row) || !empty($row['inbox_stock_adjustments']),
        'inboxExpenses' => !array_key_exists('inbox_expenses', $row) || !empty($row['inbox_expenses']),
        'inboxLogins' => !array_key_exists('inbox_logins', $row) || !empty($row['inbox_logins']),
        'inboxRefunds' => !array_key_exists('inbox_refunds', $row) || !empty($row['inbox_refunds']),
        'inboxLowStock' => !array_key_exists('inbox_low_stock', $row) || !empty($row['inbox_low_stock']),
        'inboxOutOfStock' => !array_key_exists('inbox_out_of_stock', $row) || !empty($row['inbox_out_of_stock']),
        'updatedAt' => isset($row['updated_at']) ? (int)$row['updated_at'] : (time() * 1000),
    ];
}

function default_settings_payload($storeId) {
    return [
        'id' => null,
        'storeId' => $storeId,
        'shifts' => true,
        'stockSignals' => true,
        'stockAdjustments' => true,
        'expenses' => true,
        'logins' => true,
        'refunds' => true,
        'lowStockEmails' => true,
        'outOfStockEmails' => true,
        'inboxShifts' => true,
        'inboxStockSignals' => true,
        'inboxStockAdjustments' => true,
        'inboxExpenses' => true,
        'inboxLogins' => true,
        'inboxRefunds' => true,
        'inboxLowStock' => true,
        'inboxOutOfStock' => true,
        'updatedAt' => time() * 1000,
    ];
}

try {
    switch ($method) {
        case 'GET':
            if (isset($_GET['storeId'])) {
                $stmt = $pdo->prepare("SELECT * FROM email_settings WHERE store_id = ?");
                $stmt->execute([$_GET['storeId']]);
                $result = $stmt->fetch(PDO::FETCH_ASSOC);
                
                if ($result) {
                    echo json_encode(format_settings_row($result));
                } else {
                    echo json_encode(default_settings_payload($_GET['storeId']));
                }
            } else {
                $stmt = $pdo->query("SELECT * FROM email_settings ORDER BY updated_at DESC");
                $results = $stmt->fetchAll(PDO::FETCH_ASSOC);
                
                $formatted = array_map('format_settings_row', $results);
                
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
            $stockAdjustments = isset($input['stockAdjustments']) ? (int)$input['stockAdjustments'] : 1;
            $expenses = isset($input['expenses']) ? (int)$input['expenses'] : 1;
            $logins = isset($input['logins']) ? (int)$input['logins'] : 1;
            $refunds = isset($input['refunds']) ? (int)$input['refunds'] : 1;
            $lowStockEmails = isset($input['lowStockEmails']) ? (int)$input['lowStockEmails'] : 1;
            $outOfStockEmails = isset($input['outOfStockEmails']) ? (int)$input['outOfStockEmails'] : 1;
            $inboxShifts = isset($input['inboxShifts']) ? (int)$input['inboxShifts'] : 1;
            $inboxStockSignals = isset($input['inboxStockSignals']) ? (int)$input['inboxStockSignals'] : 1;
            $inboxStockAdjustments = isset($input['inboxStockAdjustments']) ? (int)$input['inboxStockAdjustments'] : 1;
            $inboxExpenses = isset($input['inboxExpenses']) ? (int)$input['inboxExpenses'] : 1;
            $inboxLogins = isset($input['inboxLogins']) ? (int)$input['inboxLogins'] : 1;
            $inboxRefunds = isset($input['inboxRefunds']) ? (int)$input['inboxRefunds'] : 1;
            $inboxLowStock = isset($input['inboxLowStock']) ? (int)$input['inboxLowStock'] : 1;
            $inboxOutOfStock = isset($input['inboxOutOfStock']) ? (int)$input['inboxOutOfStock'] : 1;
            $updatedAt = $input['updatedAt'] ?? (time() * 1000);
            
            // Check if settings already exist for this store
            $checkStmt = $pdo->prepare("SELECT id FROM email_settings WHERE store_id = ?");
            $checkStmt->execute([$storeId]);
            $existing = $checkStmt->fetch(PDO::FETCH_ASSOC);
            
            if ($existing) {
                // Update existing record
                $stmt = $pdo->prepare("
                    UPDATE email_settings 
                    SET shifts = ?, stock_signals = ?, stock_adjustments = ?, expenses = ?, logins = ?, refunds = ?,
                        low_stock_emails = ?, out_of_stock_emails = ?,
                        inbox_shifts = ?, inbox_stock_signals = ?, inbox_stock_adjustments = ?, inbox_expenses = ?, inbox_logins = ?, inbox_refunds = ?,
                        inbox_low_stock = ?, inbox_out_of_stock = ?, updated_at = ?
                    WHERE store_id = ?
                ");
                $stmt->execute([
                    $shifts,
                    $stockSignals,
                    $stockAdjustments,
                    $expenses,
                    $logins,
                    $refunds,
                    $lowStockEmails,
                    $outOfStockEmails,
                    $inboxShifts,
                    $inboxStockSignals,
                    $inboxStockAdjustments,
                    $inboxExpenses,
                    $inboxLogins,
                    $inboxRefunds,
                    $inboxLowStock,
                    $inboxOutOfStock,
                    $updatedAt,
                    $storeId,
                ]);
                $id = $existing['id'];
            } else {
                // Insert new record
                $id = uniqid();
                $stmt = $pdo->prepare("
                    INSERT INTO email_settings (
                        id, store_id, shifts, stock_signals, stock_adjustments, expenses, logins, refunds,
                        low_stock_emails, out_of_stock_emails,
                        inbox_shifts, inbox_stock_signals, inbox_stock_adjustments, inbox_expenses, inbox_logins, inbox_refunds,
                        inbox_low_stock, inbox_out_of_stock, updated_at
                    ) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ");
                $stmt->execute([
                    $id,
                    $storeId,
                    $shifts,
                    $stockSignals,
                    $stockAdjustments,
                    $expenses,
                    $logins,
                    $refunds,
                    $lowStockEmails,
                    $outOfStockEmails,
                    $inboxShifts,
                    $inboxStockSignals,
                    $inboxStockAdjustments,
                    $inboxExpenses,
                    $inboxLogins,
                    $inboxRefunds,
                    $inboxLowStock,
                    $inboxOutOfStock,
                    $updatedAt,
                ]);
            }
            
            echo json_encode([
                'id' => $id,
                'storeId' => $storeId,
                'shifts' => (bool)$shifts,
                'stockSignals' => (bool)$stockSignals,
                'stockAdjustments' => (bool)$stockAdjustments,
                'expenses' => (bool)$expenses,
                'logins' => (bool)$logins,
                'refunds' => (bool)$refunds,
                'lowStockEmails' => (bool)$lowStockEmails,
                'outOfStockEmails' => (bool)$outOfStockEmails,
                'inboxShifts' => (bool)$inboxShifts,
                'inboxStockSignals' => (bool)$inboxStockSignals,
                'inboxStockAdjustments' => (bool)$inboxStockAdjustments,
                'inboxExpenses' => (bool)$inboxExpenses,
                'inboxLogins' => (bool)$inboxLogins,
                'inboxRefunds' => (bool)$inboxRefunds,
                'inboxLowStock' => (bool)$inboxLowStock,
                'inboxOutOfStock' => (bool)$inboxOutOfStock,
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