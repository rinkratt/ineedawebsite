<?php
declare(strict_types=1);
require __DIR__ . '/config.php';

try {
    $folderKey = strtolower(trim((string) ($_GET['folder'] ?? 'inbox')));
    $query = trim((string) ($_GET['q'] ?? ''));
    $folders = list_mail_folders();
    $folderPath = folder_path_for_key($folderKey, $folders);
    $debug = [];

    if ($folderKey === 'inbox') {
        $candidateFolders = inbox_candidate_folders($folderPath, $folders);
        $messages = [];

        foreach ($candidateFolders as $candidateFolder) {
            $imap = open_imap($candidateFolder);
            $messages = messages_from_uid_search($imap, $folderKey, $query);
            $source = 'uid-search';

            if ($query === '' && !$messages) {
                $messages = messages_from_sequence($imap, $folderKey);
                $source = 'sequence';
            }

            $mailboxInfo = @imap_check($imap);
            $debug[] = [
                'folder' => $candidateFolder,
                'source' => $source,
                'selectedMessages' => (int) ($mailboxInfo->Nmsgs ?? 0),
                'returnedMessages' => count($messages),
                'imapErrors' => imap_errors() ?: [],
            ];
            imap_close($imap);

            if ($messages) {
                json_response(['messages' => $messages]);
            }
        }

        json_response(['messages' => [], 'debug' => $debug]);
    }

    $imap = open_imap($folderPath);
    $messages = messages_from_uid_search($imap, $folderKey, $query);
    imap_close($imap);
    json_response(['messages' => $messages]);
} catch (Throwable $error) {
    json_response([
        'error' => 'Could not load mail.',
        'detail' => $error->getMessage(),
    ], 500);
}

function inbox_candidate_folders(string $folderPath, array $folders): array
{
    $candidates = [$folderPath, 'INBOX', 'Inbox'];

    foreach ($folders as $folder) {
        $path = (string) ($folder['path'] ?? '');
        $display = (string) ($folder['display'] ?? '');
        if (strcasecmp($path, 'INBOX') === 0 || strcasecmp($display, 'Inbox') === 0) {
            $candidates[] = $path;
        }
    }

    return array_values(array_unique(array_filter($candidates, static fn ($value): bool => trim((string) $value) !== '')));
}

function messages_from_uid_search($imap, string $folderKey, string $query): array
{
    $criteria = 'ALL';
    if ($query !== '') {
        $criteria = 'TEXT "' . addcslashes($query, '\\"') . '"';
    }

    $uids = @imap_search($imap, $criteria, SE_UID) ?: [];
    rsort($uids, SORT_NUMERIC);
    $messages = [];

    foreach (array_slice($uids, 0, 50) as $uid) {
        $overviewItems = @imap_fetch_overview($imap, (string) $uid, FT_UID);
        if (!$overviewItems || empty($overviewItems[0])) {
            continue;
        }

        $messages[] = message_from_overview($imap, $folderKey, $overviewItems[0], (int) $uid, true);
    }

    return $messages;
}

function messages_from_sequence($imap, string $folderKey): array
{
    $mailboxInfo = @imap_check($imap);
    $totalMessages = (int) ($mailboxInfo->Nmsgs ?? 0);
    if ($totalMessages <= 0) {
        return [];
    }

    $start = max(1, $totalMessages - 49);
    $overviewItems = @imap_fetch_overview($imap, $start . ':' . $totalMessages) ?: [];
    usort($overviewItems, static fn ($a, $b): int => ((int) ($b->msgno ?? 0)) <=> ((int) ($a->msgno ?? 0)));

    $messages = [];
    foreach ($overviewItems as $overview) {
        $messageNumber = (int) ($overview->msgno ?? 0);
        if ($messageNumber <= 0) {
            continue;
        }

        $uid = (int) ($overview->uid ?? 0);
        if ($uid <= 0) {
            $uid = (int) @imap_uid($imap, $messageNumber);
        }

        $messages[] = message_from_overview($imap, $folderKey, $overview, $uid > 0 ? $uid : $messageNumber, $uid > 0);
    }

    return $messages;
}

function message_from_overview($imap, string $folderKey, object $overview, int $messageId, bool $byUid): array
{
    $sender = message_sender($overview);
    $recipient = message_recipients($overview);
    $messageNumber = (int) ($overview->msgno ?? 0);
    $subject = decode_mime_text($overview->subject ?? '(No subject)') ?: '(No subject)';

    return [
        'id' => (string) $messageId,
        'messageNumber' => $messageNumber,
        'folder' => $folderKey,
        'from' => $sender['name'],
        'email' => $sender['email'],
        'to' => $recipient['name'],
        'toEmail' => $recipient['email'],
        'subject' => $subject,
        'preview' => '',
        'time' => format_mail_time($overview->date ?? ''),
        'unread' => empty($overview->seen),
        'starred' => !empty($overview->flagged),
        'tag' => ucfirst($folderKey),
    ];
}

function fetch_message_text($imap, int $uid): string
{
    $structure = @imap_fetchstructure($imap, $uid, FT_UID);
    if (!$structure) {
        return '';
    }

    $plain = fetch_part_text($imap, $uid, $structure, '', 'plain', FT_UID | FT_PEEK);
    if ($plain !== '') {
        return $plain;
    }

    $html = fetch_part_text($imap, $uid, $structure, '', 'html', FT_UID | FT_PEEK);
    return trim(html_entity_decode(strip_tags($html), ENT_QUOTES | ENT_HTML5, 'UTF-8'));
}

function fetch_message_text_by_number($imap, int $messageNumber): string
{
    $structure = @imap_fetchstructure($imap, $messageNumber);
    if (!$structure) {
        return '';
    }

    $plain = fetch_part_text($imap, $messageNumber, $structure, '', 'plain', FT_PEEK);
    if ($plain !== '') {
        return $plain;
    }

    $html = fetch_part_text($imap, $messageNumber, $structure, '', 'html', FT_PEEK);
    return trim(html_entity_decode(strip_tags($html), ENT_QUOTES | ENT_HTML5, 'UTF-8'));
}

function fetch_part_text($imap, int $messageId, object $part, string $partNumber, string $wantedSubtype, int $flags): string
{
    $subtype = strtolower($part->subtype ?? '');
    $type = (int) ($part->type ?? -1);

    if ($type === 0 && $subtype === $wantedSubtype) {
        $section = $partNumber !== '' ? $partNumber : '1';
        $body = @imap_fetchbody($imap, $messageId, $section, $flags);
        return decode_part_body((string) $body, (int) ($part->encoding ?? 0), part_charset($part));
    }

    if (!empty($part->parts) && is_array($part->parts)) {
        foreach ($part->parts as $index => $childPart) {
            $childNumber = $partNumber === '' ? (string) ($index + 1) : $partNumber . '.' . ($index + 1);
            $body = fetch_part_text($imap, $messageId, $childPart, $childNumber, $wantedSubtype, $flags);
            if ($body !== '') {
                return $body;
            }
        }
    }

    return '';
}

function decode_part_body(string $body, int $encoding, ?string $charset = null): string
{
    if ($encoding === ENCBASE64) {
        $body = base64_decode($body, true) ?: '';
    } elseif ($encoding === ENCQUOTEDPRINTABLE) {
        $body = quoted_printable_decode($body);
    }

    return trim(text_to_utf8($body, $charset));
}
