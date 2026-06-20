<?php
declare(strict_types=1);

require dirname(__DIR__) . '/api/bootstrap.php';

try {
    $pdo = db();
    $stmt = $pdo->prepare('DELETE FROM tickets WHERE title = ?');
    $stmt->execute(['Database save verification']);
    json_response(['ok' => true, 'deleted' => $stmt->rowCount()]);
} catch (Throwable $error) {
    json_response(['error' => 'Cleanup failed'], 500);
}
