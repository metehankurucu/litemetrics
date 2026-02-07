"""
Direct server-side event tracking with Python.

Use this to track events from your backend (e.g., purchases, signups)
without going through the browser tracker.

Usage:
    pip install requests
    python direct_track.py
"""

import time
import uuid
import requests

LITEMETRICS_URL = "http://localhost:3002"
SITE_ID = "your-site-id"


def track_pageview(url, visitor_id=None, session_id=None, referrer=None):
    """Track a pageview event."""
    return _send_event({
        "type": "pageview",
        "siteId": SITE_ID,
        "timestamp": _now(),
        "sessionId": session_id or "server",
        "visitorId": visitor_id or "server",
        "url": url,
        "referrer": referrer,
    })


def track_event(name, properties=None, visitor_id=None, session_id=None):
    """Track a custom event."""
    return _send_event({
        "type": "event",
        "siteId": SITE_ID,
        "timestamp": _now(),
        "sessionId": session_id or "server",
        "visitorId": visitor_id or "server",
        "name": name,
        "properties": properties or {},
    })


def identify(user_id, traits=None, visitor_id=None):
    """Identify a user with traits."""
    return _send_event({
        "type": "identify",
        "siteId": SITE_ID,
        "timestamp": _now(),
        "sessionId": "server",
        "visitorId": visitor_id or "server",
        "userId": user_id,
        "traits": traits or {},
    })


def _send_event(event):
    """Send event(s) to the Litemetrics collect endpoint."""
    resp = requests.post(
        f"{LITEMETRICS_URL}/api/collect",
        json={"events": [event]},
        headers={"Content-Type": "application/json"},
    )
    return resp.json()


def _now():
    return int(time.time() * 1000)


# Example usage
if __name__ == "__main__":
    visitor = str(uuid.uuid4())
    session = str(uuid.uuid4())

    # Track a pageview
    result = track_pageview("/pricing", visitor_id=visitor, session_id=session)
    print(f"Pageview: {result}")

    # Track a custom event
    result = track_event("signup", {"plan": "pro"}, visitor_id=visitor, session_id=session)
    print(f"Event: {result}")

    # Identify the user
    result = identify("user_123", {"name": "Jane", "plan": "pro"}, visitor_id=visitor)
    print(f"Identify: {result}")
