<?php
declare(strict_types=1);
require __DIR__ . '/config.php';

try {
    $folderKey = strtolower(trim((string) ($_GET['folder'] ?? 'inbox')));
    $uid = (int) ($_GET['id'] ?? 0);
    $messageNumber = (int) ($_GET['messageNumber'] ?? 0);
    if ($uid <= 0) {
        json_response(['error' => 'Missing message id.'], 422);
    }

    $folders = list_mail_folders();
    $folderPath = folder_path_for_key($folderKey, $folders);
    $imap = open_imap($folderPath);
    $overviewItems = @imap_fetch_overview($imap, (string) $uid, FT_UID);
    $fetchByUid = true;

    if (!$overviewItems || empty($overviewItems[0])) {
        $sequence = $messageNumber > 0 ? $messageNumber : (int) @imap_msgno($imap, $uid);
        if ($sequence > 0) {
            $overviewItems = @imap_fetch_overview($imap, (string) $sequence);
            $fetchByUid = false;
        }
    }

    if (!$overviewItems || empty($overviewItems[0])) {
        imap_close($imap);
        json_response(['error' => 'Message not found.', 'detail' => 'The message UID could not be resolved in this folder.'], 404);
    }

    $overview = $overviewItems[0];
    $sender = message_sender($overview);
    $recipient = message_recipients($overview);
    $body = message_body($imap, $fetchByUid ? $uid : (int) ($overview->msgno ?? $messageNumber), $fetchByUid);

    imap_close($imap);
    json_response([
        'message' => [
            'id' => (string) $uid,
            'folder' => $folderKey,
            'from' => $sender['name'],
            'email' => $sender['email'],
            'to' => $recipient['name'],
            'toEmail' => $recipient['email'],
            'subject' => decode_mime_text($overview->subject ?? '(No subject)') ?: '(No subject)',
            'body' => $body,
            'time' => format_mail_time($overview->date ?? ''),
            'unread' => empty($overview->seen),
            'starred' => !empty($overview->flagged),
            'tag' => ucfirst($folderKey),
        ],
    ]);
} catch (Throwable $error) {
    json_response([
        'error' => 'Could not open message.',
        'detail' => $error->getMessage(),
    ], 500);
}

function message_body($imap, int $messageId, bool $byUid): string
{
    $flags = $byUid ? FT_UID : 0;
    $structure = @imap_fetchstructure($imap, $messageId, $flags);
    if (!$structure) {
        return '';
    }

    $plain = message_part($imap, $messageId, $structure, '', 'plain', $flags);
    if ($plain !== '') {
        return $plain;
    }

    $html = message_part($imap, $messageId, $structure, '', 'html', $flags);
    return trim(html_entity_decode(strip_tags($html), ENT_QUOTES | ENT_HTML5, 'UTF-8'));
}

function message_part($imap, int $messageId, object $part, string $partNumber, string $wantedSubtype, int $flags): string
{
    $subtype = strtolower($part->subtype ?? '');
    $type = (int) ($part->type ?? -1);

    if ($type === 0 && $subtype === $wantedSubtype) {
        $section = $partNumber !== '' ? $partNumber : '1';
        $body = @imap_fetchbody($imap, $messageId, $section, $flags);
        return decode_message_part((string) $body, (int) ($part->encoding ?? 0), part_charset($part));
    }

    if (!empty($part->parts) && is_array($part->parts)) {
        foreach ($part->parts as $index => $childPart) {
            $childNumber = $partNumber === '' ? (string) ($index + 1) : $partNumber . '.' . ($index + 1);
            $body = message_part($imap, $messageId, $childPart, $childNumber, $wantedSubtype, $flags);
            if ($body !== '') {
                return $body;
            }
        }
    }

    return '';
}

function decode_message_part(string $body, int $encoding, ?string $charset = null): string
{
    if ($encoding === ENCBASE64) {
        $body = base64_decode($body, true) ?: '';
    } elseif ($encoding === ENCQUOTEDPRINTABLE) {
        $body = quoted_printable_decode($body);
    }

    return trim(text_to_utf8($body, $charset));
}
