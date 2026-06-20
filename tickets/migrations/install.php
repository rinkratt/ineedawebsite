<?php
declare(strict_types=1);

require dirname(__DIR__) . '/api/bootstrap.php';

try {
    $pdo = db();

    $pdo->exec("
        CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(120) NOT NULL,
            email VARCHAR(190) NOT NULL UNIQUE,
            role VARCHAR(80) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");

    $pdo->exec("
        CREATE TABLE IF NOT EXISTS tickets (
            id INT AUTO_INCREMENT PRIMARY KEY,
            type VARCHAR(40) NOT NULL DEFAULT 'Request',
            title VARCHAR(190) NOT NULL,
            status VARCHAR(60) NOT NULL DEFAULT 'New',
            urgency VARCHAR(80) NOT NULL DEFAULT 'Low - Not Urgent',
            request_time DATETIME NOT NULL,
            request_user VARCHAR(120) NOT NULL,
            priority VARCHAR(40) NOT NULL DEFAULT 'P5-Low',
            assignee VARCHAR(120) DEFAULT '',
            category VARCHAR(100) DEFAULT '',
            sub_category VARCHAR(100) DEFAULT '',
            third_category VARCHAR(100) DEFAULT '',
            modify_user VARCHAR(120) DEFAULT '',
            description TEXT,
            impact VARCHAR(80) DEFAULT 'Individual user',
            asset VARCHAR(120) DEFAULT '',
            template VARCHAR(80) DEFAULT 'DEFAULT',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_status (status),
            INDEX idx_type (type),
            INDEX idx_assignee (assignee)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");

    $pdo->exec("
        CREATE TABLE IF NOT EXISTS ticket_activity (
            id INT AUTO_INCREMENT PRIMARY KEY,
            ticket_id INT NOT NULL,
            actor VARCHAR(120) NOT NULL,
            event VARCHAR(190) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_ticket_activity_ticket (ticket_id),
            CONSTRAINT fk_ticket_activity_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");

    $pdo->exec("
        CREATE TABLE IF NOT EXISTS ticket_notes (
            id INT AUTO_INCREMENT PRIMARY KEY,
            ticket_id INT NOT NULL,
            author VARCHAR(120) NOT NULL,
            body TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT fk_ticket_notes_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");

    $pdo->exec("
        CREATE TABLE IF NOT EXISTS ticket_attachments (
            id INT AUTO_INCREMENT PRIMARY KEY,
            ticket_id INT NOT NULL,
            file_name VARCHAR(190) NOT NULL,
            file_path VARCHAR(255) NOT NULL,
            uploaded_by VARCHAR(120) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT fk_ticket_attachments_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");

    $users = [
        ['Kelly Cox', 'kelly.cox@ineedawebsite.us', 'Admin'],
        ['Matt Arnold', 'Matt.Arnold@ineedawebsite.us', 'Tier 2 Tech'],
        ['Larsen Vallecillo', 'Larsen.Vallecillo@ineedawebsite.us', 'Tier 2 Tech'],
    ];
    $userStmt = $pdo->prepare('INSERT INTO users (name, email, role) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name), role = VALUES(role)');
    foreach ($users as $user) {
        $userStmt->execute($user);
    }

    $count = (int) $pdo->query('SELECT COUNT(*) FROM tickets')->fetchColumn();
    if ($count === 0) {
        $ticketStmt = $pdo->prepare('
            INSERT INTO tickets (type, title, status, urgency, request_time, request_user, priority, assignee, category, sub_category, third_category, modify_user, description, impact, asset, template)
            VALUES (?, ?, ?, ?, DATE_SUB(NOW(), INTERVAL ? DAY), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ');
        $tickets = [
            ['Request', 'Add user directory and roles', 'New', 'Normal - Within a week', 0, 'Kelly Cox', 'P4-Normal', 'Kelly Cox', 'Application', 'Ticket System', 'Users', 'Kelly Cox', 'Create the first internal users: admin plus Tier 2 technicians.', 'Individual user', '', 'DEFAULT'],
            ['Request', 'Build email intake plan', 'New', 'High - By the end of tomorrow', 1, 'Kelly Cox', 'P1-Highest', 'Matt Arnold', 'Application', 'Ticket System', 'Email Intake', 'Kelly Cox', 'Plan how inbound support emails should become tickets with sender, subject, and message body mapped into service records.', 'Department', '', 'DEFAULT'],
            ['Problem', 'Local storage is temporary', 'In Progress', 'Normal - Within a week', 2, 'Kelly Cox', 'P4-Normal', 'Larsen Vallecillo', 'Application', 'Ticket System', 'Data Storage', 'Larsen Vallecillo', 'Replace browser-only storage with the shared MySQL-backed API.', 'Organization', '', 'DEFAULT'],
            ['Change', 'Deploy ticket system under /tickets', 'Resolved', 'Low - Not Urgent', 3, 'Kelly Cox', 'P5-Low', 'Kelly Cox', 'Hosting', 'Plesk', 'Deployment', 'Kelly Cox', 'Publish the ticket prototype to ineedawebsite.us/tickets and verify the public URL after upload.', 'Individual user', '', 'DEFAULT'],
            ['Incident', 'Mobile create button was hidden', 'Resolved', 'Low - Not Urgent', 4, 'Kelly Cox', 'P5-Low', 'Matt Arnold', 'Interface', 'Responsive', 'Navigation', 'Matt Arnold', 'The sidebar create action disappeared on mobile. Add a visible New Ticket action in the top bar.', 'Individual user', '', 'DEFAULT'],
            ['Request', 'Create branded dashboard', 'In Progress', 'Normal - Within a week', 5, 'Kelly Cox', 'P4-Normal', 'Larsen Vallecillo', 'Interface', 'Dashboard', 'Branding', 'Larsen Vallecillo', 'Keep the original friendly dashboard style while showing the dense service-record table from the Tickets nav item.', 'Individual user', '', 'DEFAULT'],
        ];
        foreach ($tickets as $ticket) {
            $ticketStmt->execute($ticket);
            $ticketId = (int) $pdo->lastInsertId();
            $activity = $pdo->prepare('INSERT INTO ticket_activity (ticket_id, actor, event) VALUES (?, ?, ?)');
            $activity->execute([$ticketId, $ticket[11], 'Service record opened']);
        }
    }

    json_response(['ok' => true, 'message' => 'Install complete']);
} catch (Throwable $error) {
    json_response(['error' => 'Install failed'], 500);
}
