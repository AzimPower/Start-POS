<?php
// Autoloader pour PHPMailer
spl_autoload_register(function ($class_name) {
    // Vérifier si c'est une classe PHPMailer
    if (strpos($class_name, "PHPMailer\PHPMailer\") === 0) {
        // Extraire le nom de la classe
        $class_file = str_replace("PHPMailer\PHPMailer\", "", $class_name);
        $file_path = __DIR__ . "/phpmailer/phpmailer/src/" . $class_file . ".php";
        
        if (file_exists($file_path)) {
            require_once $file_path;
            return true;
        }
    }
    return false;
});

// Vérification rapide
if (!class_exists("PHPMailer\PHPMailer\PHPMailer")) {
    // Fallback : inclure directement les fichiers principaux
    $phpmailer_src = __DIR__ . "/phpmailer/phpmailer/src/";
    if (is_dir($phpmailer_src)) {
        require_once $phpmailer_src . "Exception.php";
        require_once $phpmailer_src . "PHPMailer.php";
        require_once $phpmailer_src . "SMTP.php";
    }
}
