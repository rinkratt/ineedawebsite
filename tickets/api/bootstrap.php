<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

$secureCookie = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
session_name('ticket_system_session');
session_set_cookie_params([
    'lifetime' => 0,
    'path' => '/',
    'secure' => $secureCookie,
    'httponly' => true,
    'samesite' => 'Lax',
]);
if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}

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

function table_has_column(PDO $pdo, string $table, string $column): bool
{
    $stmt = $pdo->prepare("SHOW COLUMNS FROM {$table} LIKE ?");
    $stmt->execute([$column]);
    return (bool) $stmt->fetch();
}

function users_table_has_column(PDO $pdo, string $column): bool
{
    return table_has_column($pdo, 'users', $column);
}

function ensure_auth_schema(PDO $pdo): void
{
    static $checked = false;
    if ($checked) {
        return;
    }

    if (!users_table_has_column($pdo, 'password_hash')) {
        $pdo->exec('ALTER TABLE users ADD COLUMN password_hash VARCHAR(255) NULL');
    }
    if (!users_table_has_column($pdo, 'password_reset_required')) {
        $pdo->exec('ALTER TABLE users ADD COLUMN password_reset_required TINYINT(1) NOT NULL DEFAULT 0');
    }
    if (!users_table_has_column($pdo, 'last_login_at')) {
        $pdo->exec('ALTER TABLE users ADD COLUMN last_login_at DATETIME NULL');
    }
    if (!users_table_has_column($pdo, 'active')) {
        $pdo->exec('ALTER TABLE users ADD COLUMN active TINYINT(1) NOT NULL DEFAULT 1');
    }
    if (!users_table_has_column($pdo, 'is_tech')) {
        $pdo->exec('ALTER TABLE users ADD COLUMN is_tech TINYINT(1) NOT NULL DEFAULT 1');
    }

    $checked = true;
}

function ensure_settings_schema(PDO $pdo): void
{
    static $checked = false;
    if ($checked) {
        return;
    }

    $pdo->exec("
        CREATE TABLE IF NOT EXISTS ticket_priorities (
            id INT AUTO_INCREMENT PRIMARY KEY,
            label VARCHAR(60) NOT NULL UNIQUE,
            sort_order INT NOT NULL DEFAULT 0,
            active TINYINT(1) NOT NULL DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");

    $pdo->exec("
        CREATE TABLE IF NOT EXISTS ticket_statuses (
            id INT AUTO_INCREMENT PRIMARY KEY,
            label VARCHAR(80) NOT NULL UNIQUE,
            sort_order INT NOT NULL DEFAULT 0,
            active TINYINT(1) NOT NULL DEFAULT 1,
            is_resolved TINYINT(1) NOT NULL DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");

    $pdo->exec("
        CREATE TABLE IF NOT EXISTS ticket_categories (
            id INT AUTO_INCREMENT PRIMARY KEY,
            sysaid_id INT NULL,
            category VARCHAR(100) NOT NULL DEFAULT '',
            sub_category VARCHAR(100) NOT NULL DEFAULT '',
            third_category VARCHAR(100) NOT NULL DEFAULT '',
            sort_order INT NOT NULL DEFAULT 0,
            active TINYINT(1) NOT NULL DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_ticket_category_sort (sort_order, id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");

    seed_ticket_priorities($pdo);
    seed_ticket_statuses($pdo);
    seed_ticket_categories($pdo);

    $checked = true;
}

function seed_ticket_priorities(PDO $pdo): void
{
    if ((int) $pdo->query('SELECT COUNT(*) FROM ticket_priorities')->fetchColumn() > 0) {
        return;
    }

    $labels = ['P1-Highest', 'P2-High', 'P3-Medium', 'P4-Normal', 'P5-Low'];
    $stmt = $pdo->prepare('INSERT INTO ticket_priorities (label, sort_order, active) VALUES (?, ?, 1)');
    foreach ($labels as $index => $label) {
        $stmt->execute([$label, $index + 1]);
    }
}

function seed_ticket_statuses(PDO $pdo): void
{
    if ((int) $pdo->query('SELECT COUNT(*) FROM ticket_statuses')->fetchColumn() > 0) {
        return;
    }

    $labels = ['New', 'Open', 'In Progress', 'Escalated', 'Waiting on Customer', 'User Responded', 'Pending Vendor', 'On Hold', 'Resolved', 'Closed', 'Cancelled'];
    $resolved = ['Resolved' => true, 'Closed' => true, 'Cancelled' => true];
    $stmt = $pdo->prepare('INSERT INTO ticket_statuses (label, sort_order, active, is_resolved) VALUES (?, ?, 1, ?)');
    foreach ($labels as $index => $label) {
        $stmt->execute([$label, $index + 1, isset($resolved[$label]) ? 1 : 0]);
    }
}

function seed_ticket_categories(PDO $pdo): void
{
    if ((int) $pdo->query('SELECT COUNT(*) FROM ticket_categories')->fetchColumn() > 0) {
        return;
    }

    $categories = categories_seed_from_file();
    if (!$categories) {
        $categories = [
            ['category' => 'Application', 'subCategory' => 'Ticket System', 'thirdCategory' => 'General'],
            ['category' => 'Hardware', 'subCategory' => 'Device', 'thirdCategory' => 'General'],
            ['category' => 'Account', 'subCategory' => 'Access', 'thirdCategory' => 'General'],
            ['category' => 'Access', 'subCategory' => 'Account Access', 'thirdCategory' => 'Cannot log on'],
        ];
    }

    $stmt = $pdo->prepare('
        INSERT INTO ticket_categories (sysaid_id, category, sub_category, third_category, sort_order, active)
        VALUES (?, ?, ?, ?, ?, 1)
    ');
    foreach ($categories as $index => $category) {
        $stmt->execute([
            isset($category['id']) ? (int) $category['id'] : null,
            trim((string) ($category['category'] ?? '')),
            trim((string) ($category['subCategory'] ?? $category['sub_category'] ?? '')),
            trim((string) ($category['thirdCategory'] ?? $category['third_category'] ?? '')),
            $index + 1,
        ]);
    }
}

function categories_seed_from_file(): array
{
    $path = dirname(__DIR__) . '/categories.js';
    if (!is_file($path)) {
        return [];
    }

    $contents = file_get_contents($path);
    if (!is_string($contents) || !preg_match('/window\.ticketCategories\s*=\s*(\[.*\]);\s*$/s', $contents, $matches)) {
        return [];
    }

    $data = json_decode($matches[1], true);
    return is_array($data) ? $data : [];
}

function public_user(array $user): array
{
    return [
        'id' => (int) $user['id'],
        'name' => (string) $user['name'],
        'email' => (string) $user['email'],
        'role' => (string) $user['role'],
        'active' => !isset($user['active']) || !empty($user['active']),
        'isTech' => !isset($user['is_tech']) || !empty($user['is_tech']),
        'passwordResetRequired' => !empty($user['password_reset_required']),
    ];
}

function current_user(PDO $pdo): ?array
{
    if (empty($_SESSION['ticket_user_id'])) {
        return null;
    }

    $stmt = $pdo->prepare('SELECT id, name, email, role, active, is_tech, password_reset_required FROM users WHERE id = ? AND active = 1 LIMIT 1');
    $stmt->execute([(int) $_SESSION['ticket_user_id']]);
    $user = $stmt->fetch();
    return $user ?: null;
}

function require_login(PDO $pdo): array
{
    $user = current_user($pdo);
    if (!$user) {
        json_response(['error' => 'Authentication required'], 401);
    }
    return $user;
}

function destroy_session_cookie(): void
{
    if (session_status() !== PHP_SESSION_ACTIVE) {
        return;
    }

    $_SESSION = [];
    $params = session_get_cookie_params();
    setcookie(session_name(), '', [
        'expires' => time() - 42000,
        'path' => $params['path'],
        'domain' => $params['domain'] ?? '',
        'secure' => (bool) $params['secure'],
        'httponly' => (bool) $params['httponly'],
        'samesite' => $params['samesite'] ?? 'Lax',
    ]);
    session_destroy();
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

function settings_payload(PDO $pdo): array
{
    return [
        'priorities' => array_map(static function (array $priority): array {
            return [
                'id' => (int) $priority['id'],
                'label' => (string) $priority['label'],
                'sortOrder' => (int) $priority['sort_order'],
                'active' => !empty($priority['active']),
            ];
        }, $pdo->query('SELECT id, label, sort_order, active FROM ticket_priorities ORDER BY sort_order, id')->fetchAll()),
        'statuses' => array_map(static function (array $status): array {
            return [
                'id' => (int) $status['id'],
                'label' => (string) $status['label'],
                'sortOrder' => (int) $status['sort_order'],
                'active' => !empty($status['active']),
                'isResolved' => !empty($status['is_resolved']),
            ];
        }, $pdo->query('SELECT id, label, sort_order, active, is_resolved FROM ticket_statuses ORDER BY sort_order, id')->fetchAll()),
        'categories' => array_map(static function (array $category): array {
            return [
                'id' => (int) $category['id'],
                'sysAidId' => isset($category['sysaid_id']) ? (int) $category['sysaid_id'] : null,
                'category' => (string) $category['category'],
                'subCategory' => (string) $category['sub_category'],
                'thirdCategory' => (string) $category['third_category'],
                'sortOrder' => (int) $category['sort_order'],
                'active' => !empty($category['active']),
            ];
        }, $pdo->query('SELECT id, sysaid_id, category, sub_category, third_category, sort_order, active FROM ticket_categories ORDER BY sort_order, id')->fetchAll()),
    ];
}

function users_payload(PDO $pdo): array
{
    $users = $pdo->query('SELECT id, name, email, role, active, is_tech, password_reset_required FROM users ORDER BY active DESC, name')->fetchAll();
    return array_map('public_user', $users);
}

function is_admin_user(array $user): bool
{
    return stripos((string) ($user['role'] ?? ''), 'admin') !== false;
}

function require_admin(array $user): void
{
    if (!is_admin_user($user)) {
        json_response(['error' => 'Admin access required'], 403);
    }
}

function tech_names(PDO $pdo): array
{
    $rows = $pdo->query('SELECT name FROM users WHERE active = 1 AND is_tech = 1 ORDER BY name')->fetchAll();
    return array_map(static fn (array $row): string => (string) $row['name'], $rows);
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
