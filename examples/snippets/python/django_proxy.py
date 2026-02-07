"""
Django view for proxying Litemetrics analytics events.

Add to your urls.py:
    path('api/collect', views.litemetrics_collect),
    path('api/stats', views.litemetrics_stats),

Requires:
    pip install requests

Set LITEMETRICS_URL in your Django settings:
    LITEMETRICS_URL = "http://localhost:3002"
"""

import json
import requests
from django.conf import settings
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

LITEMETRICS_URL = getattr(settings, "LITEMETRICS_URL", "http://localhost:3002")


@csrf_exempt
@require_http_methods(["POST"])
def litemetrics_collect(request):
    """Proxy tracker events to Litemetrics server."""
    try:
        body = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({"ok": False, "error": "Invalid JSON"}, status=400)

    resp = requests.post(
        f"{LITEMETRICS_URL}/api/collect",
        json=body,
        headers={"Content-Type": "application/json"},
    )

    return JsonResponse(resp.json(), status=resp.status_code)


@require_http_methods(["GET"])
def litemetrics_stats(request):
    """Proxy stats queries to Litemetrics server."""
    headers = {"Content-Type": "application/json"}

    secret = request.headers.get("X-Litemetrics-Secret")
    if secret:
        headers["X-Litemetrics-Secret"] = secret

    resp = requests.get(
        f"{LITEMETRICS_URL}/api/stats",
        params=request.GET.dict(),
        headers=headers,
    )

    return JsonResponse(resp.json(), status=resp.status_code)
