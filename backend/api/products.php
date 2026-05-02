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

// Désactiver l'affichage des erreurs pour éviter de polluer la réponse JSON
error_reporting(E_ALL);
ini_set('display_errors', 0);
ini_set('log_errors', 1);

try {
    require_once '../config.php';
} catch (Exception $e) {
    echo json_encode(['error' => 'Erreur de configuration: ' . $e->getMessage()]);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'];
$authClaims = require_auth();

try {
switch ($method) {
    case 'GET':
        // Si un storeId est fourni, filtrer par magasin
        $storeId = ensure_store_access($authClaims, $_GET['storeId'] ?? null);
        $sql = 'SELECT * FROM products';
        if ($storeId) {
            $sql .= ' WHERE storeId = ?';
            $stmt = $pdo->prepare($sql);
            $stmt->execute([$storeId]);
        } else {
            $stmt = $pdo->query($sql);
        }
        $products = $stmt->fetchAll();
        
        // OPTIMISATION: Charger tous les stocks en une seule requête (évite N+1)
        if (!empty($products)) {
            $productIds = array_column($products, 'id');
            $placeholders = str_repeat('?,', count($productIds) - 1) . '?';
            $stockStmt = $pdo->prepare("SELECT productId, storeId, stock FROM product_stock WHERE productId IN ($placeholders)");
            $stockStmt->execute($productIds);
            $allStocks = $stockStmt->fetchAll(PDO::FETCH_ASSOC);
            
            // Grouper les stocks par productId
            $stocksByProduct = [];
            foreach ($allStocks as $stock) {
                if (!isset($stocksByProduct[$stock['productId']])) {
                    $stocksByProduct[$stock['productId']] = [];
                }
                $stocksByProduct[$stock['productId']][$stock['storeId']] = (int)$stock['stock'];
            }
            
            // Assigner les stocks et décoder les JSON pour chaque produit
            foreach ($products as &$product) {
                // Décoder les champs JSON
                if (isset($product['variablePrices']) && $product['variablePrices']) {
                    $product['variablePrices'] = json_decode($product['variablePrices'], true);
                }
                
                // Assigner les stocks
                $product['stock'] = $stocksByProduct[$product['id']] ?? [];
            }
        }
        echo json_encode($products);
        break;
    case 'POST':
        $input = file_get_contents('php://input');
        error_log('POST input raw: ' . $input);
        
        $data = json_decode($input, true);
        if (!$data) {
            echo json_encode(['error' => 'Données JSON invalides', 'input' => $input]);
            break;
        }
        
        $data['storeId'] = ensure_store_access($authClaims, $data['storeId'] ?? null);
        error_log('POST data parsed: ' . print_r($data, true));
        
        $sql = 'INSERT INTO products (id, name, sku, categoryId, salePrice, costPrice, targetMargin, variablePrices, unit, taxRate, minStock, imageUrl, createdAt, updatedAt, storeId, trackStock) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
        $stmt = $pdo->prepare($sql);
        $id = $data['id'] ?? uniqid();
            $success = $stmt->execute([
            $id,
            $data['name'] ?? '',
            $data['sku'] ?? '',
            $data['categoryId'] ?? null,
            $data['salePrice'] ?? null,
            $data['costPrice'] ?? null,
            $data['targetMargin'] ?? null,
            isset($data['variablePrices']) && is_array($data['variablePrices']) ? json_encode($data['variablePrices']) : null,
            $data['unit'] ?? 'pièce',
            $data['taxRate'] ?? null,
            $data['minStock'] ?? null,
            $data['imageUrl'] ?? '',
            $data['createdAt'] ?? time()*1000,
            $data['updatedAt'] ?? time()*1000,
            $data['storeId'] ?? '',
            isset($data['trackStock']) ? (int)$data['trackStock'] : 0
        ]);
        // Gérer product_stock : insérer/mettre à jour si trackStock true, sinon supprimer toute entrée existante
        $productStockResult = null;
        if (isset($data['trackStock']) && $data['trackStock'] && isset($data['stock'])) {
            $sqlStock = 'INSERT INTO product_stock (productId, storeId, stock) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE stock = VALUES(stock)';
            $stmtStock = $pdo->prepare($sqlStock);
            $success = $stmtStock->execute([
                $id,
                $data['storeId'],
                (int)$data['stock']
            ]);
            $productStockResult = [
                'success' => $success,
                'errorInfo' => !$success ? $stmtStock->errorInfo() : null,
                'values' => [
                    'productId' => $id,
                    'storeId' => $data['storeId'],
                    'stock' => $data['stock']
                ]
            ];
        } else {
            // Si le suivi est désactivé explicitement, supprimer l'entrée de stock correspondante
            if (isset($data['trackStock']) && !$data['trackStock'] && isset($data['storeId'])) {
                $delStock = $pdo->prepare('DELETE FROM product_stock WHERE productId = ? AND storeId = ?');
                $delStock->execute([$id, $data['storeId']]);
                $productStockResult = ['deleted' => $delStock->rowCount()];
            }
        }
            if (!$success) {
                echo json_encode([
                    'success' => false,
                    'error' => $stmt->errorInfo(),
                    'data' => $data
                ]);
                exit;
            }
            echo json_encode(['success' => true, 'id' => $id, 'productStock' => $productStockResult]);
        break;
    case 'PUT':
        $data = json_decode(file_get_contents('php://input'), true);
        $data['storeId'] = ensure_store_access($authClaims, $data['storeId'] ?? null);
        $sql = 'UPDATE products SET name=?, sku=?, categoryId=?, salePrice=?, costPrice=?, targetMargin=?, variablePrices=?, unit=?, taxRate=?, minStock=?, imageUrl=?, createdAt=?, updatedAt=?, storeId=?, trackStock=? WHERE id=?';
        $stmt = $pdo->prepare($sql);
            $success = $stmt->execute([
            $data['name'] ?? '',
            $data['sku'] ?? '',
            $data['categoryId'] ?? null,
            $data['salePrice'] ?? null,
            $data['costPrice'] ?? null,
            $data['targetMargin'] ?? null,
            isset($data['variablePrices']) && is_array($data['variablePrices']) ? json_encode($data['variablePrices']) : null,
            $data['unit'] ?? 'pièce',
            $data['taxRate'] ?? null,
            $data['minStock'] ?? null,
            $data['imageUrl'] ?? '',
            $data['createdAt'] ?? time()*1000,
            $data['updatedAt'] ?? time()*1000,
            $data['storeId'] ?? '',
            isset($data['trackStock']) ? (int)$data['trackStock'] : 0,
            $data['id'] ?? ''
        ]);
        // Gérer product_stock : insérer/mettre à jour si trackStock true, sinon supprimer l'entrée correspondante
        $productStockResult = null;
        if (isset($data['trackStock']) && $data['trackStock'] && isset($data['stock'])) {
            $sqlStock = 'INSERT INTO product_stock (productId, storeId, stock) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE stock = VALUES(stock)';
            $stmtStock = $pdo->prepare($sqlStock);
            $success = $stmtStock->execute([
                $data['id'],
                $data['storeId'],
                (int)$data['stock']
            ]);
            $productStockResult = [
                'success' => $success,
                'errorInfo' => !$success ? $stmtStock->errorInfo() : null,
                'values' => [
                    'productId' => $data['id'],
                    'storeId' => $data['storeId'],
                    'stock' => $data['stock']
                ]
            ];
        } else {
            if (isset($data['trackStock']) && !$data['trackStock'] && isset($data['storeId'])) {
                $delStock = $pdo->prepare('DELETE FROM product_stock WHERE productId = ? AND storeId = ?');
                $delStock->execute([$data['id'], $data['storeId']]);
                $productStockResult = ['deleted' => $delStock->rowCount()];
            }
        }
            if (!$success) {
                echo json_encode([
                    'success' => false,
                    'error' => $stmt->errorInfo(),
                    'data' => $data
                ]);
                exit;
            }
            echo json_encode(['success' => true, 'productStock' => $productStockResult]);
        break;
    case 'DELETE':
        $id = $_GET['id'] ?? null;
            if ($id) {
                if (!is_super_admin_claims($authClaims)) {
                    $checkStoreStmt = $pdo->prepare('SELECT storeId FROM products WHERE id = ? LIMIT 1');
                    $checkStoreStmt->execute([$id]);
                    $targetStoreId = $checkStoreStmt->fetchColumn();
                    ensure_store_access($authClaims, $targetStoreId !== false ? (string)$targetStoreId : null);
                }
                // Récupérer l'URL de l'image avant suppression
                $stmtImg = $pdo->prepare('SELECT imageUrl FROM products WHERE id = ?');
                $stmtImg->execute([$id]);
                $row = $stmtImg->fetch(PDO::FETCH_ASSOC);
                $imageUrl = $row['imageUrl'] ?? '';

                $deletedImage = null;
                if ($imageUrl) {
                    // Extraire chemin relatif si une URL complète a été stockée
                    $relative = null;
                    if (preg_match('#https?://[^/]+/(.*)#i', $imageUrl, $m)) {
                        $candidate = $m[1];
                        $pos = strpos($candidate, 'img_products/');
                        if ($pos !== false) {
                            $relative = substr($candidate, $pos);
                        } else {
                            $relative = 'img_products/' . basename($candidate);
                        }
                    } else {
                        $pos = strpos($imageUrl, 'img_products/');
                        if ($pos !== false) {
                            $relative = substr($imageUrl, $pos);
                        } else {
                            $relative = ltrim($imageUrl, '/');
                        }
                    }

                    $filePath = realpath(__DIR__ . '/../' . $relative);
                    $imgDir = realpath(__DIR__ . '/../img_products/');
                    if ($filePath && $imgDir && strpos($filePath, $imgDir) === 0 && file_exists($filePath)) {
                        if (unlink($filePath)) {
                            $deletedImage = true;
                        } else {
                            $deletedImage = false;
                        }
                    } else {
                        $deletedImage = false;
                    }
                }

                // Supprimer d'abord les entrées de stock associées
                $stmtStock = $pdo->prepare('DELETE FROM product_stock WHERE productId=?');
                $stmtStock->execute([$id]);
            
                // Ensuite supprimer le produit
                $stmt = $pdo->prepare('DELETE FROM products WHERE id=?');
                $stmt->execute([$id]);
            
                echo json_encode([
                    'success' => true,
                    'deletedStockEntries' => $stmtStock->rowCount(),
                    'deletedImage' => $deletedImage,
                    'imageUrl' => $imageUrl
                ]);
            } else {
                echo json_encode(['error' => 'ID requis']);
            }
        break;
    default:
        http_response_code(405);
        echo json_encode(['error' => 'Méthode non autorisée']);
        break;
}
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Erreur serveur: ' . $e->getMessage(), 'trace' => $e->getTraceAsString()]);
}
?>
