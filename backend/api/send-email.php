<?php
require_once '../config.php';
require_once __DIR__ . '/_bootstrap.php';

init_api_headers(['POST', 'OPTIONS']);
header('Access-Control-Max-Age: 86400');
require_auth();

use PHPMailer\PHPMailer\Exception;
use PHPMailer\PHPMailer\PHPMailer;

require __DIR__ . '/../mail/PHPMailer-master/src/Exception.php';
require __DIR__ . '/../mail/PHPMailer-master/src/PHPMailer.php';
require __DIR__ . '/../mail/PHPMailer-master/src/SMTP.php';

function logDebug($message, $data = null): void {
    $timestamp = date('Y-m-d H:i:s');
    $userAgent = $_SERVER['HTTP_USER_AGENT'] ?? 'Unknown';
    $isMobile = preg_match('/Mobile|Android|iPhone|iPad/', $userAgent) ? 'MOBILE' : 'DESKTOP';
    error_log("[$timestamp] [$isMobile] $message" . ($data ? ' | Data: ' . json_encode($data) : ''));
}

$rawInput = file_get_contents('php://input');
logDebug('Email request received', [
    'content_length' => strlen((string)$rawInput),
    'user_agent' => $_SERVER['HTTP_USER_AGENT'] ?? 'Unknown',
    'remote_addr' => $_SERVER['REMOTE_ADDR'] ?? 'Unknown',
    'request_method' => $_SERVER['REQUEST_METHOD'] ?? 'Unknown',
]);

if (empty($rawInput)) {
    logDebug('Empty request body received');
    echo json_encode(['ok' => false, 'error' => 'Corps de requete vide']);
    exit;
}

$data = json_decode($rawInput, true);
if (json_last_error() !== JSON_ERROR_NONE || !is_array($data)) {
    logDebug('JSON decode error', ['error' => json_last_error_msg()]);
    echo json_encode(['ok' => false, 'error' => 'Format JSON invalide']);
    exit;
}

$name = trim((string)($data['name'] ?? ''));
$email = trim((string)($data['email'] ?? ''));
$message = (string)($data['message'] ?? '');
$storeName = trim((string)($data['storeName'] ?? ''));

logDebug('Email data parsed', [
    'name' => $name,
    'email' => $email,
    'has_message' => $message !== '',
    'store_name' => $storeName,
]);

if ($name === '' || $email === '' || $message === '') {
    logDebug('Missing required fields', [
        'name' => $name !== '',
        'email' => $email !== '',
        'message' => $message !== '',
    ]);
    echo json_encode(['ok' => false, 'error' => 'Champs manquants (name, email, message requis)']);
    exit;
}

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    echo json_encode(['ok' => false, 'error' => 'Adresse email invalide']);
    exit;
}

$mail = new PHPMailer(true);

try {
    logDebug('Starting email configuration');
    configure_smtp_mailer($mail);

    if (preg_match('/Mobile|Android|iPhone|iPad/', $_SERVER['HTTP_USER_AGENT'] ?? '')) {
        $mail->SMTPDebug = 0;
    }

    $mail->addAddress($email);
    $mail->isHTML(true);
    $mail->CharSet = 'UTF-8';
    $mail->Encoding = '8bit';

    $isStockSignal = strpos($message, 'Details du Stock') !== false || strpos($message, 'ID du Signalement') !== false || strpos($message, 'Performance:') !== false;
    $isStockAdjustment = strpos($message, 'Ajustement de stock') !== false || strpos($message, 'Produits ajustes') !== false;
    $isLowStock = strpos($message, 'Stock faible') !== false;
    $isOutOfStock = strpos($message, 'Rupture de stock') !== false;
    $isExpense = strpos($message, 'Depense') !== false || strpos($message, 'ID de la depense') !== false;
    $isLogin = strpos($message, 'Connexion Utilisateur') !== false || strpos($message, 'ID Utilisateur') !== false;
    $isRefund = strpos($message, 'Remboursement de Vente') !== false || strpos($message, 'ID de la Vente') !== false || strpos($message, 'Articles Rembourses') !== false;

    $safeStoreSuffix = $storeName !== '' ? ' [' . htmlspecialchars($storeName, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') . ']' : '';
    if ($isOutOfStock) {
        $subject = "Rupture de Stock - $name" . ($storeName !== '' ? " [$storeName]" : '');
        $headerTitle = "Alerte de Rupture de Stock{$safeStoreSuffix}";
        $headerSubtitle = 'Notification critique de stock du systeme POS';
    } elseif ($isLowStock) {
        $subject = "Stock Faible - $name" . ($storeName !== '' ? " [$storeName]" : '');
        $headerTitle = "Alerte de Stock Faible{$safeStoreSuffix}";
        $headerSubtitle = 'Notification automatique de seuil de stock';
    } elseif ($isStockAdjustment) {
        $subject = "Ajustement de Stock - $name" . ($storeName !== '' ? " [$storeName]" : '');
        $headerTitle = "Notification d'Ajustement de Stock{$safeStoreSuffix}";
        $headerSubtitle = "Resume automatique d'un ajustement manuel de stock";
    } elseif ($isStockSignal) {
        $subject = "Signalement de Stock - $name" . ($storeName !== '' ? " [$storeName]" : '');
        $headerTitle = "Notification de Signalement de Stock{$safeStoreSuffix}";
        $headerSubtitle = 'Rapport automatique de performance stock';
    } elseif ($isExpense) {
        $isEdit = strpos($message, 'modifiee') !== false;
        $subject = ($isEdit ? 'Modification de Depense' : 'Nouvelle Depense') . " - $name" . ($storeName !== '' ? " [$storeName]" : '');
        $headerTitle = ($isEdit ? 'Depense Modifiee' : 'Nouvelle Depense') . $safeStoreSuffix;
        $headerSubtitle = $isEdit
            ? "Modification d'une depense dans le systeme POS"
            : 'Nouvelle depense enregistree dans le systeme POS';
    } elseif ($isLogin) {
        $subject = "Connexion Utilisateur - $name" . ($storeName !== '' ? " [$storeName]" : '');
        $headerTitle = "Connexion Utilisateur{$safeStoreSuffix}";
        $headerSubtitle = 'Notification de connexion au systeme POS';
    } elseif ($isRefund) {
        $subject = "Remboursement de Vente - $name" . ($storeName !== '' ? " [$storeName]" : '');
        $headerTitle = "Remboursement de Vente{$safeStoreSuffix}";
        $headerSubtitle = 'Notification de remboursement dans le systeme POS';
    } else {
        $subject = "Fermeture de Service - $name" . ($storeName !== '' ? " [$storeName]" : '');
        $headerTitle = "Notification de Fermeture de Shift{$safeStoreSuffix}";
        $headerSubtitle = 'Rapport automatique du systeme POS';
    }

    $mail->Subject = $subject;
    $mail->Body = "
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset='UTF-8'>
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; background-color: #f4f4f4; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 20px auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; padding: 30px 20px; text-align: center; }
            .header h1 { margin: 0; font-size: 24px; font-weight: 600; }
            .header p { margin: 5px 0 0 0; font-size: 14px; opacity: 0.9; }
            .content { padding: 30px 20px; }
            .footer { background: #f8f9fa; padding: 20px; text-align: center; font-size: 12px; color: #6c757d; border-top: 1px solid #e9ecef; }
        </style>
    </head>
    <body>
        <div class='container'>
            <div class='header'>
                <h1>{$headerTitle}</h1>
                <p>{$headerSubtitle}</p>
            </div>
            <div class='content'>{$message}</div>
            <div class='footer'>
                <p>Cet email a ete envoye automatiquement par le systeme POS Power Start</p>
                <p style='margin-top: 10px; color: #adb5bd;'>&copy; " . date('Y') . " Power Start - Tous droits reserves</p>
            </div>
        </div>
    </body>
    </html>";
    $mail->AltBody = "Nom: {$name}\nEmail: {$email}\nMessage:\n{$message}";

    logDebug('Attempting to send email', ['to' => $email, 'subject' => $subject]);
    $mail->send();

    logDebug('Email sent successfully', ['to' => $email]);
    echo json_encode(['ok' => true, 'message' => 'Email envoye avec succes']);
} catch (Throwable $e) {
    logDebug('Email sending failed', [
        'error' => $e->getMessage(),
        'code' => $e->getCode(),
        'to' => $email,
    ]);

    echo json_encode([
        'ok' => false,
        'error' => "Echec de l'envoi de l'email",
    ]);
}
