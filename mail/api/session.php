<?php
declare(strict_types=1);
require __DIR__ . '/config.php';

if (empty($_SESSION['mail_user'])) {
    json_response(['signedIn' => false]);
}

json_response([
    'signedIn' => true,
    'email' => $_SESSION['mail_user'],
    'host' => $_SESSION['mail_host'] ?? '',
]);

