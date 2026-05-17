<?php

function get_allowed_origins(): array {
    $configured = getenv('APP_ALLOWED_ORIGINS') ?: getenv('CORS_ALLOWED_ORIGINS') ?: '';
    if ($configured !== '') {
        return array_values(array_filter(array_map('trim', explode(',', $configured))));
    }

    return [
        'http://localhost:*',
        'https://localhost:*',
        'http://127.0.0.1:*',
        'https://127.0.0.1:*',
        'capacitor://localhost',
        'ionic://localhost',
        'https://start-pos.com',
    ];
}

function origin_matches_pattern(string $origin, string $pattern): bool {
    $origin = trim($origin);
    $pattern = trim($pattern);
    if ($origin === '' || $pattern === '') {
        return false;
    }

    if ($pattern === '*') {
        return true;
    }

    if (strpos($pattern, '*') === false) {
        return $origin === $pattern;
    }

    $regex = '/^' . str_replace('\*', '.*', preg_quote($pattern, '/')) . '$/i';
    return preg_match($regex, $origin) === 1;
}

function is_origin_allowed(?string $origin, array $allowedOrigins): bool {
    if ($origin === null || trim($origin) === '') {
        return true;
    }

    foreach ($allowedOrigins as $allowedOrigin) {
        if (origin_matches_pattern($origin, (string)$allowedOrigin)) {
            return true;
        }
    }

    return false;
}

function init_api_headers(array $methods = ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']): void {
    $allowedOrigins = get_allowed_origins();
    $origin = $_SERVER['HTTP_ORIGIN'] ?? null;

    if (in_array('*', $allowedOrigins, true)) {
        header('Access-Control-Allow-Origin: *');
    } elseif ($origin !== null && is_origin_allowed($origin, $allowedOrigins)) {
        header('Access-Control-Allow-Origin: ' . trim($origin));
        header('Vary: Origin');
    } else {
        header('Access-Control-Allow-Origin: *');
    }

    header('Access-Control-Allow-Methods: ' . implode(', ', $methods));
    header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, Accept, Origin, Cache-Control, Pragma');
    header('Access-Control-Max-Age: 86400');
    header('Content-Type: application/json');

    if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
        http_response_code(200);
        exit;
    }
}

function base64url_encode(string $input): string {
    return rtrim(strtr(base64_encode($input), '+/', '-_'), '=');
}

function base64url_decode(string $input): string|false {
    $padding = strlen($input) % 4;
    if ($padding > 0) {
        $input .= str_repeat('=', 4 - $padding);
    }
    return base64_decode(strtr($input, '-_', '+/'));
}

function get_auth_secret(): string {
    $secret = getenv('APP_AUTH_SECRET') ?: getenv('DB_PASS') ?: '';
    if ($secret === '') {
        $secret = 'dev-only-change-me';
    }
    return $secret;
}

function issue_auth_token(array $user, int $ttlSeconds = 604800): string {
    $now = time();
    $payload = [
        'sub' => (string)($user['id'] ?? ''),
        'role' => (string)($user['role'] ?? ''),
        'storeId' => (string)($user['storeId'] ?? ''),
        'storeIds' => array_values(array_unique(array_filter(array_map('strval', $user['storeIds'] ?? [])))),
        'username' => (string)($user['username'] ?? ''),
        'iat' => $now,
        'exp' => $now + max(300, $ttlSeconds),
    ];

    if (empty($payload['storeIds']) && $payload['storeId'] !== '') {
        $payload['storeIds'][] = $payload['storeId'];
    }

    $header = ['alg' => 'HS256', 'typ' => 'JWT'];
    $encodedHeader = base64url_encode(json_encode($header));
    $encodedPayload = base64url_encode(json_encode($payload));
    $signature = hash_hmac('sha256', $encodedHeader . '.' . $encodedPayload, get_auth_secret(), true);

    return $encodedHeader . '.' . $encodedPayload . '.' . base64url_encode($signature);
}

function verify_auth_token(string $token): ?array {
    $parts = explode('.', trim($token));
    if (count($parts) !== 3) {
        return null;
    }

    [$encodedHeader, $encodedPayload, $encodedSignature] = $parts;
    $expectedSignature = base64url_encode(hash_hmac('sha256', $encodedHeader . '.' . $encodedPayload, get_auth_secret(), true));
    if (!hash_equals($expectedSignature, $encodedSignature)) {
        return null;
    }

    $payloadJson = base64url_decode($encodedPayload);
    if ($payloadJson === false) {
        return null;
    }

    $payload = json_decode($payloadJson, true);
    if (!is_array($payload)) {
        return null;
    }

    if (!isset($payload['exp']) || time() >= intval($payload['exp'])) {
        return null;
    }

    return $payload;
}

function get_bearer_token(): ?string {
    $header = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['Authorization'] ?? '';
    if ($header === '' && function_exists('getallheaders')) {
        $headers = getallheaders();
        $header = $headers['Authorization'] ?? $headers['authorization'] ?? '';
    }

    if (preg_match('/Bearer\s+(.+)/i', (string)$header, $matches) === 1) {
        return trim($matches[1]);
    }

    return null;
}

function require_auth(): array {
    $token = get_bearer_token();
    if ($token === null) {
        http_response_code(401);
        echo json_encode(['error' => 'Missing authorization token']);
        exit;
    }

    $claims = verify_auth_token($token);
    if ($claims === null) {
        http_response_code(401);
        echo json_encode(['error' => 'Invalid or expired authorization token']);
        exit;
    }

    return $claims;
}

function get_claim_store_ids(array $claims): array {
    $storeIds = $claims['storeIds'] ?? [];
    if (!is_array($storeIds)) {
        $storeIds = [];
    }
    $storeIds = array_values(array_unique(array_filter(array_map('strval', $storeIds))));

    $primary = trim((string)($claims['storeId'] ?? ''));
    if ($primary !== '' && !in_array($primary, $storeIds, true)) {
        $storeIds[] = $primary;
    }

    return $storeIds;
}

function is_super_admin_claims(array $claims): bool {
    return (string)($claims['role'] ?? '') === 'super_admin';
}

function ensure_store_access(array $claims, ?string $storeId): ?string {
    $normalizedStoreId = trim((string)($storeId ?? ''));
    if (is_super_admin_claims($claims)) {
        return $normalizedStoreId;
    }

    $allowedStoreIds = get_claim_store_ids($claims);
    if ($normalizedStoreId === '') {
        if (!empty($allowedStoreIds)) {
            return $allowedStoreIds[0];
        }

        http_response_code(403);
        echo json_encode(['error' => 'No store access available']);
        exit;
    }

    if (!in_array($normalizedStoreId, $allowedStoreIds, true)) {
        http_response_code(403);
        echo json_encode(['error' => 'Store access denied']);
        exit;
    }

    return $normalizedStoreId;
}
