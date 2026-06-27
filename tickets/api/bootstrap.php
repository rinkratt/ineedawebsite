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

function tickets_config(): array
{
    $configPath = tickets_config_path();
    if (!is_file($configPath)) {
        return [];
    }

    $config = require $configPath;
    return is_array($config) ? $config : [];
}

function table_has_column(PDO $pdo, string $table, string $column): bool
{
    $stmt = $pdo->prepare("SHOW COLUMNS FROM {$table} LIKE ?");
    $stmt->execute([$column]);
    return (bool) $stmt->fetch();
}

function table_exists(PDO $pdo, string $table): bool
{
    $stmt = $pdo->prepare('SHOW TABLES LIKE ?');
    $stmt->execute([$table]);
    return (bool) $stmt->fetch();
}

function users_table_has_column(PDO $pdo, string $column): bool
{
    return table_has_column($pdo, 'users', $column);
}

function ticket_categories_table_has_column(PDO $pdo, string $column): bool
{
    return table_has_column($pdo, 'ticket_categories', $column);
}

function companies_table_has_column(PDO $pdo, string $column): bool
{
    return table_has_column($pdo, 'companies', $column);
}

function tickets_table_has_column(PDO $pdo, string $column): bool
{
    return table_exists($pdo, 'tickets') && table_has_column($pdo, 'tickets', $column);
}

function table_has_index(PDO $pdo, string $table, string $index): bool
{
    if (!table_exists($pdo, $table)) {
        return false;
    }

    $stmt = $pdo->prepare("SHOW INDEX FROM {$table} WHERE Key_name = ?");
    $stmt->execute([$index]);
    return (bool) $stmt->fetch();
}

function normalize_workspace_label(mixed $value, string $fallback = 'workspace'): string
{
    $text = strtolower(trim((string) $value));
    $text = preg_replace('/[^a-z0-9]+/', '-', $text);
    if (!is_string($text)) {
        $text = '';
    }
    $text = trim(preg_replace('/-+/', '-', $text) ?? '', '-');

    if (function_exists('mb_substr')) {
        $text = mb_substr($text, 0, 63);
    } else {
        $text = substr($text, 0, 63);
    }
    $text = trim($text, '-');

    return $text !== '' ? $text : $fallback;
}

function ensure_password_reset_schema(PDO $pdo): void
{
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS password_resets (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            email VARCHAR(190) NOT NULL,
            token_hash CHAR(64) NOT NULL,
            expires_at DATETIME NOT NULL,
            used_at DATETIME NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_password_reset_token (token_hash),
            INDEX idx_password_reset_user (user_id, expires_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");
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
    if (!users_table_has_column($pdo, 'company_id')) {
        $pdo->exec('ALTER TABLE users ADD COLUMN company_id INT NULL AFTER role');
    }
    if (!users_table_has_column($pdo, 'portal_access')) {
        $pdo->exec('ALTER TABLE users ADD COLUMN portal_access TINYINT(1) NOT NULL DEFAULT 0 AFTER is_tech');
    }
    if (!users_table_has_column($pdo, 'can_monitor_companies')) {
        $pdo->exec('ALTER TABLE users ADD COLUMN can_monitor_companies TINYINT(1) NOT NULL DEFAULT 0 AFTER portal_access');
    }
    ensure_password_reset_schema($pdo);

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
            description TEXT NULL,
            visible_ssp TINYINT(1) NOT NULL DEFAULT 1,
            visible_admin TINYINT(1) NOT NULL DEFAULT 1,
            enable_incident TINYINT(1) NOT NULL DEFAULT 1,
            enable_request TINYINT(1) NOT NULL DEFAULT 1,
            enable_change TINYINT(1) NOT NULL DEFAULT 1,
            enable_problem TINYINT(1) NOT NULL DEFAULT 1,
            sort_order INT NOT NULL DEFAULT 0,
            active TINYINT(1) NOT NULL DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_ticket_category_sort (sort_order, id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");

    $pdo->exec("
        CREATE TABLE IF NOT EXISTS companies (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(160) NOT NULL,
            address VARCHAR(190) NOT NULL DEFAULT '',
            address2 VARCHAR(190) NOT NULL DEFAULT '',
            city VARCHAR(100) NOT NULL DEFAULT '',
            state VARCHAR(80) NOT NULL DEFAULT '',
            zip VARCHAR(30) NOT NULL DEFAULT '',
            phone VARCHAR(60) NOT NULL DEFAULT '',
            notes TEXT NULL,
            workspace_label VARCHAR(80) NOT NULL DEFAULT 'workspace',
            app_title VARCHAR(120) NOT NULL DEFAULT 'Ticket System',
            logo_name VARCHAR(190) NOT NULL DEFAULT '',
            logo_data_url MEDIUMTEXT NULL,
            logo_url VARCHAR(255) NOT NULL DEFAULT '/logo.png',
            theme VARCHAR(20) NOT NULL DEFAULT 'light',
            active TINYINT(1) NOT NULL DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_companies_active_name (active, name)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");

    if (!ticket_categories_table_has_column($pdo, 'description')) {
        $pdo->exec('ALTER TABLE ticket_categories ADD COLUMN description TEXT NULL AFTER third_category');
    }
    if (!ticket_categories_table_has_column($pdo, 'visible_ssp')) {
        $pdo->exec('ALTER TABLE ticket_categories ADD COLUMN visible_ssp TINYINT(1) NOT NULL DEFAULT 1 AFTER description');
    }
    if (!ticket_categories_table_has_column($pdo, 'visible_admin')) {
        $pdo->exec('ALTER TABLE ticket_categories ADD COLUMN visible_admin TINYINT(1) NOT NULL DEFAULT 1 AFTER visible_ssp');
    }
    if (!ticket_categories_table_has_column($pdo, 'enable_incident')) {
        $pdo->exec('ALTER TABLE ticket_categories ADD COLUMN enable_incident TINYINT(1) NOT NULL DEFAULT 1 AFTER visible_admin');
    }
    if (!ticket_categories_table_has_column($pdo, 'enable_request')) {
        $pdo->exec('ALTER TABLE ticket_categories ADD COLUMN enable_request TINYINT(1) NOT NULL DEFAULT 1 AFTER enable_incident');
    }
    if (!ticket_categories_table_has_column($pdo, 'enable_change')) {
        $pdo->exec('ALTER TABLE ticket_categories ADD COLUMN enable_change TINYINT(1) NOT NULL DEFAULT 1 AFTER enable_request');
    }
    if (!ticket_categories_table_has_column($pdo, 'enable_problem')) {
        $pdo->exec('ALTER TABLE ticket_categories ADD COLUMN enable_problem TINYINT(1) NOT NULL DEFAULT 1 AFTER enable_change');
    }
    if (!companies_table_has_column($pdo, 'name')) {
        $pdo->exec("ALTER TABLE companies ADD COLUMN name VARCHAR(160) NOT NULL DEFAULT '' AFTER id");
    }
    if (!companies_table_has_column($pdo, 'address')) {
        $pdo->exec("ALTER TABLE companies ADD COLUMN address VARCHAR(190) NOT NULL DEFAULT '' AFTER name");
    }
    if (!companies_table_has_column($pdo, 'address2')) {
        $pdo->exec("ALTER TABLE companies ADD COLUMN address2 VARCHAR(190) NOT NULL DEFAULT '' AFTER address");
    }
    if (!companies_table_has_column($pdo, 'city')) {
        $pdo->exec("ALTER TABLE companies ADD COLUMN city VARCHAR(100) NOT NULL DEFAULT '' AFTER address2");
    }
    if (!companies_table_has_column($pdo, 'state')) {
        $pdo->exec("ALTER TABLE companies ADD COLUMN state VARCHAR(80) NOT NULL DEFAULT '' AFTER city");
    }
    if (!companies_table_has_column($pdo, 'zip')) {
        $pdo->exec("ALTER TABLE companies ADD COLUMN zip VARCHAR(30) NOT NULL DEFAULT '' AFTER state");
    }
    if (!companies_table_has_column($pdo, 'phone')) {
        $pdo->exec("ALTER TABLE companies ADD COLUMN phone VARCHAR(60) NOT NULL DEFAULT '' AFTER zip");
    }
    if (!companies_table_has_column($pdo, 'notes')) {
        $pdo->exec('ALTER TABLE companies ADD COLUMN notes TEXT NULL AFTER phone');
    }
    if (!companies_table_has_column($pdo, 'workspace_label')) {
        $pdo->exec("ALTER TABLE companies ADD COLUMN workspace_label VARCHAR(80) NOT NULL DEFAULT 'workspace' AFTER notes");
    }
    if (!companies_table_has_column($pdo, 'app_title')) {
        $pdo->exec("ALTER TABLE companies ADD COLUMN app_title VARCHAR(120) NOT NULL DEFAULT 'Ticket System' AFTER workspace_label");
    }
    if (!companies_table_has_column($pdo, 'logo_name')) {
        $pdo->exec("ALTER TABLE companies ADD COLUMN logo_name VARCHAR(190) NOT NULL DEFAULT '' AFTER app_title");
    }
    if (!companies_table_has_column($pdo, 'logo_data_url')) {
        $pdo->exec('ALTER TABLE companies ADD COLUMN logo_data_url MEDIUMTEXT NULL AFTER logo_name');
    }
    if (!companies_table_has_column($pdo, 'logo_url')) {
        $pdo->exec("ALTER TABLE companies ADD COLUMN logo_url VARCHAR(255) NOT NULL DEFAULT '/logo.png' AFTER logo_data_url");
    }
    if (!companies_table_has_column($pdo, 'theme')) {
        $pdo->exec("ALTER TABLE companies ADD COLUMN theme VARCHAR(20) NOT NULL DEFAULT 'light' AFTER logo_url");
    }
    if (!companies_table_has_column($pdo, 'active')) {
        $pdo->exec('ALTER TABLE companies ADD COLUMN active TINYINT(1) NOT NULL DEFAULT 1 AFTER theme');
    }
    if (!companies_table_has_column($pdo, 'created_at')) {
        $pdo->exec('ALTER TABLE companies ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP AFTER active');
    }
    if (!companies_table_has_column($pdo, 'updated_at')) {
        $pdo->exec('ALTER TABLE companies ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at');
    }

    seed_ticket_priorities($pdo);
    seed_ticket_statuses($pdo);
    seed_ticket_categories($pdo);
    seed_default_company($pdo);
    normalize_company_workspace_labels($pdo);
    assign_default_company_to_users($pdo);
    ensure_ticket_company_schema($pdo);

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
        INSERT INTO ticket_categories (sysaid_id, category, sub_category, third_category, description, visible_ssp, visible_admin, enable_incident, enable_request, enable_change, enable_problem, sort_order, active)
        VALUES (?, ?, ?, ?, ?, 1, 1, 1, 1, 1, 1, ?, 1)
    ');
    foreach ($categories as $index => $category) {
        $stmt->execute([
            isset($category['id']) ? (int) $category['id'] : null,
            trim((string) ($category['category'] ?? '')),
            trim((string) ($category['subCategory'] ?? $category['sub_category'] ?? '')),
            trim((string) ($category['thirdCategory'] ?? $category['third_category'] ?? '')),
            trim((string) ($category['description'] ?? '')),
            $index + 1,
        ]);
    }
}

function seed_default_company(PDO $pdo): void
{
    if ((int) $pdo->query('SELECT COUNT(*) FROM companies')->fetchColumn() > 0) {
        $stmt = $pdo->prepare("
            UPDATE companies
            SET logo_url = '/logo.png'
            WHERE LOWER(name) = 'weneedhelp'
                AND COALESCE(logo_data_url, '') = ''
                AND (logo_url = '' OR logo_url = '/logo.svg' OR logo_url = '/assets/logo.svg')
        ");
        $stmt->execute();
        return;
    }

    $stmt = $pdo->prepare('
        INSERT INTO companies (name, workspace_label, app_title, logo_name, logo_data_url, logo_url, theme, active)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1)
    ');
    $stmt->execute([
        'Weneedhelp',
        'weneedhelp',
        'Ticket System',
        '',
        '',
        '/logo.png',
        'light',
    ]);
}

function ensure_ticket_company_schema(PDO $pdo): void
{
    if (!table_exists($pdo, 'tickets')) {
        return;
    }

    if (!tickets_table_has_column($pdo, 'company_id')) {
        $pdo->exec('ALTER TABLE tickets ADD COLUMN company_id INT NULL AFTER id');
    }

    $companyId = default_company_id($pdo);
    if ($companyId) {
        $pdo->prepare('UPDATE tickets SET company_id = ? WHERE company_id IS NULL OR company_id = 0')->execute([$companyId]);
    }

    if (!table_has_index($pdo, 'tickets', 'idx_ticket_company')) {
        $pdo->exec('ALTER TABLE tickets ADD INDEX idx_ticket_company (company_id)');
    }
}

function normalize_company_workspace_labels(PDO $pdo): void
{
    $rows = $pdo->query('SELECT id, workspace_label FROM companies')->fetchAll();
    if (!$rows) {
        return;
    }

    $stmt = $pdo->prepare('UPDATE companies SET workspace_label = ? WHERE id = ?');
    foreach ($rows as $row) {
        $current = (string) ($row['workspace_label'] ?? '');
        $normalized = normalize_workspace_label($current);
        if ($normalized !== $current) {
            $stmt->execute([$normalized, (int) $row['id']]);
        }
    }
}

function default_company_id(PDO $pdo): ?int
{
    $stmt = $pdo->query("SELECT id FROM companies WHERE LOWER(name) = 'weneedhelp' ORDER BY id LIMIT 1");
    $id = $stmt->fetchColumn();
    if ($id !== false) {
        return (int) $id;
    }

    $stmt = $pdo->query('SELECT id FROM companies ORDER BY active DESC, id LIMIT 1');
    $id = $stmt->fetchColumn();
    return $id === false ? null : (int) $id;
}

function company_is_weneedhelp(PDO $pdo, ?int $companyId): bool
{
    if (!$companyId) {
        return false;
    }

    $stmt = $pdo->prepare('SELECT name FROM companies WHERE id = ? LIMIT 1');
    $stmt->execute([$companyId]);
    $name = $stmt->fetchColumn();
    return is_string($name) && strtolower(trim($name)) === 'weneedhelp';
}

function company_by_workspace_label(PDO $pdo, string $workspaceLabel): ?array
{
    $slug = normalize_workspace_label($workspaceLabel, '');
    if ($slug === '') {
        return null;
    }

    $stmt = $pdo->prepare('
        SELECT id, name, workspace_label, app_title, logo_name, logo_data_url, logo_url, theme, active
        FROM companies
        WHERE workspace_label = ? AND active = 1
        LIMIT 1
    ');
    $stmt->execute([$slug]);
    $company = $stmt->fetch();
    return $company ?: null;
}

function user_can_access_portal_company(array $user, int $companyId): bool
{
    if (empty($user['portal_access'])) {
        return false;
    }

    $userCompanyId = isset($user['company_id']) ? (int) $user['company_id'] : 0;
    return $userCompanyId === $companyId || !empty($user['can_monitor_companies']);
}

function user_uses_portal_layout(array $user): bool
{
    $role = strtolower((string) ($user['role'] ?? ''));
    return empty($user['is_tech']) && $role === 'end user';
}

function portal_company_id_for_user(array $user): ?int
{
    $sessionCompanyId = isset($_SESSION['ticket_portal_company_id']) ? (int) $_SESSION['ticket_portal_company_id'] : 0;
    if ($sessionCompanyId > 0 && user_can_access_portal_company($user, $sessionCompanyId)) {
        return $sessionCompanyId;
    }

    if (user_uses_portal_layout($user) && !empty($user['company_id'])) {
        return (int) $user['company_id'];
    }

    return null;
}

function assign_default_company_to_users(PDO $pdo): void
{
    $companyId = default_company_id($pdo);
    if (!$companyId) {
        return;
    }

    $pdo->prepare('UPDATE users SET company_id = ? WHERE company_id IS NULL OR company_id = 0')->execute([$companyId]);
    $pdo->exec("UPDATE users SET portal_access = 1 WHERE LOWER(role) = 'end user' OR LOWER(role) LIKE '%admin%'");
    $pdo->exec("
        UPDATE users
        SET can_monitor_companies = 0
        WHERE LOWER(role) NOT LIKE '%admin%'
            OR company_id IS NULL
            OR company_id NOT IN (SELECT id FROM companies WHERE LOWER(name) = 'weneedhelp')
    ");
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
        'companyId' => isset($user['company_id']) && $user['company_id'] !== null ? (int) $user['company_id'] : null,
        'companyName' => (string) ($user['company_name'] ?? ''),
        'companyWorkspace' => normalize_workspace_label($user['company_workspace_label'] ?? '', ''),
        'active' => !isset($user['active']) || !empty($user['active']),
        'isTech' => !isset($user['is_tech']) || !empty($user['is_tech']),
        'portalAccess' => !empty($user['portal_access']),
        'canMonitorCompanies' => !empty($user['can_monitor_companies']),
        'passwordResetRequired' => !empty($user['password_reset_required']),
    ];
}

function current_user(PDO $pdo): ?array
{
    if (empty($_SESSION['ticket_user_id'])) {
        return null;
    }

    $stmt = $pdo->prepare('
        SELECT users.id, users.name, users.email, users.role, users.company_id, companies.name AS company_name,
            companies.workspace_label AS company_workspace_label,
            users.active, users.is_tech, users.portal_access, users.can_monitor_companies, users.password_reset_required
        FROM users
        LEFT JOIN companies ON companies.id = users.company_id
        WHERE users.id = ? AND users.active = 1
        LIMIT 1
    ');
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
    $ticket['companyId'] = isset($ticket['company_id']) && $ticket['company_id'] !== null ? (int) $ticket['company_id'] : null;
    $ticket['requestTime'] = $ticket['request_time'];
    $ticket['requestUser'] = $ticket['request_user'];
    $ticket['subCategory'] = $ticket['sub_category'];
    $ticket['thirdCategory'] = $ticket['third_category'];
    $ticket['modifyUser'] = $ticket['modify_user'];
    unset($ticket['company_id'], $ticket['request_time'], $ticket['request_user'], $ticket['sub_category'], $ticket['third_category'], $ticket['modify_user']);
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
                'description' => (string) ($category['description'] ?? ''),
                'visibleSsp' => !array_key_exists('visible_ssp', $category) || !empty($category['visible_ssp']),
                'visibleAdmin' => !array_key_exists('visible_admin', $category) || !empty($category['visible_admin']),
                'enableIncident' => !array_key_exists('enable_incident', $category) || !empty($category['enable_incident']),
                'enableRequest' => !array_key_exists('enable_request', $category) || !empty($category['enable_request']),
                'enableChange' => !array_key_exists('enable_change', $category) || !empty($category['enable_change']),
                'enableProblem' => !array_key_exists('enable_problem', $category) || !empty($category['enable_problem']),
                'sortOrder' => (int) $category['sort_order'],
                'active' => !empty($category['active']),
            ];
        }, $pdo->query('SELECT id, sysaid_id, category, sub_category, third_category, description, visible_ssp, visible_admin, enable_incident, enable_request, enable_change, enable_problem, sort_order, active FROM ticket_categories ORDER BY sort_order, id')->fetchAll()),
        'companies' => companies_payload($pdo),
        'branding' => branding_payload($pdo),
    ];
}

function companies_payload(PDO $pdo): array
{
    $rows = $pdo->query('
        SELECT id, name, address, address2, city, state, zip, phone, notes, workspace_label, app_title, logo_name, logo_data_url, logo_url, theme, active
        FROM companies
        ORDER BY active DESC, name, id
    ')->fetchAll();

    return array_map(static function (array $company): array {
        return [
            'id' => (int) $company['id'],
            'name' => (string) $company['name'],
            'address' => (string) $company['address'],
            'address2' => (string) $company['address2'],
            'city' => (string) $company['city'],
            'state' => (string) $company['state'],
            'zip' => (string) $company['zip'],
            'phone' => (string) $company['phone'],
            'notes' => (string) ($company['notes'] ?? ''),
            'workspaceLabel' => normalize_workspace_label($company['workspace_label'] ?? 'workspace'),
            'appTitle' => (string) ($company['app_title'] ?: 'Ticket System'),
            'logoName' => (string) $company['logo_name'],
            'logoDataUrl' => (string) ($company['logo_data_url'] ?? ''),
            'logoUrl' => (string) ($company['logo_url'] ?: '/logo.png'),
            'theme' => in_array((string) $company['theme'], ['light', 'dark'], true) ? (string) $company['theme'] : 'light',
            'active' => !empty($company['active']),
        ];
    }, $rows);
}

function branding_payload(PDO $pdo, string $workspaceLabel = ''): array
{
    $slug = normalize_workspace_label($workspaceLabel, '');
    if ($slug !== '') {
        $stmt = $pdo->prepare('
            SELECT name, workspace_label, app_title, logo_name, logo_data_url, logo_url, theme
            FROM companies
            WHERE active = 1 AND workspace_label = ?
            LIMIT 1
        ');
        $stmt->execute([$slug]);
    } else {
        $stmt = $pdo->query('
            SELECT name, workspace_label, app_title, logo_name, logo_data_url, logo_url, theme
            FROM companies
            WHERE active = 1
            ORDER BY name, id
            LIMIT 1
        ');
    }
    $company = $stmt->fetch();
    if (!$company) {
        return [
            'workspaceLabel' => 'workspace',
            'appTitle' => 'Ticket System',
            'logoName' => '',
            'logoDataUrl' => '',
            'logoUrl' => '/logo.png',
            'theme' => 'light',
        ];
    }

    $theme = (string) ($company['theme'] ?? 'light');
    return [
        'workspaceLabel' => normalize_workspace_label($company['workspace_label'] ?? 'workspace'),
        'appTitle' => (string) ($company['app_title'] ?: 'Ticket System'),
        'logoName' => (string) ($company['logo_name'] ?? ''),
        'logoDataUrl' => (string) ($company['logo_data_url'] ?? ''),
        'logoUrl' => (string) ($company['logo_url'] ?: '/logo.png'),
        'theme' => in_array($theme, ['light', 'dark'], true) ? $theme : 'light',
    ];
}

function users_payload(PDO $pdo): array
{
    $users = $pdo->query('
        SELECT users.id, users.name, users.email, users.role, users.company_id, companies.name AS company_name,
            companies.workspace_label AS company_workspace_label,
            users.active, users.is_tech, users.portal_access, users.can_monitor_companies, users.password_reset_required
        FROM users
        LEFT JOIN companies ON companies.id = users.company_id
        ORDER BY users.active DESC, users.name
    ')->fetchAll();
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

function current_origin(): string
{
    $host = (string) ($_SERVER['HTTP_HOST'] ?? 'weneedhelp.us');
    if (!preg_match('/^[A-Za-z0-9.-]+(?::[0-9]+)?$/', $host)) {
        $host = 'weneedhelp.us';
    }

    $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
    return $scheme . '://' . $host;
}

function app_base_url(): string
{
    $scriptName = (string) ($_SERVER['SCRIPT_NAME'] ?? '/api/index.php');
    $basePath = rtrim(str_replace('\\', '/', dirname(dirname($scriptName))), '/');
    return current_origin() . ($basePath === '' ? '' : $basePath);
}

function password_reset_from_email(): string
{
    $config = tickets_config();
    $from = $config['password_reset_from_email'] ?? $config['smtp_from'] ?? $config['smtp_username'] ?? '';
    if (is_string($from) && filter_var($from, FILTER_VALIDATE_EMAIL)) {
        return strtolower($from);
    }

    $host = (string) ($_SERVER['HTTP_HOST'] ?? 'weneedhelp.us');
    $host = preg_replace('/:\d+$/', '', $host) ?? 'weneedhelp.us';
    $host = preg_replace('/[^A-Za-z0-9.-]/', '', $host) ?? 'weneedhelp.us';
    $host = preg_replace('/^www\./i', '', $host) ?? $host;
    if ($host === '') {
        $host = 'weneedhelp.us';
    }
    return 'no-reply@' . $host;
}

function send_password_reset_email(array $user, string $resetLink): bool
{
    $subject = 'Ticket System password reset';
    $body = "A password reset was requested for your Ticket System account.\n\n"
        . "Use this link within 60 minutes to set a new password:\n"
        . $resetLink . "\n\n"
        . "If you did not request this, you can ignore this message.";
    $to = (string) $user['email'];
    $from = password_reset_from_email();
    $fromName = 'Ticket System';

    $smtp = password_reset_smtp_config();
    if ($smtp) {
        $smtpResult = smtp_send_ticket_message(
            $smtp['host'],
            $smtp['username'],
            $smtp['password'],
            $to,
            $subject,
            $body,
            $smtp['from'] ?: $from,
            $smtp['fromName'] ?: $fromName,
            $smtp['ports'],
            $smtp['verifyPeer']
        );
        if ($smtpResult['ok']) {
            return true;
        }
        error_log('Ticket password reset SMTP failed: ' . ($smtpResult['error'] ?? 'unknown error'));
    }

    if (!function_exists('mail')) {
        error_log('Ticket password reset email failed: PHP mail() is unavailable.');
        return false;
    }

    $headers = [
        'From: ' . format_mailbox_header($fromName, $from),
        'Reply-To: ' . $from,
        'Sender: ' . $from,
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: 8bit',
    ];

    $ok = @mail($to, $subject, $body, implode("\r\n", $headers), '-f' . $from);
    if (!$ok) {
        error_log('Ticket password reset email failed: PHP mail() returned false.');
    }
    return $ok;
}

function password_reset_smtp_config(): ?array
{
    $config = tickets_config();
    $smtp = isset($config['smtp']) && is_array($config['smtp']) ? $config['smtp'] : [];
    $host = trim((string) ($smtp['host'] ?? $config['smtp_host'] ?? ''));
    $username = trim((string) ($smtp['username'] ?? $config['smtp_username'] ?? ''));
    $password = (string) ($smtp['password'] ?? $config['smtp_password'] ?? '');
    if ($host === '' || $username === '' || $password === '') {
        return null;
    }

    $port = (int) ($smtp['port'] ?? $config['smtp_port'] ?? 0);
    $ports = $port > 0 ? [$port] : [465, 587];
    $from = trim((string) ($smtp['from'] ?? $config['smtp_from'] ?? $username));
    if (!filter_var($from, FILTER_VALIDATE_EMAIL)) {
        $from = $username;
    }

    return [
        'host' => $host,
        'username' => $username,
        'password' => $password,
        'from' => $from,
        'fromName' => trim((string) ($smtp['from_name'] ?? $config['smtp_from_name'] ?? 'Ticket System')),
        'ports' => $ports,
        'verifyPeer' => (bool) ($smtp['verify_peer'] ?? $config['smtp_verify_peer'] ?? false),
    ];
}

function smtp_send_ticket_message(string $host, string $username, string $password, string $to, string $subject, string $body, string $from, string $fromName, array $ports, bool $verifyPeer): array
{
    $lastResult = ['ok' => false, 'error' => 'SMTP connection failed.'];
    foreach ($ports as $port) {
        $lastResult = smtp_try_send_ticket_message($host, (int) $port, $username, $password, $to, $subject, $body, $from, $fromName, $verifyPeer);
        if ($lastResult['ok']) {
            return $lastResult;
        }
    }
    return $lastResult;
}

function smtp_try_send_ticket_message(string $host, int $port, string $username, string $password, string $to, string $subject, string $body, string $from, string $fromName, bool $verifyPeer): array
{
    $context = stream_context_create([
        'ssl' => [
            'verify_peer' => $verifyPeer,
            'verify_peer_name' => $verifyPeer,
            'allow_self_signed' => !$verifyPeer,
        ],
    ]);
    $target = $port === 465 ? "ssl://{$host}:{$port}" : "tcp://{$host}:{$port}";
    $socket = @stream_socket_client($target, $errno, $errstr, 15, STREAM_CLIENT_CONNECT, $context);
    if (!$socket) {
        return ['ok' => false, 'error' => $errstr ?: "Could not connect to {$host}:{$port}."];
    }

    stream_set_timeout($socket, 15);
    try {
        smtp_expect_ticket_response($socket, [220]);
        smtp_ticket_command($socket, 'EHLO ' . smtp_local_hostname(), [250]);

        if ($port === 587) {
            smtp_ticket_command($socket, 'STARTTLS', [220]);
            if (!stream_socket_enable_crypto($socket, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
                throw new RuntimeException('Could not start TLS encryption.');
            }
            smtp_ticket_command($socket, 'EHLO ' . smtp_local_hostname(), [250]);
        }

        smtp_ticket_command($socket, 'AUTH LOGIN', [334]);
        smtp_ticket_command($socket, base64_encode($username), [334]);
        smtp_ticket_command($socket, base64_encode($password), [235]);
        smtp_ticket_command($socket, 'MAIL FROM:<' . $from . '>', [250]);
        smtp_ticket_command($socket, 'RCPT TO:<' . $to . '>', [250, 251]);
        smtp_ticket_command($socket, 'DATA', [354]);

        $headers = [
            'From: ' . format_mailbox_header($fromName, $from),
            'Reply-To: ' . $from,
            'Sender: ' . $from,
            'To: ' . $to,
            'Subject: ' . encode_mail_header($subject),
            'Message-ID: <' . bin2hex(random_bytes(16)) . '@' . sender_domain_from_email($from) . '>',
            'MIME-Version: 1.0',
            'Content-Type: text/plain; charset=UTF-8',
            'Content-Transfer-Encoding: 8bit',
            'Date: ' . date(DATE_RFC2822),
            'X-Mailer: Ticket System',
        ];
        $payload = implode("\r\n", $headers) . "\r\n\r\n" . dot_stuff_mail_body($body) . "\r\n.";
        $response = smtp_ticket_command($socket, $payload, [250]);
        smtp_ticket_command($socket, 'QUIT', [221]);
        fclose($socket);
        return ['ok' => true, 'response' => trim($response)];
    } catch (Throwable $error) {
        fclose($socket);
        return ['ok' => false, 'error' => $error->getMessage()];
    }
}

function smtp_ticket_command($socket, string $command, array $expectedCodes): string
{
    fwrite($socket, $command . "\r\n");
    return smtp_expect_ticket_response($socket, $expectedCodes);
}

function smtp_expect_ticket_response($socket, array $expectedCodes): string
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

function smtp_local_hostname(): string
{
    $host = (string) ($_SERVER['HTTP_HOST'] ?? 'localhost');
    return preg_replace('/[^A-Za-z0-9.-]/', '', preg_replace('/:\d+$/', '', $host) ?? '') ?: 'localhost';
}

function format_mailbox_header(string $name, string $email): string
{
    return encode_mail_header($name) . ' <' . $email . '>';
}

function encode_mail_header(string $value): string
{
    if (function_exists('mb_encode_mimeheader')) {
        return mb_encode_mimeheader($value, 'UTF-8');
    }
    return '=?UTF-8?B?' . base64_encode($value) . '?=';
}

function dot_stuff_mail_body(string $body): string
{
    $body = str_replace(["\r\n", "\r"], "\n", $body);
    $body = preg_replace('/^\./m', '..', $body);
    return str_replace("\n", "\r\n", (string) $body);
}

function sender_domain_from_email(string $email): string
{
    $parts = explode('@', $email);
    return preg_replace('/[^A-Za-z0-9.-]/i', '', strtolower((string) end($parts))) ?: 'localhost';
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
