<?php
declare(strict_types=1);
require __DIR__ . '/config.php';

$data = json_input();
$fromKey = strtolower(trim((string) ($data['from'] ?? 'inbox')));
$toKey = strtolower(trim((string) ($data['to'] ?? 'archive')));
$uid = (int) ($data['id'] ?? 0);

if ($uid <= 0) {
    json_response(['error' => 'Missing message id.'], 422);
}

$folders = list_mail_folders();
$fromPath = folder_path_for_key($fromKey, $folders);
$toPath = folder_path_for_key($toKey, $folders);

if ($toPath !== 'INBOX') {
    ensure_folder_exists($toPath);
}

$imap = open_imap($fromPath, false);
$moved = @imap_mail_move($imap, (string) $uid, $toPath, CP_UID);

if ($moved) {
    @imap_expunge($imap);
    imap_close($imap);
    json_response(['ok' => true]);
}

$error = clean_imap_error();
imap_close($imap);
json_response(['error' => 'Could not move message.', 'detail' => $error], 502);

