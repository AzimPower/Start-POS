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

switch ($method) {
    case 'GET':
        // Récupérer tous les utilisateurs et leurs magasins (storeIds)
        $requestedStoreId = isset($_GET['storeId']) ? trim((string)$_GET['storeId']) : '';
        if ($requestedStoreId !== '') {
            $stmt = $pdo->prepare(
                'SELECT DISTINCT u.id, u.username, u.phone, u.email, u.password, u.pin, u.pinEnabled, u.role, u.storeId, u.active, u.createdAt
                 FROM users u
                 LEFT JOIN user_stores us ON us.userId = u.id
                 WHERE u.storeId = ? OR us.storeId = ?'
            );
            $stmt->execute([$requestedStoreId, $requestedStoreId]);
            $users = $stmt->fetchAll();
        } else {
            $stmt = $pdo->query('SELECT id, username, phone, email, password, pin, pinEnabled, role, storeId, active, createdAt FROM users');
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
        }
        echo json_encode($users);
        break;
    case 'POST':
        // Ajouter un utilisateur
        $data = json_decode(file_get_contents('php://input'), true);
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
            $data['password'],
            $data['pin'] ?? null,
            isset($data['pinEnabled']) ? ($data['pinEnabled'] ? 1 : 0) : 0,
            $data['role'],
            $firstStore,
            $data['active'] ?? true,
            $data['createdAt'] ?? time()*1000
        ]);

        // If storeIds provided, insert mappings into user_stores
        if (!empty($storeIds)) {
            foreach ($storeIds as $sid) {
                try {
                    $linkId = uniqid();
                    $ins = $pdo->prepare('INSERT INTO user_stores (id, userId, storeId) VALUES (?, ?, ?)');
                    $ins->execute([$linkId, $id, $sid]);
                } catch (Exception $e) {
                    // ignore duplicate/mapping errors
                }
            }
        } elseif (!empty($firstStore)) {
            try {
                $linkId = uniqid();
                $ins = $pdo->prepare('INSERT INTO user_stores (id, userId, storeId) VALUES (?, ?, ?)');
                $ins->execute([$linkId, $id, $firstStore]);
            } catch (Exception $e) {}
        }

        echo json_encode(['success' => true, 'id' => $id]);
        break;
    case 'PUT':
        // Modifier un utilisateur
        $data = json_decode(file_get_contents('php://input'), true);
        $sql = 'UPDATE users SET username=?, phone=?, email=?, password=?, pin=?, pinEnabled=?, role=?, storeId=?, active=?, createdAt=? WHERE id=?';
        $stmt = $pdo->prepare($sql);

        // determine primary store for backward compatibility
        $storeIds = normalize_store_ids($data['storeIds'] ?? null, $data['storeId'] ?? null);
        $firstStore = $storeIds[0] ?? null;

        $stmt->execute([
            $data['username'],
            $data['phone'],
            $data['email'] ?? null,
            $data['password'],
            $data['pin'] ?? null,
            isset($data['pinEnabled']) ? ($data['pinEnabled'] ? 1 : 0) : 0,
            $data['role'],
            $firstStore,
            $data['active'],
            $data['createdAt'],
            $data['id']
        ]);

        // Update user_stores mappings if provided
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
                // ignore mapping errors
            }
        }

        echo json_encode(['success' => true]);
        break;
    case 'DELETE':
        // Supprimer un utilisateur
        $id = $_GET['id'] ?? null;
        if ($id) {
            try {
                // delete mappings
                $delm = $pdo->prepare('DELETE FROM user_stores WHERE userId = ?');
                $delm->execute([$id]);
                // delete user record
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
        echo json_encode(['error' => 'Méthode non autorisée']);
        break;
}
?>