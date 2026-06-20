<?php
declare(strict_types=1);
require __DIR__ . '/config.php';

$auth = require_login();
$data = json_input();
$to = trim((string) ($data['to'] ?? ''));
$subject = trim((string) ($data['subject'] ?? ''));
$body = trim((string) ($data['body'] ?? ''));

if (!filter_var($to, FILTER_VALIDATE_EMAIL)) {
    json_response(['error' => 'Enter a valid recipient email address.'], 422);
}

if ($subject === '') {
    $subject = '(No subject)';
}

if ($body === '') {
    json_response(['error' => 'Write a message before sending.'], 422);
}

$sent = smtp_send_message($auth['host'], $auth['email'], $auth['password'], $to, $subject, $body);
if (!$sent['ok']) {
    json_response(['error' => 'Could not send message.', 'detail' => $sent['error']], 502);
}

$savedToSent = append_mail_message('sent', $to, $subject, $body, '\\Seen');

json_response(['ok' => true, 'savedToSent' => $savedToSent]);

function smtp_send_message(string $host, string $username, string $password, string $to, string $subject, string $body): array
{
    foreach ([465, 587] as $port) {
        $result = smtp_try_send($host, $port, $username, $password, $to, $subject, $body);
        if ($result['ok']) {
            return $result;
        }
    }

    return $result ?? ['ok' => false, 'error' => 'SMTP connection failed.'];
}

function smtp_try_send(string $host, int $port, string $username, string $password, string $to, string $subject, string $body): array
{
    $target = $port === 465 ? "ssl://{$host}:{$port}" : "tcp://{$host}:{$port}";
    $socket = @stream_socket_client($target, $errno, $errstr, 15);
    if (!$socket) {
        return ['ok' => false, 'error' => $errstr ?: "Could not connect to {$host}:{$port}."];
    }

    stream_set_timeout($socket, 15);

    try {
        smtp_expect($socket, [220]);
        smtp_command($socket, "EHLO " . ($_SERVER['HTTP_HOST'] ?? 'localhost'), [250]);

        if ($port === 587) {
            smtp_command($socket, 'STARTTLS', [220]);
            if (!stream_socket_enable_crypto($socket, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
                throw new RuntimeException('Could not start TLS encryption.');
            }
            smtp_command($socket, "EHLO " . ($_SERVER['HTTP_HOST'] ?? 'localhost'), [250]);
        }

        smtp_command($socket, 'AUTH LOGIN', [334]);
        smtp_command($socket, base64_encode($username), [334]);
        smtp_command($socket, base64_encode($password), [235]);
        smtp_command($socket, "MAIL FROM:<{$username}>", [250]);
        smtp_command($socket, "RCPT TO:<{$to}>", [250, 251]);
        smtp_command($socket, 'DATA', [354]);

        $headers = [
            'From: ' . $username,
            'Reply-To: ' . $username,
            'Sender: ' . $username,
            'To: ' . $to,
            'Subject: ' . encode_header($subject),
            'Message-ID: <' . bin2hex(random_bytes(16)) . '@' . sender_domain($username) . '>',
            'MIME-Version: 1.0',
            'Content-Type: text/plain; charset=UTF-8',
            'Content-Transfer-Encoding: 8bit',
            'Date: ' . date(DATE_RFC2822),
            'X-Mailer: I Need Mail',
        ];

        $payload = implode("\r\n", $headers) . "\r\n\r\n" . dot_stuff($body) . "\r\n.";
        $deliveryResponse = smtp_command($socket, $payload, [250]);
        smtp_command($socket, 'QUIT', [221]);
        fclose($socket);
        return ['ok' => true, 'response' => trim($deliveryResponse)];
    } catch (Throwable $error) {
        fclose($socket);
        return ['ok' => false, 'error' => $error->getMessage()];
    }
}

function smtp_command($socket, string $command, array $expectedCodes): string
{
    fwrite($socket, $command . "\r\n");
    return smtp_expect($socket, $expectedCodes);
}

function smtp_expect($socket, array $expectedCodes): string
{
    $response = '';
    while (($line = fgets($socket, 515)) !== false) {
        $response .= $line;
        if (isset($line[3]) && $line[3] === ' ') {
            break;
        }
    }

    $code = (int) substr($response, 0, 3);
    if (!in_array($code, $expectedCodes, true)) {
        throw new RuntimeException(trim($response) ?: 'Unexpected SMTP response.');
    }

    return $response;
}

function encode_header(string $value): string
{
    if (function_exists('mb_encode_mimeheader')) {
        return mb_encode_mimeheader($value, 'UTF-8');
    }

    return '=?UTF-8?B?' . base64_encode($value) . '?=';
}

function dot_stuff(string $body): string
{
    $body = str_replace(["\r\n", "\r"], "\n", $body);
    $body = preg_replace('/^\./m', '..', $body);
    return str_replace("\n", "\r\n", (string) $body);
}

function sender_domain(string $email): string
{
    $parts = explode('@', $email);
    return preg_replace('/[^a-z0-9.-]/i', '', strtolower((string) end($parts))) ?: 'localhost';
}
