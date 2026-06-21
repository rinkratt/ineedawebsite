<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

function json_response(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload, JSON_THROW_ON_ERROR);
    exit;
}

function read_json_body(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') {
        return [];
    }

    $data = json_decode($raw, true);
    if (!is_array($data)) {
        json_response(['error' => 'Invalid JSON body'], 400);
    }
    return $data;
}

function tickets_config_path(): string
{
    $paths = [
        dirname(__DIR__, 2) . '/private/tickets_config.php',
        dirname(__DIR__, 3) . '/private/tickets_config.php',
        dirname(__DIR__) . '/private/tickets_config.php',
    ];

    foreach ($paths as $path) {
        if (is_file($path)) {
            return $path;
        }
    }

    return $paths[0];
}

function db(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $configPath = tickets_config_path();
    if (!is_file($configPath)) {
        json_response(['error' => 'Database config is missing'], 500);
    }

    $config = require $configPath;
    $dsn = sprintf(
        'mysql:host=%s;dbname=%s;charset=utf8mb4',
        $config['host'],
        $config['database']
    );

    $pdo = new PDO($dsn, $config['username'], $config['password'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);

    return $pdo;
}

function db_ticket_to_api(array $ticket): array
{
    $ticket['id'] = (int) $ticket['id'];
    $ticket['requestTime'] = $ticket['request_time'];
    $ticket['requestUser'] = $ticket['request_user'];
    $ticket['subCategory'] = $ticket['sub_category'];
    $ticket['thirdCategory'] = $ticket['third_category'];
    $ticket['modifyUser'] = $ticket['modify_user'];
    unset($ticket['request_time'], $ticket['request_user'], $ticket['sub_category'], $ticket['third_category'], $ticket['modify_user']);
    $ticket['journey'] = [];
    $ticket['attachments'] = [];
    $ticket['related'] = [];
    return $ticket;
}

function fetch_ticket(PDO $pdo, int $id): array
{
    $stmt = $pdo->prepare('SELECT * FROM tickets WHERE id = ?');
    $stmt->execute([$id]);
    $ticket = $stmt->fetch();
    if (!$ticket) {
        json_response(['error' => 'Ticket not found'], 404);
    }

    $apiTicket = db_ticket_to_api($ticket);
    $activity = $pdo->prepare('SELECT actor, event, created_at AS time FROM ticket_activity WHERE ticket_id = ? ORDER BY id DESC');
    $activity->execute([$id]);
    $apiTicket['journey'] = $activity->fetchAll();
    return $apiTicket;
}

function openai_api_key(): string
{
    $key = getenv('OPENAI_API_KEY');
    if (is_string($key) && trim($key) !== '') {
        return trim($key);
    }

    $configPath = tickets_config_path();
    if (is_file($configPath)) {
        $config = require $configPath;
        if (is_array($config) && isset($config['openai_api_key']) && trim((string) $config['openai_api_key']) !== '') {
            return trim((string) $config['openai_api_key']);
        }
    }

    return '';
}

function call_openai(array $payload): array
{
    $apiKey = openai_api_key();
    if ($apiKey === '') {
        json_response(['error' => 'OpenAI API key is not configured'], 500);
    }

    $json = json_encode($payload, JSON_THROW_ON_ERROR);
    $headers = [
        'Authorization: Bearer ' . $apiKey,
        'Content-Type: application/json',
    ];

    if (function_exists('curl_init')) {
        $ch = curl_init('https://api.openai.com/v1/responses');
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $json,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 45,
        ]);
        $raw = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);
        curl_close($ch);

        if ($raw === false) {
            json_response(['error' => 'OpenAI request failed: ' . $curlError], 502);
        }
    } else {
        $context = stream_context_create([
            'http' => [
                'method' => 'POST',
                'header' => implode("\r\n", $headers),
                'content' => $json,
                'timeout' => 45,
                'ignore_errors' => true,
            ],
        ]);
        $raw = file_get_contents('https://api.openai.com/v1/responses', false, $context);
        $status = 0;
        if (isset($http_response_header[0]) && preg_match('/\s(\d{3})\s/', $http_response_header[0], $matches)) {
            $status = (int) $matches[1];
        }
        if ($raw === false) {
            json_response(['error' => 'OpenAI request failed'], 502);
        }
    }

    $data = json_decode($raw, true);
    if (!is_array($data)) {
        json_response(['error' => 'OpenAI returned an invalid response'], 502);
    }

    if ($status < 200 || $status >= 300) {
        $message = $data['error']['message'] ?? 'OpenAI request was rejected';
        json_response(['error' => $message], 502);
    }

    return $data;
}

function response_output_text(array $response): string
{
    if (isset($response['output_text']) && is_string($response['output_text'])) {
        return $response['output_text'];
    }

    $parts = [];
    foreach (($response['output'] ?? []) as $item) {
        foreach (($item['content'] ?? []) as $content) {
            if (isset($content['text']) && is_string($content['text'])) {
                $parts[] = $content['text'];
            }
        }
    }

    return trim(implode("\n", $parts));
}

function response_url_citations(array $response): array
{
    $citations = [];
    $seen = [];

    foreach (($response['output'] ?? []) as $item) {
        foreach (($item['content'] ?? []) as $content) {
            foreach (($content['annotations'] ?? []) as $annotation) {
                if (($annotation['type'] ?? '') !== 'url_citation') {
                    continue;
                }

                $url = sanitize_citation_url((string) ($annotation['url'] ?? ''));
                if ($url === '' || isset($seen[$url])) {
                    continue;
                }

                $seen[$url] = true;
                $citations[] = [
                    'url' => $url,
                    'title' => trim((string) ($annotation['title'] ?? $url)),
                ];
            }
        }
    }

    return array_slice($citations, 0, 8);
}

function sanitize_citation_url(string $url): string
{
    $url = trim($url);
    foreach (['"https://', '"http://', '%22https%3A', '%22http%3A'] as $marker) {
        $position = stripos($url, $marker);
        if ($position !== false) {
            $url = substr($url, 0, $position);
        }
    }

    $parts = parse_url($url);
    $scheme = strtolower((string) ($parts['scheme'] ?? ''));
    if (!in_array($scheme, ['http', 'https'], true)) {
        return '';
    }

    return $url;
}
