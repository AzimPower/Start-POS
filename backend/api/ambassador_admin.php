<?php
require_once '../config.php';
require_once __DIR__ . '/_bootstrap.php';
require_once __DIR__ . '/_ambassadors.php';

init_api_headers(['GET', 'PUT', 'OPTIONS']);
header('Cache-Control: no-cache, no-store, must-revalidate');
header('Pragma: no-cache');
header('Expires: 0');

$claims = require_auth();
ensure_ambassador_schema($pdo);

if (!is_super_admin_claims($claims)) {
    http_response_code(403);
    echo json_encode(['success' => false, 'error' => 'Only super admin can manage ambassadors']);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'];

try {
    if ($method === 'GET') {
        $ambassadorsStmt = $pdo->query("
            SELECT id, username, phone, email, promoCode, commissionRate, withdrawalPhone, createdAt
            FROM users
            WHERE role = 'ambassador'
            ORDER BY createdAt DESC
        ");
        $ambassadors = $ambassadorsStmt->fetchAll(PDO::FETCH_ASSOC);

        $storesCountStmt = $pdo->query("SELECT COUNT(*) FROM stores WHERE ambassadorUserId IS NOT NULL AND ambassadorUserId <> ''");
        $storesLinkedCount = (int)$storesCountStmt->fetchColumn();

        $commissionsTotalStmt = $pdo->query("SELECT IFNULL(SUM(commissionAmount), 0) FROM ambassador_commissions");
        $commissionsTotal = (float)$commissionsTotalStmt->fetchColumn();

        $pendingTotalStmt = $pdo->query("SELECT IFNULL(SUM(amount), 0) FROM ambassador_withdrawals WHERE status = 'pending'");
        $pendingWithdrawalsTotal = (float)$pendingTotalStmt->fetchColumn();

        $paidTotalStmt = $pdo->query("SELECT IFNULL(SUM(amount), 0) FROM ambassador_withdrawals WHERE status IN ('approved', 'paid')");
        $paidWithdrawalsTotal = (float)$paidTotalStmt->fetchColumn();

        $ambassadorRows = [];
        $availableBalancesTotal = 0.0;

        $storesByAmbassadorStmt = $pdo->prepare('SELECT id, name, active, subscriptionEnd FROM stores WHERE ambassadorUserId = ? ORDER BY createdAt DESC');
        $commissionsByAmbassadorStmt = $pdo->prepare('SELECT * FROM ambassador_commissions WHERE ambassadorUserId = ? ORDER BY createdAt DESC LIMIT 10');

        foreach ($ambassadors as $ambassador) {
            $ambassadorId = (string)$ambassador['id'];
            $balance = calculate_ambassador_available_balance($pdo, $ambassadorId);

            $storesByAmbassadorStmt->execute([$ambassadorId]);
            $stores = $storesByAmbassadorStmt->fetchAll(PDO::FETCH_ASSOC);

            $commissionsByAmbassadorStmt->execute([$ambassadorId]);
            $recentCommissions = $commissionsByAmbassadorStmt->fetchAll(PDO::FETCH_ASSOC);

            $availableBalancesTotal += (float)$balance['availableBalance'];

            $ambassadorRows[] = [
                'id' => $ambassadorId,
                'username' => $ambassador['username'],
                'phone' => $ambassador['phone'],
                'email' => $ambassador['email'],
                'promoCode' => $ambassador['promoCode'],
                'commissionRate' => isset($ambassador['commissionRate']) ? (float)$ambassador['commissionRate'] : 50.0,
                'withdrawalPhone' => $ambassador['withdrawalPhone'],
                'createdAt' => isset($ambassador['createdAt']) ? (int)$ambassador['createdAt'] : null,
                'stats' => [
                    'totalRevenue' => (float)$balance['totalRevenue'],
                    'pendingWithdrawals' => (float)$balance['pendingWithdrawals'],
                    'paidWithdrawals' => (float)$balance['paidWithdrawals'],
                    'availableBalance' => (float)$balance['availableBalance'],
                    'storesCount' => count($stores),
                    'commissionsCount' => count($recentCommissions),
                ],
                'stores' => $stores,
                'recentCommissions' => $recentCommissions,
            ];
        }

        $withdrawalsStmt = $pdo->query("
            SELECT
                w.*,
                u.username AS ambassadorUsername,
                u.phone AS ambassadorPhone,
                u.promoCode AS ambassadorPromoCode
            FROM ambassador_withdrawals w
            INNER JOIN users u ON u.id = w.ambassadorUserId
            ORDER BY w.requestedAt DESC
            LIMIT 300
        ");
        $withdrawals = $withdrawalsStmt->fetchAll(PDO::FETCH_ASSOC);

        echo json_encode([
            'success' => true,
            'summary' => [
                'ambassadorsCount' => count($ambassadors),
                'storesLinkedCount' => $storesLinkedCount,
                'commissionsTotal' => $commissionsTotal,
                'pendingWithdrawalsTotal' => $pendingWithdrawalsTotal,
                'paidWithdrawalsTotal' => $paidWithdrawalsTotal,
                'availableBalancesTotal' => $availableBalancesTotal,
                'pendingWithdrawalsCount' => count(array_filter($withdrawals, function ($item) {
                    return (string)($item['status'] ?? '') === 'pending';
                })),
            ],
            'ambassadors' => $ambassadorRows,
            'withdrawals' => $withdrawals,
        ]);
        exit;
    }

    if ($method === 'PUT') {
        $data = json_decode(file_get_contents('php://input'), true);
        if (!is_array($data) || empty($data['id'])) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Withdrawal id is required']);
            exit;
        }

        $allowedStatuses = ['pending', 'approved', 'rejected', 'paid'];
        $nextStatus = trim((string)($data['status'] ?? ''));
        if (!in_array($nextStatus, $allowedStatuses, true)) {
            http_response_code(422);
            echo json_encode(['success' => false, 'error' => 'Invalid withdrawal status']);
            exit;
        }

        $note = trim((string)($data['note'] ?? ''));
        $now = (int)(microtime(true) * 1000);

        $lookupStmt = $pdo->prepare('SELECT id FROM ambassador_withdrawals WHERE id = ? LIMIT 1');
        $lookupStmt->execute([$data['id']]);
        if (!$lookupStmt->fetch(PDO::FETCH_ASSOC)) {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'Withdrawal not found']);
            exit;
        }

        $updateStmt = $pdo->prepare('
            UPDATE ambassador_withdrawals
            SET status = ?, note = ?, processedAt = ?, processedByUserId = ?
            WHERE id = ?
        ');
        $updateStmt->execute([
            $nextStatus,
            $note !== '' ? $note : null,
            $now,
            (string)($claims['sub'] ?? ''),
            $data['id'],
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
