#!/bin/bash

# ─── Insayt API Examples ────────────────────────────────────
#
# Replace these values with your own:
INSAYT_URL="http://localhost:3002"
ADMIN_SECRET="your-admin-secret"
SITE_ID="your-site-id"
SECRET_KEY="your-secret-key"

# ─── Site Management ────────────────────────────────────────

# Create a new site
echo "=== Create Site ==="
curl -s -X POST "$INSAYT_URL/api/sites" \
  -H "Content-Type: application/json" \
  -H "X-Insayt-Admin-Secret: $ADMIN_SECRET" \
  -d '{"name": "My Website", "domain": "mysite.com"}' | jq .

# List all sites
echo -e "\n=== List Sites ==="
curl -s "$INSAYT_URL/api/sites" \
  -H "X-Insayt-Admin-Secret: $ADMIN_SECRET" | jq .

# Get a single site
echo -e "\n=== Get Site ==="
curl -s "$INSAYT_URL/api/sites/$SITE_ID" \
  -H "X-Insayt-Admin-Secret: $ADMIN_SECRET" | jq .

# Update a site
echo -e "\n=== Update Site ==="
curl -s -X PUT "$INSAYT_URL/api/sites/$SITE_ID" \
  -H "Content-Type: application/json" \
  -H "X-Insayt-Admin-Secret: $ADMIN_SECRET" \
  -d '{"name": "Updated Website"}' | jq .

# Regenerate secret key
echo -e "\n=== Regenerate Secret ==="
curl -s -X POST "$INSAYT_URL/api/sites/$SITE_ID/regenerate" \
  -H "X-Insayt-Admin-Secret: $ADMIN_SECRET" | jq .

# ─── Event Collection ───────────────────────────────────────

# Send a pageview event
echo -e "\n=== Track Pageview ==="
curl -s -X POST "$INSAYT_URL/api/collect" \
  -H "Content-Type: application/json" \
  -d "{
    \"events\": [{
      \"type\": \"pageview\",
      \"siteId\": \"$SITE_ID\",
      \"timestamp\": $(date +%s000),
      \"sessionId\": \"sess_test\",
      \"visitorId\": \"vis_test\",
      \"url\": \"/pricing\",
      \"referrer\": \"https://google.com\",
      \"title\": \"Pricing\"
    }]
  }" | jq .

# Send a custom event
echo -e "\n=== Track Custom Event ==="
curl -s -X POST "$INSAYT_URL/api/collect" \
  -H "Content-Type: application/json" \
  -d "{
    \"events\": [{
      \"type\": \"event\",
      \"siteId\": \"$SITE_ID\",
      \"timestamp\": $(date +%s000),
      \"sessionId\": \"sess_test\",
      \"visitorId\": \"vis_test\",
      \"name\": \"signup\",
      \"properties\": {\"plan\": \"pro\"}
    }]
  }" | jq .

# Send an identify event
echo -e "\n=== Identify User ==="
curl -s -X POST "$INSAYT_URL/api/collect" \
  -H "Content-Type: application/json" \
  -d "{
    \"events\": [{
      \"type\": \"identify\",
      \"siteId\": \"$SITE_ID\",
      \"timestamp\": $(date +%s000),
      \"sessionId\": \"sess_test\",
      \"visitorId\": \"vis_test\",
      \"userId\": \"user_123\",
      \"traits\": {\"name\": \"Jane\", \"plan\": \"pro\"}
    }]
  }" | jq .

# ─── Query Analytics ────────────────────────────────────────

# Get pageviews (last 7 days)
echo -e "\n=== Pageviews (7d) ==="
curl -s "$INSAYT_URL/api/stats?siteId=$SITE_ID&metric=pageviews&period=7d" \
  -H "X-Insayt-Secret: $SECRET_KEY" | jq .

# Get unique visitors (last 30 days)
echo -e "\n=== Visitors (30d) ==="
curl -s "$INSAYT_URL/api/stats?siteId=$SITE_ID&metric=visitors&period=30d" \
  -H "X-Insayt-Secret: $SECRET_KEY" | jq .

# Get top pages
echo -e "\n=== Top Pages ==="
curl -s "$INSAYT_URL/api/stats?siteId=$SITE_ID&metric=top_pages&period=30d&limit=5" \
  -H "X-Insayt-Secret: $SECRET_KEY" | jq .

# Get top referrers
echo -e "\n=== Top Referrers ==="
curl -s "$INSAYT_URL/api/stats?siteId=$SITE_ID&metric=top_referrers&period=30d" \
  -H "X-Insayt-Secret: $SECRET_KEY" | jq .

# Get top countries
echo -e "\n=== Top Countries ==="
curl -s "$INSAYT_URL/api/stats?siteId=$SITE_ID&metric=top_countries&period=30d" \
  -H "X-Insayt-Secret: $SECRET_KEY" | jq .

# Get top browsers
echo -e "\n=== Top Browsers ==="
curl -s "$INSAYT_URL/api/stats?siteId=$SITE_ID&metric=top_browsers&period=30d" \
  -H "X-Insayt-Secret: $SECRET_KEY" | jq .

# Get top devices
echo -e "\n=== Top Devices ==="
curl -s "$INSAYT_URL/api/stats?siteId=$SITE_ID&metric=top_devices&period=30d" \
  -H "X-Insayt-Secret: $SECRET_KEY" | jq .

# Custom date range
echo -e "\n=== Custom Range ==="
curl -s "$INSAYT_URL/api/stats?siteId=$SITE_ID&metric=pageviews&period=custom&dateFrom=2024-01-01&dateTo=2024-01-31" \
  -H "X-Insayt-Secret: $SECRET_KEY" | jq .

# Delete a site
# echo -e "\n=== Delete Site ==="
# curl -s -X DELETE "$INSAYT_URL/api/sites/$SITE_ID" \
#   -H "X-Insayt-Admin-Secret: $ADMIN_SECRET" | jq .
