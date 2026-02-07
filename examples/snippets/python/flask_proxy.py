"""
Flask proxy for Insayt analytics.

Forwards browser tracker events to your Insayt server.
Useful when your main app is Python but you run Insayt as a separate service.

Usage:
    pip install flask requests
    INSAYT_URL=http://localhost:3002 flask run
"""

import os
import requests
from flask import Flask, request, jsonify

app = Flask(__name__)

INSAYT_URL = os.environ.get("INSAYT_URL", "http://localhost:3002")


@app.route("/api/collect", methods=["POST", "OPTIONS"])
def collect():
    """Proxy tracker events to Insayt server."""
    if request.method == "OPTIONS":
        return _cors_preflight()

    resp = requests.post(
        f"{INSAYT_URL}/api/collect",
        json=request.json,
        headers={"Content-Type": "application/json"},
    )

    response = jsonify(resp.json())
    response.status_code = resp.status_code
    response.headers["Access-Control-Allow-Origin"] = "*"
    return response


@app.route("/api/stats", methods=["GET", "OPTIONS"])
def stats():
    """Proxy stats queries to Insayt server."""
    if request.method == "OPTIONS":
        return _cors_preflight()

    headers = {"Content-Type": "application/json"}
    if "X-Insayt-Secret" in request.headers:
        headers["X-Insayt-Secret"] = request.headers["X-Insayt-Secret"]

    resp = requests.get(
        f"{INSAYT_URL}/api/stats",
        params=request.args,
        headers=headers,
    )

    response = jsonify(resp.json())
    response.status_code = resp.status_code
    response.headers["Access-Control-Allow-Origin"] = "*"
    return response


def _cors_preflight():
    response = app.make_default_options_response()
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, X-Insayt-Secret"
    return response


if __name__ == "__main__":
    app.run(port=5000, debug=True)
