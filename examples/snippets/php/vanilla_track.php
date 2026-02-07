<?php

/**
 * Vanilla PHP server-side tracking for Litemetrics.
 *
 * No framework required — just curl.
 *
 * Usage:
 *   require_once 'vanilla_track.php';
 *   track_pageview('your-site-id', '/about');
 *   track_event('your-site-id', 'purchase', ['amount' => 99]);
 */

define('LITEMETRICS_URL', getenv('LITEMETRICS_URL') ?: 'http://localhost:3002');

/**
 * Track a pageview event.
 */
function track_pageview(string $siteId, string $url, ?string $referrer = null, ?string $visitorId = null): array
{
    return send_event([
        'type' => 'pageview',
        'siteId' => $siteId,
        'timestamp' => round(microtime(true) * 1000),
        'sessionId' => 'server',
        'visitorId' => $visitorId ?? 'server',
        'url' => $url,
        'referrer' => $referrer,
    ]);
}

/**
 * Track a custom event.
 */
function track_event(string $siteId, string $name, array $properties = [], ?string $visitorId = null): array
{
    return send_event([
        'type' => 'event',
        'siteId' => $siteId,
        'timestamp' => round(microtime(true) * 1000),
        'sessionId' => 'server',
        'visitorId' => $visitorId ?? 'server',
        'name' => $name,
        'properties' => $properties,
    ]);
}

/**
 * Identify a user.
 */
function identify_user(string $siteId, string $userId, array $traits = [], ?string $visitorId = null): array
{
    return send_event([
        'type' => 'identify',
        'siteId' => $siteId,
        'timestamp' => round(microtime(true) * 1000),
        'sessionId' => 'server',
        'visitorId' => $visitorId ?? 'server',
        'userId' => $userId,
        'traits' => $traits,
    ]);
}

/**
 * Send event to Litemetrics collect endpoint.
 */
function send_event(array $event): array
{
    $payload = json_encode(['events' => [$event]]);

    $ch = curl_init(LITEMETRICS_URL . '/api/collect');
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $payload,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 5,
    ]);

    $result = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($result === false) {
        return ['ok' => false, 'error' => 'Request failed'];
    }

    return json_decode($result, true) ?? ['ok' => false, 'error' => 'Invalid response'];
}

// Example usage
if (php_sapi_name() === 'cli') {
    $result = track_pageview('your-site-id', '/pricing');
    echo "Pageview: " . json_encode($result) . "\n";

    $result = track_event('your-site-id', 'signup', ['plan' => 'pro']);
    echo "Event: " . json_encode($result) . "\n";

    $result = identify_user('your-site-id', 'user_123', ['name' => 'Jane']);
    echo "Identify: " . json_encode($result) . "\n";
}
