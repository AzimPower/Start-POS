<?php
require_once './_bootstrap.php';
init_api_headers();
//
//
//

// Gestion des requêtes OPTIONS (preflight)
if (false && $_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

try {
    require_once '../config.php';
    require_once '../store_metrics.php';
    $method = $_SERVER['REQUEST_METHOD'];
    $authClaims = require_auth();
    $currentUserId = (string)($authClaims['sub'] ?? '');
    $currentRole = (string)($authClaims['role'] ?? '');
    $isStoreAdmin = $currentRole === 'admin';
    $mustRestrictToOwnShifts = !$isStoreAdmin && !is_super_admin_claims($authClaims);

    switch ($method) {
        case 'GET':
            $storeId = ensure_store_access($authClaims, $_GET['storeId'] ?? null);
            
            // Récupérer tous les shifts sans limite
            $sql = 'SELECT * FROM shifts';
            $params = [];
            $conditions = [];
            if ($storeId) {
                $conditions[] = 'storeId = ?';
                $params[] = $storeId;
            }
            if ($mustRestrictToOwnShifts) {
                $conditions[] = 'userId = ?';
                $params[] = $currentUserId;
            }
            if (!empty($conditions)) {
                $sql .= ' WHERE ' . implode(' AND ', $conditions);
            }
            $sql .= ' ORDER BY openedAt DESC';
            
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            $shifts = $stmt->fetchAll();
            echo json_encode($shifts ?: []);
            break;
    case 'POST':
        $data = json_decode(file_get_contents('php://input'), true);
        $data['storeId'] = ensure_store_access($authClaims, $data['storeId'] ?? null);
        if ($mustRestrictToOwnShifts) {
            $data['userId'] = $currentUserId;
        }
        
        // 🔒 SÉCURITÉ: Vérifier qu'il n'existe pas déjà un shift ouvert pour cet utilisateur dans ce magasin
        $checkSql = 'SELECT * FROM shifts WHERE userId = ? AND storeId = ? AND status = "open"';
        $checkStmt = $pdo->prepare($checkSql);
        $checkStmt->execute([$data['userId'], $data['storeId']]);
        $existingShift = $checkStmt->fetch();
        
        if ($existingShift) {
            // Un shift ouvert existe déjà pour cet utilisateur dans ce magasin
            http_response_code(409); // Conflict
            echo json_encode([
                'error' => 'Un shift est déjà ouvert pour cet utilisateur dans ce magasin',
                'existingShiftId' => $existingShift['id'],
                'openedAt' => $existingShift['openedAt']
            ]);
            exit;
        }
        
        $sql = 'INSERT INTO shifts (id, userId, storeId, openingAmount, closingAmount, expectedAmount, difference, cashAmount, mobileMoneyAmount, otherAmount, openedAt, closedAt, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
        $stmt = $pdo->prepare($sql);
        $id = $data['id'] ?? uniqid();
        try {
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
        } catch (PDOException $insertError) {
            $sqlState = (string)($insertError->errorInfo[0] ?? '');
            $driverCode = (string)($insertError->errorInfo[1] ?? '');
            $driverMessage = (string)($insertError->errorInfo[2] ?? $insertError->getMessage());
            $isOpenShiftConflict = $sqlState === '23000'
                && ($driverCode === '1062' || str_contains(strtolower($driverMessage), 'open_constraint'));
            if ($isOpenShiftConflict) {
                $existingStmt = $pdo->prepare('SELECT * FROM shifts WHERE userId = ? AND storeId = ? AND status = "open" LIMIT 1');
                $existingStmt->execute([$data['userId'], $data['storeId']]);
                $existingShift = $existingStmt->fetch();
                http_response_code(409);
                echo json_encode([
                    'error' => 'Un shift est déjà ouvert pour cet utilisateur dans ce magasin',
                    'existingShiftId' => $existingShift['id'] ?? null,
                    'openedAt' => $existingShift['openedAt'] ?? null
                ]);
                exit;
            }
            throw $insertError;
        }
        store_metrics_invalidate_cache($data['storeId'] ?? null);
        echo json_encode(['success' => true, 'id' => $id]);
        break;
    case 'PUT':
        $data = json_decode(file_get_contents('php://input'), true);
        $data['storeId'] = ensure_store_access($authClaims, $data['storeId'] ?? null);
        $summaryStmt = $pdo->prepare('SELECT storeId FROM shifts WHERE id = ? LIMIT 1');
        $summaryStmt->execute([$data['id'] ?? '']);
        $existingShiftStoreId = $summaryStmt->fetchColumn() ?: null;
        if ($mustRestrictToOwnShifts) {
            $ownerStmt = $pdo->prepare('SELECT userId FROM shifts WHERE id = ? LIMIT 1');
            $ownerStmt->execute([$data['id'] ?? '']);
            $existingUserId = (string)($ownerStmt->fetchColumn() ?: '');
            if ($existingUserId !== '' && $existingUserId !== $currentUserId) {
                http_response_code(403);
                echo json_encode(['error' => 'Shift access denied']);
                exit;
            }
            $data['userId'] = $currentUserId;
        }

        if (($data['status'] ?? '') === 'open') {
            $checkSql = 'SELECT * FROM shifts WHERE userId = ? AND storeId = ? AND status = "open" AND id <> ? LIMIT 1';
            $checkStmt = $pdo->prepare($checkSql);
            $checkStmt->execute([$data['userId'], $data['storeId'], $data['id']]);
            $existingShift = $checkStmt->fetch();

            if ($existingShift) {
                http_response_code(409);
                echo json_encode([
                    'error' => 'Un autre shift est déjà ouvert pour cet utilisateur dans ce magasin',
                    'existingShiftId' => $existingShift['id'],
                    'openedAt' => $existingShift['openedAt']
                ]);
                exit;
            }
        }
        
        $sql = 'UPDATE shifts SET userId=?, storeId=?, openingAmount=?, closingAmount=?, expectedAmount=?, difference=?, cashAmount=?, mobileMoneyAmount=?, otherAmount=?, openedAt=?, closedAt=?, status=? WHERE id=?';
        $stmt = $pdo->prepare($sql);
        try {
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
        } catch (PDOException $updateError) {
            $sqlState = (string)($updateError->errorInfo[0] ?? '');
            $driverCode = (string)($updateError->errorInfo[1] ?? '');
            $driverMessage = (string)($updateError->errorInfo[2] ?? $updateError->getMessage());
            $isOpenShiftConflict = $sqlState === '23000'
                && ($driverCode === '1062' || str_contains(strtolower($driverMessage), 'open_constraint'));
            if ($isOpenShiftConflict) {
                $existingStmt = $pdo->prepare('SELECT * FROM shifts WHERE userId = ? AND storeId = ? AND status = "open" AND id <> ? LIMIT 1');
                $existingStmt->execute([$data['userId'], $data['storeId'], $data['id']]);
                $existingShift = $existingStmt->fetch();
                http_response_code(409);
                echo json_encode([
                    'error' => 'Un autre shift est déjà ouvert pour cet utilisateur dans ce magasin',
                    'existingShiftId' => $existingShift['id'] ?? null,
                    'openedAt' => $existingShift['openedAt'] ?? null
                ]);
                exit;
            }
            throw $updateError;
        }
        if ($stmt->rowCount() === 0) {
            $checkStmt = $pdo->prepare('SELECT id FROM shifts WHERE id = ? LIMIT 1');
            $checkStmt->execute([$data['id']]);
            $existingId = $checkStmt->fetchColumn();

            if ($existingId === false) {
                $insertSql = 'INSERT INTO shifts (id, userId, storeId, openingAmount, closingAmount, expectedAmount, difference, cashAmount, mobileMoneyAmount, otherAmount, openedAt, closedAt, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
                $insertStmt = $pdo->prepare($insertSql);
                $insertStmt->execute([
                    $data['id'],
                    $data['userId'],
                    $data['storeId'],
                    $data['openingAmount'],
                    $data['closingAmount'] ?? null,
                    $data['expectedAmount'] ?? null,
                    $data['difference'] ?? null,
                    isset($data['cashAmount']) ? $data['cashAmount'] : 0,
                    isset($data['mobileMoneyAmount']) ? $data['mobileMoneyAmount'] : 0,
                    isset($data['otherAmount']) ? $data['otherAmount'] : 0,
                    $data['openedAt'],
                    $data['closedAt'] ?? null,
                    $data['status']
                ]);
            }
        }
        store_metrics_refresh_sales_summaries_for_shift($pdo, (string)($data['id'] ?? ''), $data['storeId'] ?? $existingShiftStoreId);
        store_metrics_invalidate_cache($data['storeId'] ?? $existingShiftStoreId);
        echo json_encode(['success' => true]);
        break;
    case 'DELETE':
        $id = $_GET['id'] ?? null;
        if ($id) {
            $targetStoreId = null;
            if (!is_super_admin_claims($authClaims)) {
                $checkStmt = $pdo->prepare('SELECT storeId FROM shifts WHERE id = ? LIMIT 1');
                $checkStmt->execute([$id]);
                $targetStoreId = $checkStmt->fetchColumn();
                ensure_store_access($authClaims, $targetStoreId !== false ? (string)$targetStoreId : null);
            }
            if ($targetStoreId === null) {
                $summaryStmt = $pdo->prepare('SELECT storeId FROM shifts WHERE id = ? LIMIT 1');
                $summaryStmt->execute([$id]);
                $targetStoreId = $summaryStmt->fetchColumn() ?: null;
            }
            $stmt = $pdo->prepare('DELETE FROM shifts WHERE id=?');
            $stmt->execute([$id]);
            store_metrics_refresh_sales_summaries_for_shift($pdo, (string)$id, $targetStoreId);
            store_metrics_invalidate_cache($targetStoreId);
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
} catch (PDOException $e) {
    http_response_code(500);
    error_log('Erreur BD shifts: ' . $e->getMessage());
    echo json_encode(['error' => 'Erreur de base de données', 'message' => $e->getMessage()]);
} catch (Exception $e) {
    http_response_code(500);
    error_log('Erreur shifts: ' . $e->getMessage());
    echo json_encode(['error' => 'Erreur serveur', 'message' => $e->getMessage()]);
}
?>
