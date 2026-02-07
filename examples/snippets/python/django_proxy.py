"""
Django view for proxying Insayt analytics events.

Add to your urls.py:
    path('api/collect', views.insayt_collect),
    path('api/stats', views.insayt_stats),

Requires:
    pip install requests

Set INSAYT_URL in your Django settings:
    INSAYT_URL = "http://localhost:3002"
"""

import json
import requests
from django.conf import settings
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

INSAYT_URL = getattr(settings, "INSAYT_URL", "http://localhost:3002")


@csrf_exempt
@require_http_methods(["POST"])
def insayt_collect(request):
    """Proxy tracker events to Insayt server."""
    try:
        body = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({"ok": False, "error": "Invalid JSON"}, status=400)

    resp = requests.post(
        f"{INSAYT_URL}/api/collect",
        json=body,
        headers={"Content-Type": "application/json"},
    )

    return JsonResponse(resp.json(), status=resp.status_code)


@require_http_methods(["GET"])
def insayt_stats(request):
    """Proxy stats queries to Insayt server."""
    headers = {"Content-Type": "application/json"}

    secret = request.headers.get("X-Insayt-Secret")
    if secret:
        headers["X-Insayt-Secret"] = secret

    resp = requests.get(
        f"{INSAYT_URL}/api/stats",
        params=request.GET.dict(),
        headers=headers,
    )

    return JsonResponse(resp.json(), status=resp.status_code)
