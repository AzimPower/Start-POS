<?php
if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    echo "CLI only\n";
    exit(1);
}

require_once __DIR__ . '/config.php';

$now = (int)round(microtime(true) * 1000);

try {
    $select = $pdo->prepare('SELECT id FROM notifications WHERE active = 1 AND expiresAt IS NOT NULL AND expiresAt < ?');
    $select->execute([$now]);
    $expiredIds = $select->fetchAll(PDO::FETCH_COLUMN);

    if (empty($expiredIds)) {
        echo "No expired notifications to purge\n";
        exit(0);
    }

    $placeholders = implode(',', array_fill(0, count($expiredIds), '?'));

    $pdo->beginTransaction();

    $deleteReads = $pdo->prepare("DELETE FROM notification_reads WHERE notificationId IN ($placeholders)");
    $deleteReads->execute($expiredIds);

    $deleteDismissals = $pdo->prepare("DELETE FROM notification_dismissals WHERE notificationId IN ($placeholders)");
    $deleteDismissals->execute($expiredIds);

    $deleteNotifications = $pdo->prepare("DELETE FROM notifications WHERE id IN ($placeholders)");
    $deleteNotifications->execute($expiredIds);

    $pdo->commit();

    echo 'Purged notifications: ' . count($expiredIds) . "\n";
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }

    fwrite(STDERR, 'Cleanup failed: ' . $e->getMessage() . "\n");
    exit(1);
}