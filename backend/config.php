<?php
/**
 * Central PDO configuration and factory
 * - Provides a singleton PDO instance in $pdo for backward compatibility
 * - Uses sensible PDO options: ERRMODE_EXCEPTION, FETCH_ASSOC, EMULATE_PREPARES=false
 * - Optionally uses persistent connections (configurable via env var)
 * - Logs connection failures to backend/config.log for debugging
 *
 * Recommendation: move credentials into environment variables on production
 */

// Read configuration from environment when available, otherwise fall back to hard-coded values
$host = getenv('DB_HOST') ?: '82.197.82.140';
$db   = getenv('DB_NAME') ?: 'u538245909_pos';
$user = getenv('DB_USER') ?: 'u538245909_pos';
$pass = getenv('DB_PASS') ?: '@Le08novembre';
$charset = getenv('DB_CHARSET') ?: 'utf8mb4';

// Allow toggling persistent connections via env (default: false to avoid surprises on some hosts)
$persistent = getenv('DB_PERSISTENT');
if ($persistent === false || $persistent === null) {
    $persistent = false;
} else {
    // Accept '1', 'true', 'on'
    $persistent = in_array(strtolower($persistent), ['1', 'true', 'on'], true);
}

// Build DSN and options
$dsn = "mysql:host=$host;dbname=$db;charset=$charset";
$options = [
    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES   => false,
    // Use persistent only when explicitly enabled
    PDO::ATTR_PERSISTENT         => $persistent,
    // Ensure proper init command for charset/collation
    PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES $charset COLLATE {$charset}_unicode_ci",
];

// Simple retry mechanism (1 retry) to handle transient network glitches
function create_pdo_with_retry(string $dsn, string $user, string $pass, array $options, int $attempts = 2) {
    $lastException = null;
    for ($i = 0; $i < $attempts; $i++) {
        try {
            return new PDO($dsn, $user, $pass, $options);
        } catch (PDOException $e) {
            $lastException = $e;
            // Small backoff (microseconds) to avoid long blocking in web requests
            if ($i < $attempts - 1) {
                usleep(200000); // 200ms
            }
        }
    }
    // If we reach here, rethrow the last exception
    throw $lastException;
}

// Provide a singleton PDO instance and keep $pdo variable for existing code
function get_pdo(): PDO {
    static $instance = null;
    if ($instance instanceof PDO) return $instance;

    global $dsn, $user, $pass, $options;
    try {
        $instance = create_pdo_with_retry($dsn, $user, $pass, $options, 2);
        return $instance;
    } catch (PDOException $e) {
        // Log the error for post-mortem analysis
        $msg = date('c') . " PDO connection error: " . $e->getMessage() . "\n";
        @file_put_contents(__DIR__ . '/config.log', $msg, FILE_APPEND);
        // Return a JSON error and halt (consistent with previous behavior)
        http_response_code(500);
        echo json_encode(['error' => 'Database connection failed']);
        exit;
    }
}

// Create $pdo global for backward compatibility
$pdo = get_pdo();
?>