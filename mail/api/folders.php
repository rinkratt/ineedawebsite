<?php
declare(strict_types=1);
require __DIR__ . '/config.php';

$folders = list_mail_folders();
$keys = ['inbox', 'sent', 'drafts', 'archive', 'spam', 'trash'];
$result = [];

foreach ($keys as $key) {
    $path = folder_path_for_key($key, $folders);
    $result[] = [
        'key' => $key,
        'path' => $path,
        'label' => ucfirst($key),
    ];
}

json_response(['folders' => $result]);
