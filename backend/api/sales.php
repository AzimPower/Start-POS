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

function is_refunded_sale_flag($value) {
    return $value === true || $value === 1 || $value === '1' || $value === 'true';
}

function is_draft_sale_flag($value) {
    return $value === true || $value === 1 || $value === '1' || $value === 'true';
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
        $storeId = $_GET['storeId'] ?? null;
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
        $sql = 'INSERT INTO sales (id, shiftId, userId, storeId, customerId, subtotal, tax, total, paymentMethod, cashAmount, mobileMoneyAmount, otherAmount, createdAt, refunded, refundedAt, draft, completedAt, receiptSequence, receiptNumber) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
        $stmt = $pdo->prepare($sql);
        $id = $data['id'] ?? uniqid();
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
            $data['createdAt'] ?? time()*1000,
            $data['refunded'] ?? false,
            $data['refundedAt'],
            $data['draft'] ?? false,
            $data['completedAt'],
            $data['receiptSequence'] ?? null,
            $data['receiptNumber'] ?? null,
        ]);
        
        // Insérer les items de la vente
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
        
        echo json_encode(['success' => true, 'id' => $id]);
        break;
    case 'PUT':
        $data = json_decode(file_get_contents('php://input'), true);

        $existingSaleStmt = $pdo->prepare('SELECT refunded, refundedAt FROM sales WHERE id = ? LIMIT 1');
        $existingSaleStmt->execute([$data['id'] ?? '']);
        $existingSale = $existingSaleStmt->fetch(PDO::FETCH_ASSOC);
        $wasRefunded = $existingSale ? is_refunded_sale_flag($existingSale['refunded'] ?? false) : false;
        
        // Vérifier si c'est un remboursement (refunded = true et refundedAt défini)
        $isRefund = isset($data['refunded']) && $data['refunded'] === true && isset($data['refundedAt']);
        $shouldRestoreStock = $isRefund && !$wasRefunded;
        
        // Si c'est un remboursement, restaurer le stock des produits
        if ($shouldRestoreStock && isset($data['items']) && is_array($data['items'])) {
            foreach ($data['items'] as $item) {
                try {
                    // Récupérer le stock actuel du produit pour ce magasin
                    $stockStmt = $pdo->prepare('SELECT stock FROM product_stock WHERE productId = ? AND storeId = ?');
                    $stockStmt->execute([$item['productId'], $data['storeId']]);
                    $currentStock = $stockStmt->fetchColumn();
                    
                    if ($currentStock !== false) {
                        // Le produit a un suivi de stock, restaurer la quantité vendue
                        $newStock = intval($currentStock) + intval($item['quantity']);
                        $updateStockStmt = $pdo->prepare('UPDATE product_stock SET stock = ? WHERE productId = ? AND storeId = ?');
                        $updateStockStmt->execute([$newStock, $item['productId'], $data['storeId']]);
                        
                        error_log("Stock restauré pour produit {$item['productId']}: {$currentStock} + {$item['quantity']} = {$newStock}");
                    } else {
                        error_log("Produit {$item['productId']} sans suivi de stock - pas de restauration");
                    }
                } catch (Exception $e) {
                    error_log("Erreur lors de la restauration du stock pour le produit {$item['productId']}: " . $e->getMessage());
                }
            }
        }
        
        $sql = 'UPDATE sales SET shiftId=?, userId=?, storeId=?, customerId=?, subtotal=?, tax=?, total=?, paymentMethod=?, cashAmount=?, mobileMoneyAmount=?, otherAmount=?, createdAt=?, refunded=?, refundedAt=?, draft=?, completedAt=?, receiptSequence=?, receiptNumber=? WHERE id=?';
        $stmt = $pdo->prepare($sql);
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
            $data['refunded'] ?? false,
            $data['refundedAt'] ?? null,
            $data['draft'] ?? false,
            $data['completedAt'] ?? null,
            $data['receiptSequence'] ?? null,
            $data['receiptNumber'] ?? null,
            $data['id']
        ]);
        
        // Mettre à jour les items si fournis
        if (isset($data['items']) && is_array($data['items'])) {
            // Supprimer les anciens items
            $deleteStmt = $pdo->prepare('DELETE FROM sale_items WHERE saleId = ?');
            $deleteStmt->execute([$data['id']]);
            
            // Insérer les nouveaux items
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
        
        $response = ['success' => true];
        if ($isRefund) {
            $response['stockRestored'] = $shouldRestoreStock;
            $response['alreadyRefunded'] = $wasRefunded;
            $response['message'] = $shouldRestoreStock
                ? 'Vente remboursée et stock restauré'
                : 'Vente déjà remboursée, aucune restauration supplémentaire appliquée';
        }
        
        echo json_encode($response);
        break;
    case 'DELETE':
        $id = $_GET['id'] ?? null;
        if ($id) {
            $stmt = $pdo->prepare('DELETE FROM sales WHERE id=?');
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