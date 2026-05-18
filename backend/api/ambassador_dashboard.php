<?php
require_once '../config.php';
require_once __DIR__ . '/_bootstrap.php';
require_once __DIR__ . '/_ambassadors.php';

init_api_headers(['GET', 'POST', 'OPTIONS']);
header('Cache-Control: no-cache, no-store, must-revalidate');
header('Pragma: no-cache');
header('Expires: 0');

$claims = require_auth();
ensure_ambassador_schema($pdo);

function resolve_ambassador_id(array $claims): string {
    $role = (string)($claims['role'] ?? '');
    if ($role === 'ambassador') {
        return (string)($claims['sub'] ?? '');
    }

    if ($role === 'super_admin') {
        $queryId = trim((string)($_GET['ambassadorUserId'] ?? ''));
        if ($queryId !== '') {
            return $queryId;
        }
    }

    http_response_code(403);
    echo json_encode(['success' => false, 'error' => 'Access denied']);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'];
$ambassadorUserId = resolve_ambassador_id($claims);

try {
    if ($method === 'GET') {
        $userStmt = $pdo->prepare('SELECT id, username, phone, email, promoCode, commissionRate, withdrawalPhone FROM users WHERE id = ? AND role = ? LIMIT 1');
        $userStmt->execute([$ambassadorUserId, 'ambassador']);
        $ambassador = $userStmt->fetch(PDO::FETCH_ASSOC);
        if (!$ambassador) {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'Ambassador not found']);
            exit;
        }

        $balance = calculate_ambassador_available_balance($pdo, $ambassadorUserId);

        $storesStmt = $pdo->prepare('SELECT id, name, address, active, subscriptionEnd, lastPayment FROM stores WHERE ambassadorUserId = ? ORDER BY createdAt DESC');
        $storesStmt->execute([$ambassadorUserId]);
        $stores = $storesStmt->fetchAll(PDO::FETCH_ASSOC);

        $commissionsStmt = $pdo->prepare('SELECT * FROM ambassador_commissions WHERE ambassadorUserId = ? ORDER BY createdAt DESC LIMIT 100');
        $commissionsStmt->execute([$ambassadorUserId]);
        $commissions = $commissionsStmt->fetchAll(PDO::FETCH_ASSOC);

        $withdrawalsStmt = $pdo->prepare('SELECT * FROM ambassador_withdrawals WHERE ambassadorUserId = ? ORDER BY requestedAt DESC LIMIT 100');
        $withdrawalsStmt->execute([$ambassadorUserId]);
        $withdrawals = $withdrawalsStmt->fetchAll(PDO::FETCH_ASSOC);

        echo json_encode([
            'success' => true,
            'ambassador' => [
                'id' => $ambassador['id'],
                'username' => $ambassador['username'],
                'phone' => $ambassador['phone'],
                'email' => $ambassador['email'],
                'promoCode' => $ambassador['promoCode'],
                'commissionRate' => isset($ambassador['commissionRate']) ? (float)$ambassador['commissionRate'] : 50.0,
                'withdrawalPhone' => $ambassador['withdrawalPhone'],
            ],
            'stats' => [
                'totalRevenue' => $balance['totalRevenue'],
                'pendingWithdrawals' => $balance['pendingWithdrawals'],
                'paidWithdrawals' => $balance['paidWithdrawals'],
                'availableBalance' => $balance['availableBalance'],
                'storesCount' => count($stores),
                'commissionsCount' => count($commissions),
            ],
            'stores' => $stores,
            'commissions' => $commissions,
            'withdrawals' => $withdrawals,
        ]);
        exit;
    }

    if ($method === 'POST') {
        if ((string)($claims['role'] ?? '') !== 'ambassador') {
            http_response_code(403);
            echo json_encode(['success' => false, 'error' => 'Only ambassadors can request withdrawals']);
            exit;
        }

        $data = json_decode(file_get_contents('php://input'), true);
        if (!is_array($data)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Invalid JSON payload']);
            exit;
        }

        $amount = isset($data['amount']) ? (float)$data['amount'] : 0;
        $phone = trim((string)($data['phone'] ?? ''));
        $note = trim((string)($data['note'] ?? ''));
        if ($amount <= 0) {
            http_response_code(422);
            echo json_encode(['success' => false, 'error' => 'Amount must be greater than zero']);
            exit;
        }

        $balance = calculate_ambassador_available_balance($pdo, $ambassadorUserId);
        if ($amount > $balance['availableBalance']) {
            http_response_code(422);
            echo json_encode(['success' => false, 'error' => 'Insufficient available balance']);
            exit;
        }

        $insert = $pdo->prepare(
            'INSERT INTO ambassador_withdrawals (id, ambassadorUserId, amount, phone, status, note, requestedAt, processedAt, processedByUserId)
             VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL)'
        );
        $insert->execute([
            uniqid('ambw_', true),
            $ambassadorUserId,
            $amount,
            $phone !== '' ? $phone : null,
            'pending',
            $note !== '' ? $note : null,
            (int)(microtime(true) * 1000),
        ]);

        echo json_encode(['success' => true]);
        exit;
    }

    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
