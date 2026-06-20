<?php
declare(strict_types=1);
require __DIR__ . '/config.php';

try {
    $auth = require_login();
    $folders = list_mail_folders();
    $keys = ['inbox', 'sent', 'drafts', 'archive', 'spam', 'trash'];
    $counts = [];

    foreach ($keys as $key) {
        $path = folder_path_for_key($key, $folders);
        $mailbox = imap_mailbox_string($auth['host'], imap_utf7_encode($path));
        $imap = open_imap('INBOX');
        $status = @imap_status($imap, $mailbox, SA_MESSAGES);
        imap_close($imap);
        $counts[$key] = $status ? (int) $status->messages : 0;
    }

    json_response(['counts' => $counts]);
} catch (Throwable $error) {
    json_response([
        'error' => 'Could not load folder counts.',
        'detail' => $error->getMessage(),
    ], 500);
}
