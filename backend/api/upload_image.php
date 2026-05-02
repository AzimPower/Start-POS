<?php
require_once '../config.php';
require_once __DIR__ . '/_bootstrap.php';

init_api_headers(['POST', 'DELETE', 'OPTIONS']);
require_auth();


if ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
    // Suppression d'une image
    $rawInput = file_get_contents('php://input');
    error_log('UPLOAD DELETE raw input: ' . $rawInput);
    $input = json_decode($rawInput, true);
    $url = $input['url'] ?? '';
    if (!$url) {
        http_response_code(400);
        echo json_encode(['error' => 'No image url provided']);
        exit;
    }

    // Accepter une URL complète ou un chemin relatif. Extraire le chemin relatif sous "img_products/"
    $relative = null;
    // Si c'est une URL complète, extraire tout ce qui suit le domaine
    if (preg_match('#https?://[^/]+/(.*)#i', $url, $m)) {
        $candidate = $m[1];
        // Chercher "img_products/" dans le chemin
        $pos = strpos($candidate, 'img_products/');
        if ($pos !== false) {
            $relative = substr($candidate, $pos);
        } else {
            // fallback: utiliser le basename dans img_products
            $relative = 'img_products/' . basename($candidate);
        }
    } else {
        // Pas une URL complète : peut-être déjà "img_products/xxx" ou "/backend/img_products/xxx"
        $pos = strpos($url, 'img_products/');
        if ($pos !== false) {
            $relative = substr($url, $pos);
        } else {
            // Utiliser telle quelle
            $relative = ltrim($url, '/');
        }
    }

    // Sécurité : ne supprimer que dans img_products
    $file = realpath(__DIR__ . '/../' . $relative);
    $imgDir = realpath(__DIR__ . '/../img_products/');
    error_log('UPLOAD DELETE resolved file: ' . var_export($file, true));
    if ($file && $imgDir && strpos($file, $imgDir) === 0 && file_exists($file)) {
        if (unlink($file)) {
            echo json_encode(['success' => true]);
        } else {
            http_response_code(500);
            error_log('UPLOAD DELETE failed to unlink: ' . $file);
            echo json_encode(['error' => 'Failed to delete image file']);
        }
    } else {
        http_response_code(404);
        error_log('UPLOAD DELETE file not found or forbidden: ' . $relative);
        echo json_encode(['error' => 'File not found or forbidden', 'tried' => $relative]);
    }
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

// Créer le dossier img_products s'il n'existe pas
$uploadDir = '../img_products/';
if (!file_exists($uploadDir)) {
    mkdir($uploadDir, 0777, true);
}

// Récupérer l'image en base64 depuis la requête
$rawInput = file_get_contents('php://input');
error_log('UPLOAD POST raw input: ' . substr($rawInput, 0, 2000));
$input = json_decode($rawInput, true);
$imageData = $input['image'] ?? null;

if (!$imageData) {
    http_response_code(400);
    echo json_encode(['error' => 'No image data provided']);
    exit;
}

// Extraire le type MIME et les données de l'image
if (preg_match('/^data:image\/(\w+);base64,/', $imageData, $type)) {
    $imageData = substr($imageData, strpos($imageData, ',') + 1);
    $type = strtolower($type[1]); // jpg, png, gif

    if (!in_array($type, ['jpg', 'jpeg', 'png', 'gif'])) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid image type']);
        exit;
    }

    $imageData = base64_decode($imageData);

    if ($imageData === false) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid image data']);
        exit;
    }
} else {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid image format']);
    exit;
}

// Générer un nom de fichier unique
$filename = uniqid() . '.' . $type;
$filePath = $uploadDir . $filename;

// Sauvegarder l'image
if (file_put_contents($filePath, $imageData)) {
    // Retourner l'URL relative de l'image
    $imageUrl = 'img_products/' . $filename;
    echo json_encode([
        'success' => true,
        'url' => $imageUrl
    ]);
} else {
    http_response_code(500);
    echo json_encode(['error' => 'Failed to save image']);
}
