
<?php
// Afficher les erreurs PHP pour le debug
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);

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

try {
    switch ($method) {
        case 'GET':
            $stmt = $pdo->query('SELECT * FROM stores');
            $stores = $stmt->fetchAll();
            echo json_encode($stores);
            break;
        case 'POST':
            $data = json_decode(file_get_contents('php://input'), true);
            $sql = 'INSERT INTO stores (id, name, address, logo, active, createdAt, subscriptionStart, subscriptionEnd, lastPayment) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)';
            $stmt = $pdo->prepare($sql);
            $id = $data['id'] ?? uniqid();
            $stmt->execute([
                $id,
                $data['name'],
                $data['address'],
                $data['logo'] ?? null,
                $data['active'] ?? true,
                $data['createdAt'] ?? time()*1000,
                $data['subscriptionStart'] ?? null,
                $data['subscriptionEnd'] ?? null,
                $data['lastPayment'] ?? null
            ]);
            echo json_encode(['success' => true, 'id' => $id]);
            break;
        case 'PUT':
            $data = json_decode(file_get_contents('php://input'), true);
            if (!$data || !isset($data['id'])) {
                echo json_encode(['success' => false, 'error' => 'ID manquant ou données invalides']);
                exit;
            }
            $sql = 'UPDATE stores SET name=?, address=?, logo=?, active=?, createdAt=?, subscriptionStart=?, subscriptionEnd=?, lastPayment=? WHERE id=?';
            $stmt = $pdo->prepare($sql);
            $stmt->execute([
                $data['name'],
                $data['address'],
                $data['logo'] ?? null,
                $data['active'],
                $data['createdAt'],
                $data['subscriptionStart'],
                $data['subscriptionEnd'],
                $data['lastPayment'],
                $data['id']
            ]);
            echo json_encode(['success' => true]);
            break;
        case 'DELETE':
            // Essayer d'obtenir l'id depuis le body JSON ou la query string
            $data = json_decode(file_get_contents('php://input'), true);
            $id = $data['id'] ?? ($_GET['id'] ?? null);
            if ($id) {
                // Log de debug
                error_log('Suppression magasin id=' . $id);
                try {
                    // Supprimer les utilisateurs liés
                    $stmt = $pdo->prepare('DELETE FROM users WHERE storeId=?');
                    $stmt->execute([$id]);
                    // Supprimer les ventes liées
                    $stmt = $pdo->prepare('DELETE FROM sales WHERE storeId=?');
                    $stmt->execute([$id]);
                    // Supprimer les produits liés
                    $stmt = $pdo->prepare('DELETE FROM products WHERE storeId=?');
                    $stmt->execute([$id]);
                    // Supprimer les catégories liées
                    $stmt = $pdo->prepare('DELETE FROM categories WHERE storeId=?');
                    $stmt->execute([$id]);
                    // Supprimer les dépenses liées
                    $stmt = $pdo->prepare('DELETE FROM expenses WHERE storeId=?');
                    $stmt->execute([$id]);
                    // Correction des noms de tables
                    $stmt = $pdo->prepare('DELETE FROM expenses_advanced WHERE storeId=?');
                    $stmt->execute([$id]);
                    $stmt = $pdo->prepare('DELETE FROM expense_categories WHERE storeId=?');
                    $stmt->execute([$id]);
                    // Supprimer les shifts liés
                    $stmt = $pdo->prepare('DELETE FROM shifts WHERE storeId=?');
                    $stmt->execute([$id]);
                    // Supprimer les signaux de stock liés
                    $stmt = $pdo->prepare('DELETE FROM stock_signals WHERE storeId=?');
                    $stmt->execute([$id]);
                    // Enfin, supprimer le magasin
                    $stmt = $pdo->prepare('DELETE FROM stores WHERE id=?');
                    $stmt->execute([$id]);
                    $deleted = $stmt->rowCount();
                    error_log('Résultat suppression magasin: ' . $deleted . ' ligne(s) supprimée(s)');
                    echo json_encode(['success' => true, 'deleted' => $deleted]);
                } catch (PDOException $ex) {
                    error_log('Erreur SQL suppression magasin: ' . $ex->getMessage());
                    http_response_code(500);
                    echo json_encode(['success' => false, 'error' => $ex->getMessage()]);
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
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
?>