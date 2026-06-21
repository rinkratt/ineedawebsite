<?php
declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

try {
    $pdo = db();
    $action = $_GET['action'] ?? 'bootstrap';

    if ($action === 'bootstrap') {
        $users = $pdo->query('SELECT id, name, email, role FROM users ORDER BY id')->fetchAll();
        $ticketRows = $pdo->query('SELECT * FROM tickets ORDER BY id DESC')->fetchAll();
        $tickets = array_map('db_ticket_to_api', $ticketRows);

        if ($tickets) {
            $activity = $pdo->query('SELECT ticket_id, actor, event, created_at AS time FROM ticket_activity ORDER BY id DESC')->fetchAll();
            $activityByTicket = [];
            foreach ($activity as $event) {
                $activityByTicket[(int) $event['ticket_id']][] = [
                    'actor' => $event['actor'],
                    'event' => $event['event'],
                    'time' => $event['time'],
                ];
            }
            foreach ($tickets as &$ticket) {
                $ticket['journey'] = $activityByTicket[$ticket['id']] ?? [];
            }
        }

        json_response(['users' => $users, 'tickets' => $tickets]);
    }

    if ($action === 'save-ticket') {
        $body = read_json_body();
        $id = isset($body['id']) && $body['id'] ? (int) $body['id'] : null;
        $title = trim((string) ($body['title'] ?? ''));
        if ($title === '') {
            json_response(['error' => 'Ticket title is required'], 400);
        }

        $fields = [
            'type' => $body['type'] ?? 'Request',
            'title' => $title,
            'status' => $body['status'] ?? 'New',
            'urgency' => $body['urgency'] ?? 'Low - Not Urgent',
            'request_time' => date('Y-m-d H:i:s', strtotime((string) ($body['requestTime'] ?? 'now'))),
            'request_user' => $body['requestUser'] ?? 'Kelly Cox',
            'priority' => $body['priority'] ?? 'P5-Low',
            'assignee' => $body['assignee'] ?? '',
            'category' => $body['category'] ?? 'Application',
            'sub_category' => $body['subCategory'] ?? 'Ticket System',
            'third_category' => $body['thirdCategory'] ?? 'General',
            'modify_user' => $body['modifyUser'] ?? 'Kelly Cox',
            'description' => $body['description'] ?? '',
            'impact' => $body['impact'] ?? 'Individual user',
            'asset' => $body['asset'] ?? '',
            'template' => $body['template'] ?? 'DEFAULT',
        ];

        if ($id) {
            $sql = 'UPDATE tickets SET type = :type, title = :title, status = :status, urgency = :urgency, request_time = :request_time, request_user = :request_user, priority = :priority, assignee = :assignee, category = :category, sub_category = :sub_category, third_category = :third_category, modify_user = :modify_user, description = :description, impact = :impact, asset = :asset, template = :template, updated_at = NOW() WHERE id = :id';
            $fields['id'] = $id;
            $pdo->prepare($sql)->execute($fields);
            $event = 'Ticket updated';
        } else {
            $sql = 'INSERT INTO tickets (type, title, status, urgency, request_time, request_user, priority, assignee, category, sub_category, third_category, modify_user, description, impact, asset, template) VALUES (:type, :title, :status, :urgency, :request_time, :request_user, :priority, :assignee, :category, :sub_category, :third_category, :modify_user, :description, :impact, :asset, :template)';
            $pdo->prepare($sql)->execute($fields);
            $id = (int) $pdo->lastInsertId();
            $event = 'Service record opened';
        }

        $activity = $pdo->prepare('INSERT INTO ticket_activity (ticket_id, actor, event) VALUES (?, ?, ?)');
        $activity->execute([$id, $fields['modify_user'], $event]);

        json_response(['ticket' => fetch_ticket($pdo, $id)]);
    }

    if ($action === 'ai-ticket-assist') {
        $body = read_json_body();
        $ticket = $body['ticket'] ?? null;
        if (!is_array($ticket)) {
            json_response(['error' => 'Ticket is required'], 400);
        }

        $ticketContext = [
            'id' => $ticket['id'] ?? null,
            'type' => $ticket['type'] ?? '',
            'title' => $ticket['title'] ?? '',
            'status' => $ticket['status'] ?? '',
            'urgency' => $ticket['urgency'] ?? '',
            'priority' => $ticket['priority'] ?? '',
            'assignee' => $ticket['assignee'] ?? '',
            'category' => $ticket['category'] ?? '',
            'subCategory' => $ticket['subCategory'] ?? '',
            'thirdCategory' => $ticket['thirdCategory'] ?? '',
            'requestUser' => $ticket['requestUser'] ?? '',
            'description' => $ticket['description'] ?? '',
            'impact' => $ticket['impact'] ?? '',
            'asset' => $ticket['asset'] ?? '',
            'journey' => $ticket['journey'] ?? [],
        ];

        $response = call_openai([
            'model' => 'gpt-5.4-mini',
            'input' => [
                [
                    'role' => 'developer',
                    'content' => 'You help internal IT support technicians triage service desk tickets. Return concise JSON only. Do not invent facts. If information is missing, list what to ask the requester.',
                ],
                [
                    'role' => 'user',
                    'content' => "Analyze this ticket and return JSON with keys: summary, suggestedPriority, suggestedCategory, nextSteps, missingInfo, draftResponse.\n\nTicket:\n" . json_encode($ticketContext, JSON_THROW_ON_ERROR),
                ],
            ],
            'text' => [
                'format' => [
                    'type' => 'json_schema',
                    'name' => 'ticket_ai_assist',
                    'strict' => true,
                    'schema' => [
                        'type' => 'object',
                        'additionalProperties' => false,
                        'properties' => [
                            'summary' => ['type' => 'string'],
                            'suggestedPriority' => ['type' => 'string'],
                            'suggestedCategory' => ['type' => 'string'],
                            'nextSteps' => [
                                'type' => 'array',
                                'items' => ['type' => 'string'],
                            ],
                            'missingInfo' => [
                                'type' => 'array',
                                'items' => ['type' => 'string'],
                            ],
                            'draftResponse' => ['type' => 'string'],
                        ],
                        'required' => ['summary', 'suggestedPriority', 'suggestedCategory', 'nextSteps', 'missingInfo', 'draftResponse'],
                    ],
                ],
            ],
        ]);

        $text = response_output_text($response);
        $assist = json_decode($text, true);
        if (!is_array($assist)) {
            json_response(['error' => 'AI response could not be parsed'], 502);
        }

        json_response(['assist' => $assist]);
    }

    if ($action === 'ai-chat') {
        $body = read_json_body();
        $rawMessages = $body['messages'] ?? null;
        if (!is_array($rawMessages)) {
            json_response(['error' => 'Messages are required'], 400);
        }

        $truncate = static function (string $value, int $limit): string {
            if (function_exists('mb_substr')) {
                return mb_substr($value, 0, $limit);
            }
            return substr($value, 0, $limit);
        };

        $messages = [];
        foreach ($rawMessages as $message) {
            if (!is_array($message)) {
                continue;
            }

            $role = (string) ($message['role'] ?? '');
            $content = trim((string) ($message['content'] ?? ''));
            if (!in_array($role, ['user', 'assistant'], true) || $content === '') {
                continue;
            }

            $messages[] = [
                'role' => $role,
                'content' => $truncate($content, 2000),
            ];
        }

        $messages = array_slice($messages, -12);
        $hasUserMessage = false;
        foreach ($messages as $message) {
            if ($message['role'] === 'user') {
                $hasUserMessage = true;
                break;
            }
        }
        if (!$hasUserMessage) {
            json_response(['error' => 'A user message is required'], 400);
        }

        $ticketRows = $pdo->query('SELECT id, type, title, status, urgency, request_user, priority, assignee, category, sub_category, description FROM tickets ORDER BY updated_at DESC, id DESC LIMIT 20')->fetchAll();
        $ticketContext = array_map(static function (array $ticket) use ($truncate): array {
            return [
                'id' => (int) $ticket['id'],
                'type' => $ticket['type'] ?? '',
                'title' => $ticket['title'] ?? '',
                'status' => $ticket['status'] ?? '',
                'urgency' => $ticket['urgency'] ?? '',
                'requestUser' => $ticket['request_user'] ?? '',
                'priority' => $ticket['priority'] ?? '',
                'assignee' => $ticket['assignee'] ?? '',
                'category' => $ticket['category'] ?? '',
                'subCategory' => $ticket['sub_category'] ?? '',
                'description' => $truncate((string) ($ticket['description'] ?? ''), 500),
            ];
        }, $ticketRows);

        $input = [
            [
                'role' => 'developer',
                'content' => 'You are the AI chat assistant inside a help desk ticket system for tech staff and end users. Be concise, practical, and friendly. Use the recent ticket context only when it is relevant. Do not invent ticket facts. If information is missing, say what to check or ask next. Do not claim you changed systems, closed tickets, reset passwords, or performed actions; provide suggested steps only.',
            ],
            [
                'role' => 'user',
                'content' => "Recent ticket context:\n" . json_encode($ticketContext, JSON_THROW_ON_ERROR),
            ],
        ];

        foreach ($messages as $message) {
            $input[] = $message;
        }

        $response = call_openai([
            'model' => 'gpt-5.4-mini',
            'input' => $input,
            'max_output_tokens' => 900,
        ]);

        $text = trim(response_output_text($response));
        if ($text === '') {
            json_response(['error' => 'AI response was empty'], 502);
        }

        json_response(['message' => $text]);
    }

    json_response(['error' => 'Unknown action'], 404);
} catch (Throwable $error) {
    json_response(['error' => 'Server error'], 500);
}
