<?php
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
header('Content-Type: application/json');
header('Cache-Control: no-cache, no-store, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('Expires: 0');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

require_once '../config.php';

$method = $_SERVER['REQUEST_METHOD'];

function read_json_body() {
    $raw = file_get_contents('php://input');
    if (!$raw) {
        return [];
    }

    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function json_error($message, $status = 400) {
    http_response_code($status);
    echo json_encode(['success' => false, 'error' => $message]);
    exit;
}

function generate_entity_id($prefix) {
    return uniqid($prefix, true);
}

function normalize_store_ids($value) {
    if ($value === null || $value === '') {
        return [];
    }

    if (is_array($value)) {
        $items = $value;
    } else {
        $decoded = json_decode($value, true);
        if (is_array($decoded)) {
            $items = $decoded;
        } else {
            $items = explode(',', (string)$value);
        }
    }

    $normalized = [];
    foreach ($items as $item) {
        $trimmed = trim((string)$item);
        if ($trimmed !== '') {
            $normalized[$trimmed] = true;
        }
    }

    return array_keys($normalized);
}

function require_active_sender(PDO $pdo, $senderUserId) {
    if (!$senderUserId) {
        json_error('senderUserId requis');
    }

    $stmt = $pdo->prepare('SELECT id, role, active, storeId FROM users WHERE id = ? LIMIT 1');
    $stmt->execute([$senderUserId]);
    $sender = $stmt->fetch();

    if (!$sender || (int)($sender['active'] ?? 0) !== 1) {
        json_error('Expéditeur introuvable ou inactif', 403);
    }

    return $sender;
}

function get_user_store_ids(PDO $pdo, $userId) {
    $storeIds = [];

    $stmt = $pdo->prepare('SELECT storeId FROM users WHERE id = ? LIMIT 1');
    $stmt->execute([$userId]);
    $user = $stmt->fetch();
    if ($user && !empty($user['storeId'])) {
        $storeIds[] = trim((string)$user['storeId']);
    }

    $mappingStmt = $pdo->prepare('SELECT storeId FROM user_stores WHERE userId = ?');
    $mappingStmt->execute([$userId]);
    foreach ($mappingStmt->fetchAll(PDO::FETCH_COLUMN) as $storeId) {
        $trimmed = trim((string)$storeId);
        if ($trimmed !== '') {
            $storeIds[] = $trimmed;
        }
    }

    return array_values(array_unique($storeIds));
}

function sender_can_target_store(PDO $pdo, array $sender, $targetStoreId) {
    if (($sender['role'] ?? '') === 'super_admin') {
        return true;
    }

    return in_array((string)$targetStoreId, get_user_store_ids($pdo, $sender['id']), true);
}

function get_store_admin_recipients(PDO $pdo, $storeId) {
    if (!$storeId) {
        return [];
    }

    $stmt = $pdo->prepare(
        "SELECT DISTINCT u.id
         FROM users u
         LEFT JOIN user_stores us ON us.userId = u.id
         WHERE u.active = 1
           AND u.role = 'admin'
           AND (u.storeId = ? OR us.storeId = ?)"
    );
    $stmt->execute([$storeId, $storeId]);

    return array_values(array_unique(array_filter(array_map('strval', $stmt->fetchAll(PDO::FETCH_COLUMN)))));
}

function build_scoped_notification_id($baseId, $targetUserId) {
    return 'notif_' . substr(md5((string)$baseId . '|' . (string)$targetUserId), 0, 30);
}

function create_store_admin_notifications(PDO $pdo, array $sender, array $payload, $baseId, $createdAt) {
    $recipientIds = get_store_admin_recipients($pdo, $payload['targetStoreId']);
    if (empty($recipientIds)) {
        return [];
    }

    $stmt = $pdo->prepare(
        'INSERT INTO notifications (id, title, message, type, targetType, targetRole, targetStoreId, targetUserId, senderUserId, active, createdAt, expiresAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
         ON DUPLICATE KEY UPDATE
            title = VALUES(title),
            message = VALUES(message),
            type = VALUES(type),
            targetType = VALUES(targetType),
            targetRole = VALUES(targetRole),
            targetStoreId = VALUES(targetStoreId),
            targetUserId = VALUES(targetUserId),
            senderUserId = VALUES(senderUserId),
            active = VALUES(active),
            createdAt = VALUES(createdAt),
            expiresAt = VALUES(expiresAt)'
    );

    $createdIds = [];
    foreach ($recipientIds as $recipientId) {
        $notificationId = build_scoped_notification_id($baseId, $recipientId);
        $stmt->execute([
            $notificationId,
            $payload['title'],
            $payload['message'],
            $payload['type'],
            'user',
            null,
            $payload['targetStoreId'],
            $recipientId,
            $sender['id'],
            $createdAt,
            $payload['expiresAt'],
        ]);
        $createdIds[] = $notificationId;
    }

    return $createdIds;
}

function require_super_admin_sender(PDO $pdo, $senderUserId) {
    $sender = require_active_sender($pdo, $senderUserId);

    if (($sender['role'] ?? '') !== 'super_admin') {
        json_error('Seul le super admin peut envoyer des notifications globales', 403);
    }

    return $sender;
}

function require_notification_sender(PDO $pdo, $notificationId, $senderUserId) {
    require_super_admin_sender($pdo, $senderUserId);

    $stmt = $pdo->prepare('SELECT id, senderUserId, active FROM notifications WHERE id = ? LIMIT 1');
    $stmt->execute([$notificationId]);
    $notification = $stmt->fetch();

    if (!$notification) {
        json_error('Notification introuvable', 404);
    }

    if (($notification['senderUserId'] ?? '') !== $senderUserId) {
        json_error('Vous ne pouvez supprimer que vos propres notifications', 403);
    }

    return $notification;
}

function validate_notification_payload($data) {
    $allowedTypes = ['info', 'success', 'warning', 'critical'];
    $allowedTargets = ['all', 'role', 'store', 'user', 'store_admins'];
    $allowedRoles = ['super_admin', 'admin', 'cashier', 'manager'];

    $title = trim((string)($data['title'] ?? ''));
    $message = trim((string)($data['message'] ?? ''));
    $type = trim((string)($data['type'] ?? 'info'));
    $targetType = trim((string)($data['targetType'] ?? 'all'));
    $targetRole = isset($data['targetRole']) ? trim((string)$data['targetRole']) : null;
    $targetStoreId = isset($data['targetStoreId']) ? trim((string)$data['targetStoreId']) : null;
    $targetUserId = isset($data['targetUserId']) ? trim((string)$data['targetUserId']) : null;
    $expiresAt = isset($data['expiresAt']) && $data['expiresAt'] !== '' ? (int)$data['expiresAt'] : null;

    if ($title === '') {
        json_error('Le titre est requis');
    }

    if ($message === '') {
        json_error('Le message est requis');
    }

    if (!in_array($type, $allowedTypes, true)) {
        json_error('Type de notification invalide');
    }

    if (!in_array($targetType, $allowedTargets, true)) {
        json_error('Cible de notification invalide');
    }

    if ($targetType === 'role') {
        if (!$targetRole || !in_array($targetRole, $allowedRoles, true)) {
            json_error('Rôle cible invalide');
        }
        $targetStoreId = null;
        $targetUserId = null;
    }

    if ($targetType === 'store') {
        if (!$targetStoreId) {
            json_error('Le magasin cible est requis');
        }
        $targetRole = null;
        $targetUserId = null;
    }

    if ($targetType === 'store_admins') {
        if (!$targetStoreId) {
            json_error('Le magasin cible est requis');
        }
        $targetRole = null;
        $targetUserId = null;
    }

    if ($targetType === 'user') {
        if (!$targetUserId) {
            json_error('L\'utilisateur cible est requis');
        }
        $targetRole = null;
        $targetStoreId = null;
    }

    if ($targetType === 'all') {
        $targetRole = null;
        $targetStoreId = null;
        $targetUserId = null;
    }

    return [
        'title' => $title,
        'message' => $message,
        'type' => $type,
        'targetType' => $targetType,
        'targetRole' => $targetRole,
        'targetStoreId' => $targetStoreId,
        'targetUserId' => $targetUserId,
        'expiresAt' => $expiresAt,
    ];
}

try {
    switch ($method) {
        case 'GET':
            $view = $_GET['view'] ?? 'inbox';
            $limit = isset($_GET['limit']) ? max(1, min(200, (int)$_GET['limit'])) : 100;

            if ($view === 'created') {
                $senderUserId = trim((string)($_GET['senderUserId'] ?? ''));
                require_super_admin_sender($pdo, $senderUserId);

                $stmt = $pdo->prepare(
                    'SELECT n.*, u.username AS senderUsername,
                        (SELECT COUNT(*) FROM notification_reads nr WHERE nr.notificationId = n.id) AS readCount
                     FROM notifications n
                     LEFT JOIN users u ON u.id = n.senderUserId
                     WHERE n.senderUserId = ? AND n.active = 1
                     ORDER BY n.createdAt DESC
                     LIMIT ?'
                );
                $stmt->bindValue(1, $senderUserId);
                $stmt->bindValue(2, $limit, PDO::PARAM_INT);
                $stmt->execute();
                echo json_encode($stmt->fetchAll());
                break;
            }

            $userId = trim((string)($_GET['userId'] ?? ''));
            $role = trim((string)($_GET['role'] ?? ''));
            $storeId = trim((string)($_GET['storeId'] ?? ''));
            $storeIds = normalize_store_ids($_GET['storeIds'] ?? null);
            $now = (int)round(microtime(true) * 1000);

            if ($userId === '' || $role === '') {
                json_error('userId et role sont requis');
            }

            if ($storeId !== '') {
                $storeIds[] = $storeId;
                $storeIds = array_values(array_unique($storeIds));
            }

            $params = [$userId, $userId, $now, $role, $userId];
            $visibility = [
                "n.targetType = 'all'",
                "(n.targetType = 'role' AND n.targetRole = ?)",
                "(n.targetType = 'user' AND n.targetUserId = ?)"
            ];

            if (!empty($storeIds)) {
                $placeholders = implode(',', array_fill(0, count($storeIds), '?'));
                $visibility[] = "(n.targetType = 'store' AND n.targetStoreId IN ($placeholders))";
                $params = array_merge($params, $storeIds);
            }

                        $sql = 'SELECT n.*, nr.readAt, nd.dismissedAt, u.username AS senderUsername, u.role AS senderRole
                    FROM notifications n
                    LEFT JOIN notification_reads nr ON nr.notificationId = n.id AND nr.userId = ?
                                        LEFT JOIN notification_dismissals nd ON nd.notificationId = n.id AND nd.userId = ?
                    LEFT JOIN users u ON u.id = n.senderUserId
                    WHERE n.active = 1
                                            AND nd.id IS NULL
                      AND (n.expiresAt IS NULL OR n.expiresAt >= ?)
                      AND (' . implode(' OR ', $visibility) . ')
                    ORDER BY n.createdAt DESC
                    LIMIT ?';

            $stmt = $pdo->prepare($sql);
            $bindIndex = 1;
            foreach ($params as $value) {
                $stmt->bindValue($bindIndex++, $value);
            }
            $stmt->bindValue($bindIndex, $limit, PDO::PARAM_INT);
            $stmt->execute();

            $notifications = $stmt->fetchAll();
            foreach ($notifications as &$notification) {
                $notification['isRead'] = !empty($notification['readAt']);
            }

            echo json_encode($notifications);
            break;

        case 'POST':
            $data = read_json_body();
            $senderUserId = trim((string)($data['senderUserId'] ?? ''));
            $sender = require_active_sender($pdo, $senderUserId);
            $payload = validate_notification_payload($data);

            if ($payload['targetType'] === 'store_admins') {
                if (!sender_can_target_store($pdo, $sender, $payload['targetStoreId'])) {
                    json_error('Vous ne pouvez notifier que les admins de votre magasin', 403);
                }

                $baseId = trim((string)($data['id'] ?? ''));
                if ($baseId === '') {
                    $baseId = generate_entity_id('notif_');
                }
                $createdAt = isset($data['createdAt']) ? (int)$data['createdAt'] : (int)round(microtime(true) * 1000);
                $createdIds = create_store_admin_notifications($pdo, $sender, $payload, $baseId, $createdAt);

                echo json_encode([
                    'success' => true,
                    'id' => $baseId,
                    'ids' => $createdIds,
                    'count' => count($createdIds),
                ]);
                break;
            }

            if (($sender['role'] ?? '') !== 'super_admin') {
                json_error('Seul le super admin peut envoyer des notifications globales', 403);
            }

            $id = $data['id'] ?? generate_entity_id('notif_');
            $createdAt = isset($data['createdAt']) ? (int)$data['createdAt'] : (int)round(microtime(true) * 1000);

            $stmt = $pdo->prepare(
                'INSERT INTO notifications (id, title, message, type, targetType, targetRole, targetStoreId, targetUserId, senderUserId, active, createdAt, expiresAt)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)'
            );
            $stmt->execute([
                $id,
                $payload['title'],
                $payload['message'],
                $payload['type'],
                $payload['targetType'],
                $payload['targetRole'],
                $payload['targetStoreId'],
                $payload['targetUserId'],
                $sender['id'],
                $createdAt,
                $payload['expiresAt'],
            ]);

            echo json_encode(['success' => true, 'id' => $id]);
            break;

        case 'PUT':
            $data = read_json_body();
            $action = trim((string)($data['action'] ?? ''));

            if ($action === 'mark_read') {
                $userId = trim((string)($data['userId'] ?? ''));
                $notificationId = trim((string)($data['notificationId'] ?? ''));
                if ($userId === '' || $notificationId === '') {
                    json_error('userId et notificationId sont requis');
                }

                $exists = $pdo->prepare('SELECT id FROM notifications WHERE id = ? LIMIT 1');
                $exists->execute([$notificationId]);
                if (!$exists->fetch()) {
                    json_error('Notification introuvable', 404);
                }

                $stmt = $pdo->prepare(
                    'INSERT INTO notification_reads (id, notificationId, userId, readAt)
                     VALUES (?, ?, ?, ?)
                     ON DUPLICATE KEY UPDATE readAt = VALUES(readAt)'
                );
                $stmt->execute([
                    generate_entity_id('read_'),
                    $notificationId,
                    $userId,
                    (int)round(microtime(true) * 1000),
                ]);

                echo json_encode(['success' => true]);
                break;
            }

            if ($action === 'delete') {
                $senderUserId = trim((string)($data['senderUserId'] ?? ''));
                $notificationId = trim((string)($data['notificationId'] ?? ''));
                if ($senderUserId === '' || $notificationId === '') {
                    json_error('senderUserId et notificationId sont requis');
                }

                require_notification_sender($pdo, $notificationId, $senderUserId);

                $stmt = $pdo->prepare('UPDATE notifications SET active = 0 WHERE id = ?');
                $stmt->execute([$notificationId]);

                echo json_encode(['success' => true]);
                break;
            }

            if ($action === 'dismiss') {
                $userId = trim((string)($data['userId'] ?? ''));
                $notificationId = trim((string)($data['notificationId'] ?? ''));
                if ($userId === '' || $notificationId === '') {
                    json_error('userId et notificationId sont requis');
                }

                $exists = $pdo->prepare('SELECT id FROM notifications WHERE id = ? LIMIT 1');
                $exists->execute([$notificationId]);
                if (!$exists->fetch()) {
                    json_error('Notification introuvable', 404);
                }

                $stmt = $pdo->prepare(
                    'INSERT INTO notification_dismissals (id, notificationId, userId, dismissedAt)
                     VALUES (?, ?, ?, ?)
                     ON DUPLICATE KEY UPDATE dismissedAt = VALUES(dismissedAt)'
                );
                $stmt->execute([
                    generate_entity_id('dismiss_'),
                    $notificationId,
                    $userId,
                    (int)round(microtime(true) * 1000),
                ]);

                echo json_encode(['success' => true]);
                break;
            }

            json_error('Action non prise en charge');
            break;

        default:
            http_response_code(405);
            echo json_encode(['success' => false, 'error' => 'Méthode non autorisée']);
            break;
    }
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
?>