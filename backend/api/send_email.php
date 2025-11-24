<?php

// Headers CORS
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception;

require 'vendor/autoload.php'; 

function send_email($recipient_email, $subject, $message_body) {
    $smtp_server = 'smtp.gmail.com';
    $smtp_port = 587;
    $sender_email = 'powerstartbf@gmail.com';
    $smtp_password = 'ffpafdcbtqeihljp';

    $mail = new PHPMailer(true);

    try {
        $mail->isSMTP();
        $mail->Host = $smtp_server;
        $mail->SMTPAuth = true;
        $mail->Username = $sender_email;
        $mail->Password = $smtp_password;
        $mail->SMTPSecure = 'tls';
        $mail->Port = $smtp_port;

        // Encodage UTF-8
        $mail->CharSet = 'UTF-8'; 

        $mail->setFrom($sender_email, 'Omega Helper');
        $mail->addAddress($recipient_email);

        $mail->isHTML(true);
        $mail->Subject = $subject;
        $mail->Body = $message_body;

        $mail->send();
        echo json_encode(['status' => 'success', 'message' => 'Email envoyé avec succès']);
    } catch (Exception $e) {
        echo json_encode(['status' => 'error', 'message' => $mail->ErrorInfo]);
    }
}

// Recevoir les données JSON via POST
$data = json_decode(file_get_contents("php://input"), true);

if (isset($data['email']) && isset($data['subject']) && isset($data['message'])) {
    send_email($data['email'], $data['subject'], $data['message']);
} else {
    echo json_encode(['status' => 'error', 'message' => 'Paramètres manquants']);
}

?>
