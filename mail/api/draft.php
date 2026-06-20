<?php
declare(strict_types=1);
require __DIR__ . '/config.php';

$auth = require_login();
$data = json_input();
$to = trim((string) ($data['to'] ?? ''));
$subject = trim((string) ($data['subject'] ?? ''));
$body = trim((string) ($data['body'] ?? ''));

if ($to !== '' && !filter_var($to, FILTER_VALIDATE_EMAIL)) {
    json_response(['error' => 'Enter a valid recipient email address.'], 422);
}

if ($subject === '') {
    $subject = '(No subject)';
}

$folders = list_mail_folders();
$draftPath = folder_path_for_key('drafts', $folders);
ensure_folder_exists($draftPath);

$headers = [
    'From: ' . $auth['email'],
    'To: ' . $to,
    'Subject: ' . draft_header($subject),
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    'Date: ' . date(DATE_RFC2822),
    'X-Unsent: 1',
];
$message = implode("\r\n", $headers) . "\r\n\r\n" . str_replace(["\r\n", "\r"], "\n", $body);
$mailbox = imap_mailbox_string($auth['host'], imap_utf7_encode($draftPath));

$imap = open_imap('INBOX', false);
$saved = @imap_append($imap, $mailbox, $message, '\\Draft');
imap_close($imap);

if (!$saved) {
    json_response(['error' => 'Could not save draft.', 'detail' => clean_imap_error()], 502);
}

json_response(['ok' => true]);

function draft_header(string $value): string
{
    if (function_exists('mb_encode_mimeheader')) {
        return mb_encode_mimeheader($value, 'UTF-8');
    }

    return '=?UTF-8?B?' . base64_encode($value) . '?=';
}

