<?php
require_once './_bootstrap.php';
init_api_headers();
require_once '../config.php';

$method = $_SERVER['REQUEST_METHOD'];
$authClaims = require_auth();

$pdo->exec("
    CREATE TABLE IF NOT EXISTS `receipt_settings` (
        `id` varchar(36) NOT NULL,
        `store_id` varchar(36) NOT NULL,
        `print_logo` tinyint(1) DEFAULT 1,
        `thank_you_message` text DEFAULT NULL,
        `updated_at` bigint(20) NOT NULL,
        PRIMARY KEY (`id`),
        UNIQUE KEY `uniq_receipt_settings_store` (`store_id`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
");

function format_receipt_settings_row(array $row) {
    return [
        'id' => $row['id'] ?? null,
        'storeId' => $row['store_id'] ?? null,
        'printLogo' => !array_key_exists('print_logo', $row) || !empty($row['print_logo']),
        'thankYouMessage' => array_key_exists('thank_you_message', $row) ? (string)($row['thank_you_message'] ?? '') : "Merci pour votre visite !\nA bientot",
        'updatedAt' => isset($row['updated_at']) ? (int)$row['updated_at'] : (time() * 1000),
    ];
}

function default_receipt_settings_payload($storeId) {
    return [
        'id' => null,
        'storeId' => $storeId,
        'printLogo' => true,
        'thankYouMessage' => "Merci pour votre visite !\nA bientot",
        'updatedAt' => time() * 1000,
    ];
}

try {
    switch ($method) {
        case 'GET':
            if (isset($_GET['storeId'])) {
                $storeId = ensure_store_access($authClaims, $_GET['storeId']);
                $stmt = $pdo->prepare('SELECT * FROM receipt_settings WHERE store_id = ?');
                $stmt->execute([$storeId]);
                $result = $stmt->fetch(PDO::FETCH_ASSOC);

                if ($result) {
                    echo json_encode(format_receipt_settings_row($result));
                } else {
                    echo json_encode(default_receipt_settings_payload($storeId));
                }
            } else {
                if (!is_super_admin_claims($authClaims)) {
                    http_response_code(403);
                    echo json_encode(['error' => 'storeId is required']);
                    break;
                }

                $stmt = $pdo->query('SELECT * FROM receipt_settings ORDER BY updated_at DESC');
                $results = $stmt->fetchAll(PDO::FETCH_ASSOC);
                $formatted = array_map('format_receipt_settings_row', $results);

                echo json_encode($formatted);
            }
            break;

        case 'POST':
        case 'PUT':
            $input = json_decode(file_get_contents('php://input'), true);

            if (!$input || !isset($input['storeId'])) {
                http_response_code(400);
                echo json_encode(['error' => 'storeId is required']);
                break;
            }

            $storeId = ensure_store_access($authClaims, $input['storeId']);
            $printLogo = isset($input['printLogo']) ? (int)!!$input['printLogo'] : 1;
            $thankYouMessage = array_key_exists('thankYouMessage', $input)
                ? str_replace("\r\n", "\n", str_replace("\r", "\n", (string)($input['thankYouMessage'] ?? '')))
                : "Merci pour votre visite !\nA bientot";
            $updatedAt = isset($input['updatedAt']) ? (int)$input['updatedAt'] : (time() * 1000);

            $checkStmt = $pdo->prepare('SELECT id FROM receipt_settings WHERE store_id = ?');
            $checkStmt->execute([$storeId]);
            $existing = $checkStmt->fetch(PDO::FETCH_ASSOC);

            if ($existing) {
                $stmt = $pdo->prepare('
                    UPDATE receipt_settings
                    SET print_logo = ?, thank_you_message = ?, updated_at = ?
                    WHERE store_id = ?
                ');
                $stmt->execute([
                    $printLogo,
                    $thankYouMessage,
                    $updatedAt,
                    $storeId,
                ]);
                $id = $existing['id'];
            } else {
                $id = $input['id'] ?? uniqid();
                $stmt = $pdo->prepare('
                    INSERT INTO receipt_settings (id, store_id, print_logo, thank_you_message, updated_at)
                    VALUES (?, ?, ?, ?, ?)
                ');
                $stmt->execute([
                    $id,
                    $storeId,
                    $printLogo,
                    $thankYouMessage,
                    $updatedAt,
                ]);
            }

            echo json_encode([
                'id' => $id,
                'storeId' => $storeId,
                'printLogo' => (bool)$printLogo,
                'thankYouMessage' => $thankYouMessage,
                'updatedAt' => $updatedAt,
            ]);
            break;

        case 'DELETE':
            if (isset($_GET['id'])) {
                if (!is_super_admin_claims($authClaims)) {
                    $lookup = $pdo->prepare('SELECT store_id FROM receipt_settings WHERE id = ?');
                    $lookup->execute([$_GET['id']]);
                    $targetStoreId = $lookup->fetchColumn();
                    ensure_store_access($authClaims, $targetStoreId !== false ? (string)$targetStoreId : null);
                }
                $stmt = $pdo->prepare('DELETE FROM receipt_settings WHERE id = ?');
                $stmt->execute([$_GET['id']]);
                echo json_encode(['success' => true]);
            } else {
                http_response_code(400);
                echo json_encode(['error' => 'ID is required']);
            }
            break;

        default:
            http_response_code(405);
            echo json_encode(['error' => 'Method not allowed']);
            break;
    }
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Database error: ' . $e->getMessage()]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Server error: ' . $e->getMessage()]);
}
?>
