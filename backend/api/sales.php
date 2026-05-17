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

require_once '../config.php';
require_once '../store_metrics.php';

$method = $_SERVER['REQUEST_METHOD'];
$authClaims = require_auth();

function is_refunded_sale_flag($value) {
    return $value === true || $value === 1 || $value === '1' || $value === 'true';
}

function is_draft_sale_flag($value) {
    return $value === true || $value === 1 || $value === '1' || $value === 'true';
}

function sale_flag_to_db_int($value) {
    return (is_refunded_sale_flag($value) || is_draft_sale_flag($value)) ? 1 : 0;
}

function should_sync_sale_stock($sale) {
    return !is_draft_sale_flag($sale['draft'] ?? false)
        && !is_refunded_sale_flag($sale['refunded'] ?? false);
}

function apply_sale_stock_delta($pdo, $storeId, $items, $deltaSign) {
    if (!$storeId || !is_array($items) || empty($items) || intval($deltaSign) === 0) {
        return;
    }

    $loadStockStmt = $pdo->prepare(
        'SELECT stock FROM product_stock WHERE productId = ? AND storeId = ? LIMIT 1 FOR UPDATE'
    );
    $updateStockStmt = $pdo->prepare(
        'UPDATE product_stock SET stock = ? WHERE productId = ? AND storeId = ?'
    );

    foreach ($items as $item) {
        $productId = isset($item['productId']) ? trim((string) $item['productId']) : '';
        $quantity = intval($item['quantity'] ?? 0);

        if ($productId === '' || $quantity === 0) {
            continue;
        }

        $loadStockStmt->execute([$productId, $storeId]);
        $currentStock = $loadStockStmt->fetchColumn();

        if ($currentStock === false) {
            continue;
        }

        $newStock = intval($currentStock) + ($quantity * intval($deltaSign));
        $updateStockStmt->execute([$newStock, $productId, $storeId]);
    }
}

function is_duplicate_key_error($exception) {
    return $exception instanceof PDOException && (string) $exception->getCode() === '23000';
}

function has_receipt_metadata($sale) {
    $receiptNumber = isset($sale['receiptNumber']) ? trim((string) $sale['receiptNumber']) : '';
    $receiptSequence = isset($sale['receiptSequence']) ? intval($sale['receiptSequence']) : 0;

    return $receiptNumber !== '' && $receiptSequence > 0;
}

function get_receipt_day_start_ms($createdAt) {
    $timestampMs = intval($createdAt ?? 0);
    $timestampSeconds = intdiv(max($timestampMs, 0), 1000);
    $dayStartSeconds = $timestampSeconds - ($timestampSeconds % 86400);

    return $dayStartSeconds * 1000;
}

function fnv1a32($input) {
    $hash = 0x811c9dc5;
    $length = strlen($input);

    for ($index = 0; $index < $length; $index += 1) {
        $hash ^= ord($input[$index]);
        $hash = ($hash * 0x01000193) & 0xFFFFFFFF;
    }

    return $hash;
}

function get_receipt_prefix($storeId, $createdAt) {
    $storeKey = trim((string) ($storeId ?? ''));
    if ($storeKey === '') {
        $storeKey = 'global';
    }

    $dayKey = gmdate('Ymd', intdiv(max(intval($createdAt ?? 0), 0), 1000));
    $hash = strtoupper(str_pad(dechex(fnv1a32($storeKey . ':' . $dayKey)), 8, '0', STR_PAD_LEFT));

    return substr($hash, 0, 7);
}

function backfill_missing_receipt_metadata($pdo, $sales) {
    if (empty($sales)) {
        return $sales;
    }

    $salesById = [];
    $groups = [];

    foreach ($sales as $index => $sale) {
        $saleId = isset($sale['id']) ? (string) $sale['id'] : '';
        if ($saleId !== '') {
            $salesById[$saleId][] = $index;
        }

        if (is_draft_sale_flag($sale['draft'] ?? false) || has_receipt_metadata($sale)) {
            continue;
        }

        $dayStart = get_receipt_day_start_ms($sale['createdAt'] ?? 0);
        $storeId = $sale['storeId'] ?? null;
        $groupKey = ($storeId === null ? '__NULL__' : (string) $storeId) . '|' . $dayStart;
        $groups[$groupKey] = [
            'storeId' => $storeId,
            'dayStart' => $dayStart,
        ];
    }

    if (empty($groups)) {
        return $sales;
    }

    $selectWithStoreStmt = $pdo->prepare(
        'SELECT id, storeId, createdAt, draft, receiptSequence, receiptNumber
         FROM sales
         WHERE storeId = ? AND createdAt >= ? AND createdAt < ? AND (draft = 0 OR draft IS NULL)
         ORDER BY createdAt ASC, id ASC'
    );
    $selectWithoutStoreStmt = $pdo->prepare(
        'SELECT id, storeId, createdAt, draft, receiptSequence, receiptNumber
         FROM sales
         WHERE (storeId IS NULL OR storeId = "") AND createdAt >= ? AND createdAt < ? AND (draft = 0 OR draft IS NULL)
         ORDER BY createdAt ASC, id ASC'
    );
    $updateStmt = $pdo->prepare(
        'UPDATE sales
         SET receiptSequence = ?, receiptNumber = ?
         WHERE id = ? AND (receiptSequence IS NULL OR receiptSequence = 0 OR receiptNumber IS NULL OR receiptNumber = "")'
    );

    foreach ($groups as $group) {
        $dayStart = intval($group['dayStart']);
        $dayEnd = $dayStart + 86400000;
        $storeId = $group['storeId'];

        if ($storeId === null || $storeId === '') {
            $selectWithoutStoreStmt->execute([$dayStart, $dayEnd]);
            $groupSales = $selectWithoutStoreStmt->fetchAll(PDO::FETCH_ASSOC);
        } else {
            $selectWithStoreStmt->execute([$storeId, $dayStart, $dayEnd]);
            $groupSales = $selectWithStoreStmt->fetchAll(PDO::FETCH_ASSOC);
        }

        if (empty($groupSales)) {
            continue;
        }

        $usedSequences = [];
        foreach ($groupSales as $groupSale) {
            if (!has_receipt_metadata($groupSale)) {
                continue;
            }

            $usedSequences[intval($groupSale['receiptSequence'])] = true;
        }

        foreach ($groupSales as $position => $groupSale) {
            $receiptSequence = isset($groupSale['receiptSequence']) ? intval($groupSale['receiptSequence']) : 0;
            $receiptNumber = isset($groupSale['receiptNumber']) ? trim((string) $groupSale['receiptNumber']) : '';

            if ($receiptSequence > 0 && $receiptNumber !== '') {
                $resolvedSequence = $receiptSequence;
                $resolvedNumber = $receiptNumber;
            } else {
                $resolvedSequence = $position + 1;
                while (isset($usedSequences[$resolvedSequence])) {
                    $resolvedSequence += 1;
                }

                $usedSequences[$resolvedSequence] = true;
                $resolvedNumber = 'REC' . get_receipt_prefix($groupSale['storeId'] ?? null, $groupSale['createdAt'] ?? 0) . '-' . $resolvedSequence;
                $updateStmt->execute([$resolvedSequence, $resolvedNumber, $groupSale['id']]);
            }

            $saleId = isset($groupSale['id']) ? (string) $groupSale['id'] : '';
            if (!isset($salesById[$saleId])) {
                continue;
            }

            foreach ($salesById[$saleId] as $saleIndex) {
                $sales[$saleIndex]['receiptSequence'] = $resolvedSequence;
                $sales[$saleIndex]['receiptNumber'] = $resolvedNumber;
            }
        }
    }

    return $sales;
}

switch ($method) {
    case 'GET':
        $storeId = ensure_store_access($authClaims, $_GET['storeId'] ?? null);
        $customerId = isset($_GET['customerId']) ? trim((string) $_GET['customerId']) : null;
        if ($customerId === '') {
            $customerId = null;
        }
        $startDate = isset($_GET['startDate']) ? intval($_GET['startDate']) : null;
        $endDate = isset($_GET['endDate']) ? intval($_GET['endDate']) : null;
        $all = isset($_GET['all']) && $_GET['all'] === '1'; // Désactiver la pagination si all=1
        $offset = isset($_GET['offset']) ? intval($_GET['offset']) : 0;
        $limit = isset($_GET['limit']) ? intval($_GET['limit']) : 25;
        $sql = 'SELECT * FROM sales';
        $params = [];
        $conditions = [];
        if ($storeId) {
            $conditions[] = 'storeId = ?';
            $params[] = $storeId;
        }
        if ($customerId !== null) {
            $conditions[] = 'customerId = ?';
            $params[] = $customerId;
        }
        if ($startDate !== null && $startDate > 0) {
            $conditions[] = 'createdAt >= ?';
            $params[] = $startDate;
        }
        if ($endDate !== null && $endDate > 0) {
            $conditions[] = 'createdAt <= ?';
            $params[] = $endDate;
        }
        $filterParams = $params;
        if (!empty($conditions)) {
            $sql .= ' WHERE ' . implode(' AND ', $conditions);
        }
        $sql .= ' ORDER BY createdAt DESC';
        
        // Ajouter la pagination seulement si all=1 n'est pas passé
        if (!$all) {
            $sql .= ' LIMIT ? OFFSET ?';
            $params[] = $limit;
            $params[] = $offset;
        }
        
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $sales = $stmt->fetchAll();

        // OPTIMISATION: Charger tous les items en une seule requête (évite N+1)
        if (!empty($sales)) {
            $saleIds = array_column($sales, 'id');
            $placeholders = str_repeat('?,', count($saleIds) - 1) . '?';
            $itemsStmt = $pdo->prepare("SELECT * FROM sale_items WHERE saleId IN ($placeholders)");
            $itemsStmt->execute($saleIds);
            $allItems = $itemsStmt->fetchAll();
            
            // Grouper les items par saleId
            $itemsBySale = [];
            foreach ($allItems as $item) {
                $itemsBySale[$item['saleId']][] = $item;
            }
            
            // Assigner les items à chaque vente
            foreach ($sales as &$sale) {
                $sale['items'] = $itemsBySale[$sale['id']] ?? [];
            }
            unset($sale);

            $sales = backfill_missing_receipt_metadata($pdo, $sales);
        }

        // Compter le total pour la pagination
        $countSql = 'SELECT COUNT(*) as total FROM sales';
        $countParams = [];
        if (!empty($conditions)) {
            $countSql .= ' WHERE ' . implode(' AND ', $conditions);
            $countParams = $filterParams;
        }
        $countStmt = $pdo->prepare($countSql);
        $countStmt->execute($countParams);
        $total = $countStmt->fetchColumn();

        echo json_encode([
            'data' => $sales,
            'total' => intval($total),
            'offset' => $offset,
            'limit' => $limit
        ]);
        break;
    case 'POST':
        $data = json_decode(file_get_contents('php://input'), true);
        $data['storeId'] = ensure_store_access($authClaims, $data['storeId'] ?? null);
        $id = $data['id'] ?? uniqid();
        $sql = 'INSERT INTO sales (id, shiftId, userId, storeId, customerId, subtotal, tax, total, paymentMethod, cashAmount, mobileMoneyAmount, otherAmount, createdAt, refunded, refundedAt, draft, completedAt, receiptSequence, receiptNumber) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
        $stmt = $pdo->prepare($sql);

        try {
            $pdo->beginTransaction();

            $existingSaleStmt = $pdo->prepare('SELECT id FROM sales WHERE id = ? LIMIT 1 FOR UPDATE');
            $existingSaleStmt->execute([$id]);
            if ($existingSaleStmt->fetch(PDO::FETCH_ASSOC)) {
                $pdo->commit();
                echo json_encode(['success' => true, 'id' => $id, 'alreadyExists' => true]);
                break;
            }

            $stmt->execute([
                $id,
                $data['shiftId'],
                $data['userId'],
                $data['storeId'],
                $data['customerId'],
                $data['subtotal'],
                $data['tax'],
                $data['total'],
                $data['paymentMethod'],
                $data['cashAmount'] ?? null,
                $data['mobileMoneyAmount'] ?? null,
                $data['otherAmount'] ?? null,
                $data['createdAt'] ?? time() * 1000,
                sale_flag_to_db_int($data['refunded'] ?? false),
                $data['refundedAt'] ?? null,
                sale_flag_to_db_int($data['draft'] ?? false),
                $data['completedAt'] ?? null,
                $data['receiptSequence'] ?? null,
                $data['receiptNumber'] ?? null,
            ]);

            if (isset($data['items']) && is_array($data['items'])) {
                $itemSql = 'INSERT INTO sale_items (saleId, productId, name, quantity, price, tax, total) VALUES (?, ?, ?, ?, ?, ?, ?)';
                $itemStmt = $pdo->prepare($itemSql);
                foreach ($data['items'] as $item) {
                    $itemStmt->execute([
                        $id,
                        $item['productId'],
                        $item['name'],
                        $item['quantity'],
                        $item['price'],
                        $item['tax'],
                        $item['total']
                    ]);
                }
            }

            if (should_sync_sale_stock($data)) {
                apply_sale_stock_delta($pdo, $data['storeId'] ?? null, $data['items'] ?? [], -1);
            }

            $pdo->commit();
            store_metrics_refresh_sales_summary_for_timestamp($pdo, $data['storeId'] ?? null, (int)($data['createdAt'] ?? time() * 1000));
            if (!empty($data['shiftId'])) {
                store_metrics_refresh_sales_summaries_for_shift($pdo, (string)$data['shiftId'], $data['storeId'] ?? null);
            }
            store_metrics_invalidate_cache($data['storeId'] ?? null);
            echo json_encode(['success' => true, 'id' => $id]);
        } catch (Exception $exception) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }

            if (is_duplicate_key_error($exception)) {
                echo json_encode(['success' => true, 'id' => $id, 'alreadyExists' => true]);
                break;
            }

            error_log('sales.php POST error: ' . $exception->getMessage());
            error_log('sales.php POST trace: ' . $exception->getFile() . ':' . $exception->getLine());
            error_log('sales.php POST payload: ' . json_encode($data));

            http_response_code(500);
            echo json_encode([
                'success' => false,
                'error' => 'Erreur lors de l\'enregistrement de la vente',
            ]);
        }
        break;
    case 'PUT':
        $data = json_decode(file_get_contents('php://input'), true);
        $data['storeId'] = ensure_store_access($authClaims, $data['storeId'] ?? null);
        $sql = 'UPDATE sales SET shiftId=?, userId=?, storeId=?, customerId=?, subtotal=?, tax=?, total=?, paymentMethod=?, cashAmount=?, mobileMoneyAmount=?, otherAmount=?, createdAt=?, refunded=?, refundedAt=?, draft=?, completedAt=?, receiptSequence=?, receiptNumber=? WHERE id=?';
        $stmt = $pdo->prepare($sql);
        try {
            $pdo->beginTransaction();

            $existingSaleStmt = $pdo->prepare('SELECT refunded, refundedAt, storeId, createdAt, shiftId FROM sales WHERE id = ? LIMIT 1 FOR UPDATE');
            $existingSaleStmt->execute([$data['id'] ?? '']);
            $existingSale = $existingSaleStmt->fetch(PDO::FETCH_ASSOC);
            $wasRefunded = $existingSale ? is_refunded_sale_flag($existingSale['refunded'] ?? false) : false;
            $previousStoreId = $existingSale['storeId'] ?? null;
            $previousCreatedAt = isset($existingSale['createdAt']) ? (int)$existingSale['createdAt'] : null;
            $previousShiftId = $existingSale['shiftId'] ?? null;

            $isRefund = isset($data['refunded']) && $data['refunded'] === true && isset($data['refundedAt']);
            $shouldRestoreStock = $isRefund && !$wasRefunded;

            if ($shouldRestoreStock) {
                apply_sale_stock_delta($pdo, $data['storeId'] ?? null, $data['items'] ?? [], 1);
            }

            $stmt->execute([
                $data['shiftId'],
                $data['userId'],
                $data['storeId'],
                $data['customerId'],
                $data['subtotal'],
                $data['tax'],
                $data['total'],
                $data['paymentMethod'],
                $data['cashAmount'] ?? null,
                $data['mobileMoneyAmount'] ?? null,
                $data['otherAmount'] ?? null,
                $data['createdAt'],
                sale_flag_to_db_int($data['refunded'] ?? false),
                $data['refundedAt'] ?? null,
                sale_flag_to_db_int($data['draft'] ?? false),
                $data['completedAt'] ?? null,
                $data['receiptSequence'] ?? null,
                $data['receiptNumber'] ?? null,
                $data['id']
            ]);

            if (isset($data['items']) && is_array($data['items'])) {
                $deleteStmt = $pdo->prepare('DELETE FROM sale_items WHERE saleId = ?');
                $deleteStmt->execute([$data['id']]);

                $itemSql = 'INSERT INTO sale_items (saleId, productId, name, quantity, price, tax, total) VALUES (?, ?, ?, ?, ?, ?, ?)';
                $itemStmt = $pdo->prepare($itemSql);
                foreach ($data['items'] as $item) {
                    $itemStmt->execute([
                        $data['id'],
                        $item['productId'],
                        $item['name'],
                        $item['quantity'],
                        $item['price'],
                        $item['tax'],
                        $item['total']
                    ]);
                }
            }

            $pdo->commit();
            store_metrics_refresh_sales_summary_for_timestamp($pdo, $previousStoreId, $previousCreatedAt);
            store_metrics_refresh_sales_summary_for_timestamp($pdo, $data['storeId'] ?? null, (int)($data['createdAt'] ?? 0));
            if (!empty($previousShiftId)) {
                store_metrics_refresh_sales_summaries_for_shift($pdo, (string)$previousShiftId, $previousStoreId);
            }
            if (!empty($data['shiftId'])) {
                store_metrics_refresh_sales_summaries_for_shift($pdo, (string)$data['shiftId'], $data['storeId'] ?? null);
            }
            store_metrics_invalidate_cache($data['storeId'] ?? $previousStoreId);

            $response = ['success' => true];
            if ($isRefund) {
                $response['stockRestored'] = $shouldRestoreStock;
                $response['alreadyRefunded'] = $wasRefunded;
                $response['message'] = $shouldRestoreStock
                    ? 'Vente remboursée et stock restauré'
                    : 'Vente déjà remboursée, aucune restauration supplémentaire appliquée';
            }

            echo json_encode($response);
        } catch (Exception $exception) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }

            http_response_code(500);
            echo json_encode([
                'success' => false,
                'error' => 'Erreur lors de la mise à jour de la vente',
            ]);
        }
        break;
    case 'DELETE':
        $id = $_GET['id'] ?? null;
        if ($id) {
            $targetStoreId = null;
            $targetCreatedAt = null;
            $targetShiftId = null;
            if (!is_super_admin_claims($authClaims)) {
                $checkStmt = $pdo->prepare('SELECT storeId FROM sales WHERE id = ? LIMIT 1');
                $checkStmt->execute([$id]);
                $targetStoreId = $checkStmt->fetchColumn();
                ensure_store_access($authClaims, $targetStoreId !== false ? (string)$targetStoreId : null);
            }
            $summaryStmt = $pdo->prepare('SELECT storeId, createdAt, shiftId FROM sales WHERE id = ? LIMIT 1');
            $summaryStmt->execute([$id]);
            $summaryRow = $summaryStmt->fetch(PDO::FETCH_ASSOC) ?: [];
            $targetStoreId = $summaryRow['storeId'] ?? $targetStoreId;
            $targetCreatedAt = isset($summaryRow['createdAt']) ? (int)$summaryRow['createdAt'] : null;
            $targetShiftId = $summaryRow['shiftId'] ?? null;
            $stmt = $pdo->prepare('DELETE FROM sales WHERE id=?');
            $stmt->execute([$id]);
            store_metrics_refresh_sales_summary_for_timestamp($pdo, $targetStoreId, $targetCreatedAt);
            if (!empty($targetShiftId)) {
                store_metrics_refresh_sales_summaries_for_shift($pdo, (string)$targetShiftId, $targetStoreId);
            }
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
?>
