<?php
declare(strict_types=1);

ini_set('display_errors', '0');
error_reporting(E_ALL);

$isHttps = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off');
session_set_cookie_params([
    'lifetime' => 0,
    'path' => '/',
    'secure' => $isHttps,
    'httponly' => true,
    'samesite' => 'Lax',
]);
session_start();

function json_input(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') {
        return [];
    }

    $data = json_decode($raw, true);
    if (!is_array($data)) {
        json_response(['error' => 'Invalid JSON request.'], 400);
    }

    return $data;
}

function json_response(array $payload, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    $flags = JSON_UNESCAPED_SLASHES;
    if (defined('JSON_INVALID_UTF8_SUBSTITUTE')) {
        $flags |= JSON_INVALID_UTF8_SUBSTITUTE;
    }

    $json = json_encode($payload, $flags);
    echo $json === false ? '{"error":"Could not encode server response."}' : $json;
    exit;
}

function require_login(): array
{
    if (empty($_SESSION['mail_user']) || empty($_SESSION['mail_password']) || empty($_SESSION['mail_host'])) {
        json_response(['error' => 'Not signed in.'], 401);
    }

    return [
        'email' => $_SESSION['mail_user'],
        'password' => $_SESSION['mail_password'],
        'host' => $_SESSION['mail_host'],
        'port' => $_SESSION['mail_port'] ?? 993,
        'flags' => $_SESSION['mail_flags'] ?? '/imap/ssl',
    ];
}

function require_imap_extension(): void
{
    if (!extension_loaded('imap')) {
        json_response([
            'error' => 'PHP IMAP extension is not enabled on this server.',
            'detail' => 'Enable the PHP IMAP extension in Plesk for this domain, then try again.',
        ], 500);
    }

    imap_timeout(IMAP_OPENTIMEOUT, 5);
    imap_timeout(IMAP_READTIMEOUT, 5);
    imap_timeout(IMAP_WRITETIMEOUT, 5);
    imap_timeout(IMAP_CLOSETIMEOUT, 5);
}

function domain_from_email(string $email): string
{
    $parts = explode('@', $email);
    return strtolower(trim((string) end($parts)));
}

function candidate_mail_hosts(string $email, ?string $requestedHost = null): array
{
    $domain = domain_from_email($email);
    $hosts = [];

    if ($requestedHost) {
        $hosts[] = strtolower(trim($requestedHost));
    }

    $hosts[] = 'mail.' . $domain;

    return array_values(array_unique(array_filter($hosts)));
}

function candidate_imap_options(): array
{
    return [
        ['port' => 993, 'flags' => '/imap/ssl/novalidate-cert'],
    ];
}

function imap_mailbox_string(string $host, string $folder = 'INBOX', bool $allowSelfSigned = false, ?int $port = null, ?string $flags = null): string
{
    $port = $port ?? (int) ($_SESSION['mail_port'] ?? 993);
    $flags = $flags ?? (string) ($_SESSION['mail_flags'] ?? '/imap/ssl');
    if ($allowSelfSigned) {
        $flags .= '/novalidate-cert';
    }

    return sprintf('{%s:%d%s}%s', $host, $port, $flags, $folder);
}

function imap_server_string(string $host, bool $allowSelfSigned = false): string
{
    $port = (int) ($_SESSION['mail_port'] ?? 993);
    $flags = (string) ($_SESSION['mail_flags'] ?? '/imap/ssl');
    if ($allowSelfSigned) {
        $flags .= '/novalidate-cert';
    }

    return sprintf('{%s:%d%s}', $host, $port, $flags);
}

function open_imap(string $folder = 'INBOX', bool $readOnly = true)
{
    require_imap_extension();
    $auth = require_login();
    $mailbox = imap_mailbox_string($auth['host'], $folder);
    $flags = $readOnly ? OP_READONLY : 0;
    $imap = @imap_open($mailbox, $auth['email'], $auth['password'], $flags, 1);

    if (!$imap) {
        $mailbox = imap_mailbox_string($auth['host'], $folder, true);
        $imap = @imap_open($mailbox, $auth['email'], $auth['password'], $flags, 1);
    }

    if (!$imap) {
        json_response(['error' => 'Could not open mailbox.', 'detail' => clean_imap_error()], 502);
    }

    return $imap;
}

function ensure_folder_exists(string $path): void
{
    require_imap_extension();
    $auth = require_login();
    $imap = open_imap('INBOX', false);
    $mailbox = imap_mailbox_string($auth['host'], imap_utf7_encode($path));
    @imap_createmailbox($imap, $mailbox);
    imap_close($imap);
}

function clean_imap_error(): string
{
    $errors = imap_errors();
    if (!$errors) {
        return 'The mail server did not return a detailed error.';
    }

    return trim(implode(' ', array_map('strip_tags', $errors)));
}

function decode_mime_text(?string $value): string
{
    if (!$value) {
        return '';
    }

    $decoded = @imap_mime_header_decode($value);
    if (!$decoded) {
        return imap_utf8($value);
    }

    $text = '';
    foreach ($decoded as $part) {
        $text .= text_to_utf8($part->text ?? '', $part->charset ?? null);
    }

    return trim(imap_utf8($text));
}

function text_to_utf8(string $text, ?string $charset = null): string
{
    if ($text === '') {
        return '';
    }

    $charset = normalize_charset($charset);
    if ($charset !== '' && $charset !== 'UTF-8') {
        $converted = convert_text_encoding($text, $charset);
        if ($converted !== null) {
            return $converted;
        }
    }

    if (preg_match('//u', $text)) {
        return $text;
    }

    foreach (['Windows-1252', 'ISO-8859-1'] as $fallbackCharset) {
        $converted = convert_text_encoding($text, $fallbackCharset);
        if ($converted !== null && preg_match('//u', $converted)) {
            return $converted;
        }
    }

    return preg_replace('/[^\x09\x0A\x0D\x20-\x7E]/', '?', $text) ?? '';
}

function normalize_charset(?string $charset): string
{
    $charset = trim((string) $charset, " \t\n\r\0\x0B\"");
    if ($charset === '' || strcasecmp($charset, 'default') === 0) {
        return '';
    }

    $map = [
        'cp1252' => 'Windows-1252',
        'windows-1252' => 'Windows-1252',
        'win-1252' => 'Windows-1252',
        'iso-8859-1' => 'ISO-8859-1',
        'latin1' => 'ISO-8859-1',
        'us-ascii' => 'ASCII',
        'ascii' => 'ASCII',
        'utf8' => 'UTF-8',
        'utf-8' => 'UTF-8',
    ];

    $key = strtolower($charset);
    return $map[$key] ?? $charset;
}

function convert_text_encoding(string $text, string $fromCharset): ?string
{
    if ($fromCharset === 'ASCII') {
        return preg_replace('/[^\x00-\x7F]/', '?', $text) ?? '';
    }

    if (function_exists('mb_convert_encoding')) {
        $converted = @mb_convert_encoding($text, 'UTF-8', $fromCharset);
        if (is_string($converted)) {
            return $converted;
        }
    }

    if (function_exists('iconv')) {
        $converted = @iconv($fromCharset, 'UTF-8//IGNORE', $text);
        if (is_string($converted)) {
            return $converted;
        }
    }

    return null;
}

function part_charset(object $part): ?string
{
    foreach (['parameters', 'dparameters'] as $property) {
        if (empty($part->{$property}) || !is_array($part->{$property})) {
            continue;
        }

        foreach ($part->{$property} as $parameter) {
            if (strcasecmp((string) ($parameter->attribute ?? ''), 'charset') === 0) {
                return (string) ($parameter->value ?? '');
            }
        }
    }

    return null;
}

function mailbox_display_name(string $rawName): string
{
    $name = preg_replace('/^\{[^}]+\}/', '', $rawName);
    $name = str_replace('&-', '&', (string) $name);
    return trim(imap_utf7_decode($name));
}

function folder_path_for_key(string $key, array $folders): string
{
    $map = [
        'inbox' => ['INBOX'],
        'sent' => ['Sent', 'Sent Messages', 'Sent Items', 'INBOX.Sent', 'INBOX.Sent Messages', 'INBOX.Sent Items'],
        'drafts' => ['Drafts', 'INBOX.Drafts'],
        'archive' => ['Archive', 'Archives', 'INBOX.Archive'],
        'spam' => ['Spam', 'Junk', 'Junk Email', 'INBOX.Spam', 'INBOX.Junk', 'INBOX.Junk Email'],
        'trash' => ['Trash', 'Deleted Messages', 'INBOX.Trash'],
    ];

    $wanted = $map[$key] ?? ['INBOX'];
    foreach ($wanted as $candidate) {
        foreach ($folders as $folder) {
            if (strcasecmp($folder['display'], $candidate) === 0 || strcasecmp($folder['path'], $candidate) === 0) {
                return $folder['path'];
            }
        }
    }

    return $key === 'inbox' ? 'INBOX' : ($wanted[0] ?? 'INBOX');
}

function list_mail_folders(): array
{
    require_imap_extension();
    $auth = require_login();
    $imap = open_imap('INBOX');
    $mailboxes = @imap_getmailboxes($imap, imap_server_string($auth['host']), '*') ?: [];
    $folders = [];

    foreach ($mailboxes as $mailbox) {
        $display = mailbox_display_name($mailbox->name);
        $folders[] = [
            'path' => $display,
            'display' => $display === 'INBOX' ? 'Inbox' : preg_replace('/^INBOX[.\/]/i', '', $display),
        ];
    }

    imap_close($imap);

    if (!$folders) {
        $folders[] = ['path' => 'INBOX', 'display' => 'Inbox'];
    }

    return $folders;
}

function plain_preview(string $text, int $limit = 150): string
{
    $text = preg_replace('/\s+/', ' ', trim($text));
    if (function_exists('mb_strlen') && mb_strlen($text) > $limit) {
        return mb_substr($text, 0, $limit - 1) . '...';
    }

    return strlen($text) > $limit ? substr($text, 0, $limit - 1) . '...' : $text;
}

function format_mail_time(?string $date): string
{
    if (!$date) {
        return '';
    }

    try {
        $messageTime = new DateTimeImmutable($date);
        $localTime = $messageTime->setTimezone(new DateTimeZone('America/Chicago'));
        $now = new DateTimeImmutable('now', new DateTimeZone('America/Chicago'));
    } catch (Throwable $error) {
        return $date;
    }

    if ($now->format('Y-m-d') === $localTime->format('Y-m-d')) {
        return $localTime->format('g:i A');
    }

    if ($now->format('Y') === $localTime->format('Y')) {
        return $localTime->format('M j');
    }

    return $localTime->format('M j, Y');
}

function append_mail_message(string $folderKey, string $to, string $subject, string $body, string $flags = ''): bool
{
    $auth = require_login();
    $folders = list_mail_folders();
    $folderPath = folder_path_for_key($folderKey, $folders);
    ensure_folder_exists($folderPath);

    $headers = [
        'From: ' . $auth['email'],
        'To: ' . $to,
        'Subject: ' . encode_mail_header($subject),
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: 8bit',
        'Date: ' . date(DATE_RFC2822),
    ];
    $message = implode("\r\n", $headers) . "\r\n\r\n" . str_replace(["\r\n", "\r"], "\n", $body);
    $mailbox = imap_mailbox_string($auth['host'], imap_utf7_encode($folderPath));

    $imap = open_imap('INBOX', false);
    $saved = @imap_append($imap, $mailbox, $message, $flags);
    imap_close($imap);

    return (bool) $saved;
}

function encode_mail_header(string $value): string
{
    if (function_exists('mb_encode_mimeheader')) {
        return mb_encode_mimeheader($value, 'UTF-8');
    }

    return '=?UTF-8?B?' . base64_encode($value) . '?=';
}

function message_sender($overview): array
{
    $from = $overview->from ?? '';
    $parsed = @imap_rfc822_parse_adrlist($from, '');
    if (!$parsed || empty($parsed[0])) {
        return ['name' => decode_mime_text($from), 'email' => ''];
    }

    $mailbox = $parsed[0]->mailbox ?? '';
    $host = $parsed[0]->host ?? '';
    $email = ($mailbox && $host) ? $mailbox . '@' . $host : '';
    $name = decode_mime_text($parsed[0]->personal ?? '') ?: $email ?: decode_mime_text($from);

    return ['name' => $name, 'email' => $email];
}

function message_recipients($overview): array
{
    $to = $overview->to ?? '';
    $parsed = @imap_rfc822_parse_adrlist($to, '');
    if (!$parsed || empty($parsed[0])) {
        return ['name' => decode_mime_text($to), 'email' => ''];
    }

    $mailbox = $parsed[0]->mailbox ?? '';
    $host = $parsed[0]->host ?? '';
    $email = ($mailbox && $host) ? $mailbox . '@' . $host : '';
    $name = decode_mime_text($parsed[0]->personal ?? '') ?: $email ?: decode_mime_text($to);

    return ['name' => $name, 'email' => $email];
}
