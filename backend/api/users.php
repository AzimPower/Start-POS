<?php
require_once './_bootstrap.php';
init_api_headers();

require_once '../config.php';

$method = $_SERVER['REQUEST_METHOD'];
$authClaims = require_auth();

function normalize_store_ids($storeIds, $fallbackStoreId = null) {
    $normalized = [];

    if (is_array($storeIds)) {
        foreach ($storeIds as $storeId) {
            $trimmed = trim((string)$storeId);
            if ($trimmed !== '') {
                $normalized[] = $trimmed;
            }
        }
    }

    if (empty($normalized) && $fallbackStoreId !== null) {
        $trimmedFallback = trim((string)$fallbackStoreId);
        if ($trimmedFallback !== '') {
            $normalized[] = $trimmedFallback;
        }
    }

    return array_values(array_unique($normalized));
}

function sanitize_user_for_response(array $user): array {
    unset($user['password'], $user['pin']);
    return $user;
}

function build_password_value($rawPassword, ?string $existingPassword = null): ?string {
    if ($rawPassword === null) {
        return $existingPassword;
    }

    $password = trim((string)$rawPassword);
    if ($password === '') {
        return $existingPassword;
    }

    if (password_get_info($password)['algo'] !== null) {
        return $password;
    }

    return password_hash($password, PASSWORD_DEFAULT);
}

function build_pin_value($rawPin, ?string $existingPin = null): ?string {
    if ($rawPin === null) {
        return $existingPin;
    }

    return trim((string)$rawPin);
}

switch ($method) {
    case 'GET':
        $requestedStoreId = isset($_GET['storeId']) ? trim((string)$_GET['storeId']) : '';
        $scopedStoreId = is_super_admin_claims($authClaims) && $requestedStoreId === ''
            ? ''
            : ensure_store_access($authClaims, $requestedStoreId);
        if ($scopedStoreId !== '') {
            $stmt = $pdo->prepare(
                'SELECT DISTINCT u.id, u.username, u.phone, u.email, u.pinEnabled, u.role, u.storeId, u.active, u.createdAt
                 FROM users u
                 LEFT JOIN user_stores us ON us.userId = u.id
                 WHERE u.storeId = ? OR us.storeId = ?'
            );
            $stmt->execute([$scopedStoreId, $scopedStoreId]);
            $users = $stmt->fetchAll();
        } else {
            $stmt = $pdo->query('SELECT id, username, phone, email, pinEnabled, role, storeId, active, createdAt FROM users');
            $users = $stmt->fetchAll();
        }

        foreach ($users as &$u) {
            try {
                $ms = $pdo->prepare('SELECT storeId FROM user_stores WHERE userId = ?');
                $ms->execute([$u['id']]);
                $mappings = $ms->fetchAll(PDO::FETCH_COLUMN);
                $u['storeIds'] = normalize_store_ids($mappings, $u['storeId'] ?? null);
            } catch (Exception $e) {
                $u['storeIds'] = normalize_store_ids([], $u['storeId'] ?? null);
            }

            $u = sanitize_user_for_response($u);
        }

        echo json_encode($users);
        break;

    case 'POST':
        if (!is_super_admin_claims($authClaims)) {
            http_response_code(403);
            echo json_encode(['error' => 'Only super admin can create users']);
            exit;
        }
        $data = json_decode(file_get_contents('php://input'), true);
        if (!is_array($data)) {
            http_response_code(400);
            echo json_encode(['error' => 'Invalid JSON payload']);
            exit;
        }

        $passwordValue = build_password_value($data['password'] ?? null);
        if ($passwordValue === null) {
            http_response_code(422);
            echo json_encode(['error' => 'Password is required']);
            exit;
        }

        $sql = 'INSERT INTO users (id, username, phone, email, password, pin, pinEnabled, role, storeId, active, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
        $stmt = $pdo->prepare($sql);
        $id = $data['id'] ?? uniqid();
        $storeIds = normalize_store_ids($data['storeIds'] ?? null, $data['storeId'] ?? null);
        $firstStore = $storeIds[0] ?? null;
        $stmt->execute([
            $id,
            $data['username'],
            $data['phone'],
            $data['email'] ?? null,
            $passwordValue,
            build_pin_value($data['pin'] ?? null, ''),
            isset($data['pinEnabled']) ? ($data['pinEnabled'] ? 1 : 0) : 0,
            $data['role'],
            $firstStore,
            $data['active'] ?? true,
            $data['createdAt'] ?? time() * 1000
        ]);

        if (!empty($storeIds)) {
            foreach ($storeIds as $sid) {
                try {
                    $linkId = uniqid();
                    $ins = $pdo->prepare('INSERT INTO user_stores (id, userId, storeId) VALUES (?, ?, ?)');
                    $ins->execute([$linkId, $id, $sid]);
                } catch (Exception $e) {
                }
            }
        } elseif (!empty($firstStore)) {
            try {
                $linkId = uniqid();
                $ins = $pdo->prepare('INSERT INTO user_stores (id, userId, storeId) VALUES (?, ?, ?)');
                $ins->execute([$linkId, $id, $firstStore]);
            } catch (Exception $e) {
            }
        }

        echo json_encode(['success' => true, 'id' => $id]);
        break;

    case 'PUT':
        $data = json_decode(file_get_contents('php://input'), true);
        if (!is_array($data) || empty($data['id'])) {
            http_response_code(400);
            echo json_encode(['error' => 'User id is required']);
            exit;
        }
        $isSelfUpdate = (string)$data['id'] === (string)($authClaims['sub'] ?? '');
        if (!is_super_admin_claims($authClaims) && !$isSelfUpdate) {
            http_response_code(403);
            echo json_encode(['error' => 'User update not allowed']);
            exit;
        }

        $existingStmt = $pdo->prepare('SELECT password, pin FROM users WHERE id = ?');
        $existingStmt->execute([$data['id']]);
        $existingUser = $existingStmt->fetch();
        if (!$existingUser) {
            http_response_code(404);
            echo json_encode(['error' => 'User not found']);
            exit;
        }

        $sql = 'UPDATE users SET username=?, phone=?, email=?, password=?, pin=?, pinEnabled=?, role=?, storeId=?, active=?, createdAt=? WHERE id=?';
        $stmt = $pdo->prepare($sql);

        $storeIds = normalize_store_ids($data['storeIds'] ?? null, $data['storeId'] ?? null);
        $firstStore = $storeIds[0] ?? null;

        $stmt->execute([
            $data['username'],
            $data['phone'],
            $data['email'] ?? null,
            build_password_value($data['password'] ?? null, $existingUser['password'] ?? null),
            build_pin_value($data['pin'] ?? null, $existingUser['pin'] ?? null),
            isset($data['pinEnabled']) ? ($data['pinEnabled'] ? 1 : 0) : 0,
            $data['role'],
            $firstStore,
            $data['active'],
            $data['createdAt'],
            $data['id']
        ]);

        if (isset($data['storeIds']) || isset($data['storeId'])) {
            try {
                $del = $pdo->prepare('DELETE FROM user_stores WHERE userId = ?');
                $del->execute([$data['id']]);
                foreach ($storeIds as $sid) {
                    $linkId = uniqid();
                    $ins = $pdo->prepare('INSERT INTO user_stores (id, userId, storeId) VALUES (?, ?, ?)');
                    $ins->execute([$linkId, $data['id'], $sid]);
                }
            } catch (Exception $e) {
            }
        }

        echo json_encode(['success' => true]);
        break;

    case 'DELETE':
        if (!is_super_admin_claims($authClaims)) {
            http_response_code(403);
            echo json_encode(['error' => 'Only super admin can delete users']);
            exit;
        }
        $id = $_GET['id'] ?? null;
        if ($id) {
            try {
                $delm = $pdo->prepare('DELETE FROM user_stores WHERE userId = ?');
                $delm->execute([$id]);
                $stmt = $pdo->prepare('DELETE FROM users WHERE id=?');
                $stmt->execute([$id]);
                echo json_encode(['success' => true]);
            } catch (Exception $e) {
                http_response_code(500);
                echo json_encode(['success' => false, 'error' => $e->getMessage()]);
            }
        } else {
            echo json_encode(['error' => 'ID requis']);
        }
        break;

    default:
        http_response_code(405);
        echo json_encode(['error' => 'Methode non autorisee']);
        break;
}
?>
