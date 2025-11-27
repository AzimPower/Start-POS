<?php
// Headers CORS améliorés pour mobile
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Cache-Control, User-Agent, Authorization, X-Requested-With");
header("Access-Control-Max-Age: 86400"); // 24h cache pour preflight
header("Content-Type: application/json; charset=utf-8");

// Gérer les requêtes OPTIONS (preflight CORS)
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Logging pour debug mobile
function logDebug($message, $data = null) {
    $timestamp = date('Y-m-d H:i:s');
    $userAgent = $_SERVER['HTTP_USER_AGENT'] ?? 'Unknown';
    $isMobile = preg_match('/Mobile|Android|iPhone|iPad/', $userAgent) ? 'MOBILE' : 'DESKTOP';
    
    error_log("[$timestamp] [$isMobile] $message" . ($data ? ' | Data: ' . json_encode($data) : ''));
}

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception;

// Chemins mis à jour (depuis /backend/api/)
require __DIR__ . '/../mail/PHPMailer-master/src/Exception.php';
require __DIR__ . '/../mail/PHPMailer-master/src/PHPMailer.php';
require __DIR__ . '/../mail/PHPMailer-master/src/SMTP.php';

// Récupérer les données JSON avec validation améliorée
$rawInput = file_get_contents("php://input");
logDebug("Email request received", [
    'content_length' => strlen($rawInput),
    'user_agent' => $_SERVER['HTTP_USER_AGENT'] ?? 'Unknown',
    'remote_addr' => $_SERVER['REMOTE_ADDR'] ?? 'Unknown',
    'request_method' => $_SERVER['REQUEST_METHOD'] ?? 'Unknown'
]);

if (empty($rawInput)) {
    logDebug("Empty request body received");
    echo json_encode(["ok" => false, "error" => "Corps de requête vide"]);
    exit;
}

$data = json_decode($rawInput, true);

if (json_last_error() !== JSON_ERROR_NONE) {
    logDebug("JSON decode error", ['error' => json_last_error_msg()]);
    echo json_encode(["ok" => false, "error" => "Format JSON invalide: " . json_last_error_msg()]);
    exit;
}

$name = $data["name"] ?? "";
$email = $data["email"] ?? "";
$message = $data["message"] ?? "";
$storeName = $data["storeName"] ?? "";

logDebug("Email data parsed", [
    'name' => $name,
    'email' => $email,
    'has_message' => !empty($message),
    'store_name' => $storeName
]);

if (!$name || !$email || !$message) {
    logDebug("Missing required fields", [
        'name' => !empty($name),
        'email' => !empty($email), 
        'message' => !empty($message)
    ]);
    echo json_encode(["ok" => false, "error" => "Champs manquants (name, email, message requis)"]);
    exit;
}

$mail = new PHPMailer(true);

try {
    logDebug("Starting email configuration");
    
    // CONFIG SMTP avec timeouts adaptés mobile
    $mail->isSMTP();
    $mail->Host       = 'smtp.gmail.com';
    $mail->SMTPAuth   = true;
    $mail->Username   = 'powerstartbf@gmail.com';
    $mail->Password   = 'ffpafdcbtqeihljp';
    $mail->SMTPSecure = 'tls';
    $mail->Port       = 587;
    
    // Timeouts et options pour mobile
    $mail->Timeout    = 30; // 30 secondes
    $mail->SMTPOptions = array(
        'ssl' => array(
            'verify_peer' => false,
            'verify_peer_name' => false,
            'allow_self_signed' => true
        )
    );
    
    // Debug SMTP pour mobile si nécessaire
    if (preg_match('/Mobile|Android|iPhone|iPad/', $_SERVER['HTTP_USER_AGENT'] ?? '')) {
        $mail->SMTPDebug = 0; // Désactiver en production, 2 pour debug
    }


    // Config de l'email avec encodage UTF-8
    $mail->setFrom('powerstartbf@gmail.com', 'START POS - Notification');
    $mail->addAddress($email);
    $mail->isHTML(true);
    $mail->CharSet = 'UTF-8';
    $mail->Encoding = '8bit';


    // Déterminer le type de notification basé sur le contenu
    $isStockSignal = strpos($message, 'Détails du Stock') !== false || strpos($message, 'ID du Signalement') !== false || strpos($message, 'Performance:') !== false;
    $isExpense = strpos($message, '💸 Dépense') !== false || strpos($message, 'ID de la dépense') !== false;
    $isLogin = strpos($message, '🔐 Connexion Utilisateur') !== false || strpos($message, 'ID Utilisateur') !== false;
    $isRefund = strpos($message, '↩️ Remboursement de Vente') !== false || strpos($message, 'ID de la Vente') !== false || strpos($message, 'Articles Remboursés') !== false;

    $storeSuffix = $storeName ? " [" . htmlspecialchars($storeName) . "]" : "";
    $storeSuffixHtml = $storeName ? " <span style='font-size:15px;color:#fff;opacity:0.85;'>[" . htmlspecialchars($storeName) . "]</span>" : "";
    if ($isStockSignal) {
        $subject = "Signalement de Stock - $name" . $storeSuffix;
        $headerTitle = "📦 Notification de Signalement de Stock" . $storeSuffixHtml;
        $headerSubtitle = "Rapport automatique de performance stock";
    } elseif ($isExpense) {
        $isEdit = strpos($message, 'modifiee') !== false;
        $subject = ($isEdit ? "Modification de Depense" : "Nouvelle Depense") . " - $name" . $storeSuffix;
        $headerTitle = ($isEdit ? "✏️ Dépense Modifiée" : "💸 Nouvelle Dépense") . $storeSuffixHtml;
        $headerSubtitle = $isEdit ? "Modification d'une dépense dans le système POS" : "Nouvelle dépense enregistrée dans le système POS";
    } elseif ($isLogin) {
        $subject = "Connexion Utilisateur - $name" . $storeSuffix;
        $headerTitle = "🔐 Connexion Utilisateur" . $storeSuffixHtml;
        $headerSubtitle = "Notification de connexion au système POS";
    } elseif ($isRefund) {
        $subject = "Remboursement de Vente - $name" . $storeSuffix;
        $headerTitle = "↩️ Remboursement de Vente" . $storeSuffixHtml;
        $headerSubtitle = "Notification de remboursement dans le système POS";
    } else {
        $subject = "Fermeture de Service - $name" . $storeSuffix;
        $headerTitle = "🔔 Notification de Fermeture de Shift" . $storeSuffixHtml;
        $headerSubtitle = "Rapport automatique du système POS";
    }

    $mail->Subject = $subject;

    // Corps HTML avec design moderne
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
            .info-block { background: #f8f9fa; border-left: 4px solid #667eea; padding: 15px; margin: 15px 0; border-radius: 4px; }
            .info-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e9ecef; }
            .info-row:last-child { border-bottom: none; }
            .info-label { font-weight: 600; color: #495057; }
            .info-label:after { content: ' : '; }
            .info-value { color: #212529; text-align: right; }
            .highlight { background: #fff3cd; padding: 15px; border-left: 4px solid #ffc107; margin: 20px 0; border-radius: 4px; }
            .highlight.positive { background: #d4edda; border-left-color: #28a745; }
            .highlight.negative { background: #f8d7da; border-left-color: #dc3545; }
            .footer { background: #f8f9fa; padding: 20px; text-align: center; font-size: 12px; color: #6c757d; border-top: 1px solid #e9ecef; }
            .badge { display: inline-block; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 600; }
            .badge-success { background: #28a745; color: white; }
            .badge-warning { background: #ffc107; color: #212529; }
            .badge-danger { background: #dc3545; color: white; }
        </style>
    </head>
    <body>
        <div class='container'>
            <div class='header'>
                <h1>$headerTitle</h1>
                <p>$headerSubtitle</p>
            </div>
            <div class='content'>" . $message . "</div>
            <div class='footer'>
                <p>📧 Cet email a été envoyé automatiquement par le système POS Power Start</p>
                <p style='margin-top: 10px; color: #adb5bd;'>© " . date('Y') . " Power Start - Tous droits réservés</p>
            </div>
        </div>
    </body>
    </html>";

    // Version texte pour les clients email ne supportant pas HTML
    $mail->AltBody = "Nom: $name\nEmail: $email\nMessage:\n$message";

    logDebug("Attempting to send email", ['to' => $email, 'subject' => $subject]);
    $mail->send();
    
    logDebug("Email sent successfully", ['to' => $email]);
    echo json_encode(["ok" => true, "message" => "Email envoyé avec succès"]);
    
} catch (Exception $e) {
    $errorMsg = $e->getMessage();
    logDebug("Email sending failed", [
        'error' => $errorMsg,
        'code' => $e->getCode(),
        'to' => $email
    ]);
    
    // Réponse d'erreur détaillée pour debug mobile
    echo json_encode([
        "ok" => false, 
        "error" => $errorMsg,
        "debug_info" => [
            "smtp_host" => $mail->Host,
            "smtp_port" => $mail->Port,
            "user_agent" => $_SERVER['HTTP_USER_AGENT'] ?? 'Unknown'
        ]
    ]);
}
