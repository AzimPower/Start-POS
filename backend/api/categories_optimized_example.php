<?php
/**
 * EXEMPLE D'API OPTIMISÉE AVEC CACHE
 * Ce fichier montre comment intégrer le système de cache dans vos API existantes
 * Copiez ce pattern dans vos autres endpoints pour améliorer les performances
 */

// Headers CORS (à adapter selon votre configuration)
$allowedOrigins = explode(',', getenv('CORS_ALLOWED_ORIGINS') ?: '*');
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (in_array($origin, $allowedOrigins) || $allowedOrigins[0] === '*') {
    header("Access-Control-Allow-Origin: " . ($allowedOrigins[0] === '*' ? '*' : $origin));
    header('Access-Control-Allow-Credentials: true');
}
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

require_once '../config.php';
require_once '../cache.php';

// Mesurer les performances (optionnel mais recommandé)
$startTime = microtime(true);

$method = $_SERVER['REQUEST_METHOD'];

switch ($method) {
    case 'GET':
        // Exemple 1: Cache simple avec TTL de 5 minutes
        $storeId = $_GET['storeId'] ?? null;
        $cacheKey = generateCacheKey('categories', ['storeId' => $storeId]);
        
        $categories = $cache->remember($cacheKey, function() use ($pdo, $storeId) {
            // Cette fonction ne s'exécute que si le cache est vide ou expiré
            $sql = 'SELECT * FROM categories';
            $params = [];
            
            if ($storeId) {
                $sql .= ' WHERE storeId = ?';
                $params[] = $storeId;
            }
            
            $sql .= ' ORDER BY name ASC';
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            
            return $stmt->fetchAll();
        }, 300); // 300 secondes = 5 minutes
        
        echo json_encode($categories);
        break;
        
    case 'POST':
        $data = json_decode(file_get_contents('php://input'), true);
        
        // Votre logique d'insertion
        $sql = 'INSERT INTO categories (id, name, description, createdAt, storeId) VALUES (?, ?, ?, ?, ?)';
        $stmt = $pdo->prepare($sql);
        $id = $data['id'] ?? uniqid();
        $stmt->execute([
            $id,
            $data['name'] ?? '',
            $data['description'] ?? '',
            $data['createdAt'] ?? time() * 1000,
            $data['storeId'] ?? null
        ]);
        
        // IMPORTANT: Invalider le cache après modification
        invalidateEndpointCache('categories');
        
        echo json_encode(['success' => true, 'id' => $id]);
        break;
        
    case 'PUT':
        $data = json_decode(file_get_contents('php://input'), true);
        
        // Votre logique de mise à jour
        $sql = 'UPDATE categories SET name=?, description=?, storeId=? WHERE id=?';
        $stmt = $pdo->prepare($sql);
        $stmt->execute([
            $data['name'],
            $data['description'] ?? '',
            $data['storeId'] ?? null,
            $data['id']
        ]);
        
        // IMPORTANT: Invalider le cache après modification
        invalidateEndpointCache('categories');
        
        echo json_encode(['success' => true]);
        break;
        
    case 'DELETE':
        $id = $_GET['id'] ?? null;
        if ($id) {
            $stmt = $pdo->prepare('DELETE FROM categories WHERE id=?');
            $stmt->execute([$id]);
            
            // IMPORTANT: Invalider le cache après modification
            invalidateEndpointCache('categories');
            
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

// Log des performances (optionnel mais utile pour le monitoring)
$duration = microtime(true) - $startTime;
if ($duration > 1.0) { // Logger si la requête prend plus de 1 seconde
    error_log(sprintf(
        "[PERF] categories.php - %s - %.2fms - Memory: %.2fMB",
        $method,
        $duration * 1000,
        memory_get_peak_usage(true) / 1048576
    ));
}
?>
