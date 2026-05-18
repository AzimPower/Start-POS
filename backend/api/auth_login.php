<?php
require_once './_bootstrap.php';
init_api_headers(['POST', 'OPTIONS']);
require_once './_ambassadors.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

require_once '../config.php';
ensure_ambassador_schema($pdo);

function normalize_phone_digits($phone) {
    return preg_replace('/\D+/', '', (string)$phone);
}

function phone_matches_any_candidate($storedPhone, array $normalizedCandidates, array $last8Candidates) {
    $storedDigits = normalize_phone_digits($storedPhone);
    if ($storedDigits === '') {
        return false;
    }

    if (in_array($storedDigits, $normalizedCandidates, true)) {
        return true;
    }

    $storedLast8 = substr($storedDigits, -8);
    return $storedLast8 !== '' && in_array($storedLast8, $last8Candidates, true);
}

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

$data = json_decode(file_get_contents('php://input'), true);
if (!is_array($data)) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid JSON payload']);
    exit;
}

$password = (string)($data['password'] ?? '');
$phoneCandidates = $data['phoneCandidates'] ?? [];
if (!is_array($phoneCandidates)) {
    $phoneCandidates = [];
}

$phoneCandidates = array_values(array_unique(array_filter(array_map(function ($phone) {
    return trim((string)$phone);
}, $phoneCandidates))));

$normalizedPhoneCandidates = array_values(array_unique(array_filter(array_map(function ($phone) {
    return normalize_phone_digits($phone);
}, $phoneCandidates))));

$last8Candidates = array_values(array_unique(array_filter(array_map(function ($digits) {
    return substr($digits, -8);
}, $normalizedPhoneCandidates))));

if (empty($phoneCandidates) || $password === '') {
    http_response_code(422);
    echo json_encode(['error' => 'Phone and password are required']);
    exit;
}

$stmt = $pdo->query(
    "SELECT id, username, phone, email, password, pin, pinEnabled, role, storeId, active, createdAt, promoCode, commissionRate, withdrawalPhone
     FROM users
     WHERE phone IS NOT NULL AND phone <> ''"
);
$users = $stmt->fetchAll();

$authenticatedUser = null;
foreach ($users as $candidate) {
    if (!phone_matches_any_candidate($candidate['phone'] ?? '', $normalizedPhoneCandidates, $last8Candidates)) {
        continue;
    }

    $storedPassword = (string)($candidate['password'] ?? '');
    $isHashed = password_get_info($storedPassword)['algo'] !== null;
    $isValid = $isHashed ? password_verify($password, $storedPassword) : hash_equals($storedPassword, $password);

    if (!$isValid) {
        continue;
    }

    if (!$isHashed) {
        try {
            $rehash = password_hash($password, PASSWORD_DEFAULT);
            $update = $pdo->prepare('UPDATE users SET password = ? WHERE id = ?');
            $update->execute([$rehash, $candidate['id']]);
        } catch (Exception $e) {
        }
    }

    $mappingStmt = $pdo->prepare('SELECT storeId FROM user_stores WHERE userId = ?');
    $mappingStmt->execute([$candidate['id']]);
    $mappings = $mappingStmt->fetchAll(PDO::FETCH_COLUMN);
    $candidate['storeIds'] = normalize_store_ids($mappings, $candidate['storeId'] ?? null);
    $authenticatedUser = $candidate;
    break;
}

if ($authenticatedUser === null) {
    http_response_code(401);
    echo json_encode(['error' => 'Invalid credentials']);
    exit;
}

echo json_encode([
    'token' => issue_auth_token($authenticatedUser),
    'id' => $authenticatedUser['id'],
    'username' => $authenticatedUser['username'],
    'phone' => $authenticatedUser['phone'],
    'email' => $authenticatedUser['email'],
    'role' => $authenticatedUser['role'],
    'storeId' => $authenticatedUser['storeId'],
    'storeIds' => $authenticatedUser['storeIds'],
    'active' => $authenticatedUser['active'],
    'createdAt' => $authenticatedUser['createdAt'],
    'promoCode' => $authenticatedUser['promoCode'] ?? null,
    'commissionRate' => isset($authenticatedUser['commissionRate']) ? (float)$authenticatedUser['commissionRate'] : null,
    'withdrawalPhone' => $authenticatedUser['withdrawalPhone'] ?? null,
    'pin' => $authenticatedUser['pin'],
    'pinEnabled' => $authenticatedUser['pinEnabled'],
]);
?>
