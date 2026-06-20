<?php
declare(strict_types=1);
require __DIR__ . '/config.php';

require_imap_extension();

$data = json_input();
$email = strtolower(trim((string) ($data['email'] ?? '')));
$password = (string) ($data['password'] ?? '');
$requestedHost = trim((string) ($data['host'] ?? ''));

if (!filter_var($email, FILTER_VALIDATE_EMAIL) || $password === '') {
    json_response(['error' => 'Enter a valid email address and password.'], 422);
}

$lastError = 'Could not connect to the mailbox.';
foreach (candidate_mail_hosts($email, $requestedHost ?: null) as $host) {
    foreach (candidate_imap_options() as $option) {
        $mailbox = imap_mailbox_string($host, 'INBOX', false, $option['port'], $option['flags']);
        $imap = @imap_open($mailbox, $email, $password, OP_READONLY, 1);

        if ($imap) {
            imap_close($imap);
            session_regenerate_id(true);
            $_SESSION['mail_user'] = $email;
            $_SESSION['mail_password'] = $password;
            $_SESSION['mail_host'] = $host;
            $_SESSION['mail_port'] = $option['port'];
            $_SESSION['mail_flags'] = $option['flags'];
            json_response(['ok' => true, 'email' => $email, 'host' => $host]);
        }

        $lastError = clean_imap_error();
    }
}

json_response([
    'error' => 'Sign in failed.',
    'detail' => $lastError,
], 401);
