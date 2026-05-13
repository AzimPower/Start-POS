<?php
require_once './_bootstrap.php';
init_api_headers(['GET', 'OPTIONS']);
require_once '../config.php';

$authClaims = require_auth();

function resolve_store_logo_file_path($logoValue) {
    $logo = trim((string)($logoValue ?? ''));
    if ($logo === '') {
        return null;
    }

    if (strpos($logo, 'data:') === 0) {
        return ['type' => 'data', 'value' => $logo];
    }

    $candidate = $logo;
    if (preg_match('#https?://[^/]+/(.*)#i', $logo, $matches) === 1) {
        $candidate = $matches[1];
    } else {
        $parsedPath = parse_url($logo, PHP_URL_PATH);
        if (is_string($parsedPath) && trim($parsedPath) !== '') {
            $candidate = $parsedPath;
        }
    }

    $relative = null;
    $pos = strpos($candidate, 'img_products/');
    if ($pos !== false) {
        $relative = substr($candidate, $pos);
    } else {
        $basename = basename((string)$candidate);
        if ($basename !== '') {
            $relative = 'img_products/' . $basename;
        }
    }

    if ($relative === null) {
        return null;
    }

    $filePath = realpath(__DIR__ . '/../' . ltrim($relative, '/'));
    $imageDir = realpath(__DIR__ . '/../img_products/');
    if (!$filePath || !$imageDir || strpos($filePath, $imageDir) !== 0 || !is_file($filePath)) {
        return null;
    }

    return ['type' => 'file', 'value' => $filePath];
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

$storeId = ensure_store_access($authClaims, $_GET['storeId'] ?? null);
if ($storeId === null || trim((string)$storeId) === '') {
    http_response_code(400);
    echo json_encode(['error' => 'Missing storeId']);
    exit;
}

$stmt = $pdo->prepare('SELECT logo FROM stores WHERE id = ? LIMIT 1');
$stmt->execute([$storeId]);
$store = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$store || empty($store['logo'])) {
    http_response_code(404);
    echo json_encode(['error' => 'Logo not found']);
    exit;
}

$resolvedLogo = resolve_store_logo_file_path($store['logo']);
if ($resolvedLogo === null) {
    http_response_code(404);
    echo json_encode(['error' => 'Logo file unavailable']);
    exit;
}

if ($resolvedLogo['type'] === 'data') {
    echo json_encode([
        'dataUrl' => $resolvedLogo['value'],
        'source' => $store['logo'],
    ]);
    exit;
}

$fileContents = @file_get_contents($resolvedLogo['value']);
if ($fileContents === false) {
    http_response_code(500);
    echo json_encode(['error' => 'Unable to read logo file']);
    exit;
}

$mimeType = 'image/png';
if (function_exists('finfo_open')) {
    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    if ($finfo) {
        $detectedType = finfo_file($finfo, $resolvedLogo['value']);
        if (is_string($detectedType) && trim($detectedType) !== '') {
            $mimeType = $detectedType;
        }
        finfo_close($finfo);
    }
}

echo json_encode([
    'dataUrl' => 'data:' . $mimeType . ';base64,' . base64_encode($fileContents),
    'source' => $store['logo'],
]);
