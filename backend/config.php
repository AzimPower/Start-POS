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

function load_env_file(string $path): void {
    if (!is_file($path) || !is_readable($path)) {
        return;
    }

    $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    if ($lines === false) {
        return;
    }

    foreach ($lines as $line) {
        $trimmed = trim($line);
        if ($trimmed === '' || str_starts_with($trimmed, '#') || strpos($trimmed, '=') === false) {
            continue;
        }

        [$key, $value] = explode('=', $trimmed, 2);
        $key = trim($key);
        $value = trim($value);

        if ($key === '' || getenv($key) !== false) {
            continue;
        }

        putenv($key . '=' . trim($value, "\"'"));
        $_ENV[$key] = trim($value, "\"'");
    }
}

load_env_file(dirname(__DIR__) . '/.env');
load_env_file(__DIR__ . '/.env');

function get_env_string(string $key, string $default = ''): string {
    $value = getenv($key);
    if ($value === false || $value === null) {
        return $default;
    }

    return trim((string)$value);
}

function get_required_env(string $key): string {
    $value = get_env_string($key);
    if ($value === '') {
        throw new RuntimeException("Missing required environment variable: {$key}");
    }

    return $value;
}

function configure_smtp_mailer($mail): void {
    $host = get_required_env('SMTP_HOST');
    $username = get_required_env('SMTP_USERNAME');
    $password = get_required_env('SMTP_PASSWORD');
    $fromEmail = get_env_string('SMTP_FROM_EMAIL', $username);
    $fromName = get_env_string('SMTP_FROM_NAME', 'START POS - Notification');
    $port = (int)(get_env_string('SMTP_PORT', '587'));
    $secure = strtolower(get_env_string('SMTP_SECURE', 'tls'));

    $mail->isSMTP();
    $mail->Host = $host;
    $mail->SMTPAuth = true;
    $mail->Username = $username;
    $mail->Password = $password;
    $mail->SMTPSecure = $secure;
    $mail->Port = $port > 0 ? $port : 587;
    $mail->Timeout = 30;
    $mail->SMTPOptions = [
        'ssl' => [
            'verify_peer' => false,
            'verify_peer_name' => false,
            'allow_self_signed' => true,
        ],
    ];

    $mail->setFrom($fromEmail, $fromName);
}

// Read configuration from environment only. Do not keep production secrets in source control.
$host = getenv('DB_HOST') ?: '';
$db   = getenv('DB_NAME') ?: '';
$user = getenv('DB_USER') ?: '';
$pass = getenv('DB_PASS') ?: '';
$charset = getenv('DB_CHARSET') ?: 'utf8mb4';

if ($host === '' || $db === '' || $user === '' || $pass === '') {
    http_response_code(500);
    echo json_encode(['error' => 'Database environment variables are not configured']);
    exit;
}

// IMPORTANT: Connexions persistantes DÉSACTIVÉES pour hébergement mutualisé
// Sur shared hosting (Hostinger), les connexions persistantes causent des fuites:
// - Chaque worker PHP-FPM crée sa propre connexion persistante
// - Les connexions ne sont pas correctement recyclées entre les requêtes
// - Résultat: accumulation rapide de connexions (50+ connexions pour 4 pages !)
// 
// Solution: Connexions NON-persistantes se ferment automatiquement à la fin de chaque requête
// Performance: Overhead négligeable sur connexions locales ou rapides
$persistent = getenv('DB_PERSISTENT');
if ($persistent === false || $persistent === null) {
    // CHANGEMENT CRITIQUE: false par défaut pour shared hosting
    // Mettre DB_PERSISTENT=1 dans .env uniquement pour serveurs dédiés/VPS
    $persistent = false;
} else {
    // Accept '1', 'true', 'on' ou '0', 'false', 'off'
    $persistent = in_array(strtolower($persistent), ['1', 'true', 'on'], true);
}

// Build DSN and options
$dsn = "mysql:host=$host;dbname=$db;charset=$charset";
$options = [
    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES   => false,
    // Use persistent connections for better performance under load
    PDO::ATTR_PERSISTENT         => $persistent,
    // Ensure proper init command for charset/collation
    PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES $charset COLLATE {$charset}_unicode_ci",
    // OPTIMISATIONS PRODUCTION pour 100+ utilisateurs simultanés
    // Timeout de connexion réduit pour éviter les blocages
    PDO::ATTR_TIMEOUT            => 5,
    // Utiliser des curseurs bufferisés pour réduire la mémoire
    PDO::MYSQL_ATTR_USE_BUFFERED_QUERY => true,
    // Compression réseau si supportée (réduit la bande passante)
    PDO::MYSQL_ATTR_COMPRESS     => true,
];

// Keep retries conservative on shared hosting: each failed attempt counts against
// max_connections_per_hour quotas.
function create_pdo_with_retry(string $dsn, string $user, string $pass, array $options, int $attempts = 1) {
    $lastException = null;
    for ($i = 0; $i < $attempts; $i++) {
        try {
            return new PDO($dsn, $user, $pass, $options);
        } catch (PDOException $e) {
            $lastException = $e;
            if (strpos($e->getMessage(), 'max_connections_per_hour') !== false) {
                break;
            }
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
        $instance = create_pdo_with_retry($dsn, $user, $pass, $options, 1);
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
