# Integration Guide

How to add Litemetrics tracking to different platforms. All examples assume your server is at `https://analytics.yoursite.com`.

## JavaScript / TypeScript

### HTML

```html
<script src="https://analytics.yoursite.com/litemetrics.js"></script>
<script>
  const tracker = Litemetrics.createTracker({
    siteId: 'YOUR_SITE_ID',
    endpoint: 'https://analytics.yoursite.com/api/collect'
  });

  // Pageviews are tracked automatically.
  // Custom events:
  tracker.track('signup_click', { source: 'hero' });
</script>
```

### Data Attributes

Track clicks without code. Add `data-litemetrics-event` to any element:

```html
<button data-litemetrics-event="Signup" data-litemetrics-event-plan="pro">Sign Up</button>
```

All `data-litemetrics-event-*` attributes are collected as event properties.

### React

```bash
bun add @litemetrics/react
```

```tsx
// App.tsx
import { LitemetricsProvider } from '@litemetrics/react';

function App() {
  return (
    <LitemetricsProvider
      siteId="YOUR_SITE_ID"
      endpoint="https://analytics.yoursite.com/api/collect"
    >
      <YourApp />
    </LitemetricsProvider>
  );
}
```

```tsx
// Hooks
import { useLitemetrics, usePageView } from '@litemetrics/react';
import { useLocation } from 'react-router';

function PageTracker() {
  const { pathname } = useLocation();
  usePageView(pathname);
  return null;
}

function SignupButton() {
  const { track } = useLitemetrics();
  return (
    <button onClick={() => track('signup_click', { plan: 'pro' })}>
      Sign Up
    </button>
  );
}
```

### Next.js (App Router)

```bash
bun add @litemetrics/react
```

```tsx
// app/providers.tsx
'use client';

import { LitemetricsProvider } from '@litemetrics/react';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <LitemetricsProvider
      siteId="YOUR_SITE_ID"
      endpoint="https://analytics.yoursite.com/api/collect"
    >
      {children}
    </LitemetricsProvider>
  );
}
```

```tsx
// app/layout.tsx
import { Providers } from './providers';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

```tsx
// app/page-tracker.tsx
'use client';

import { usePageView } from '@litemetrics/react';
import { usePathname } from 'next/navigation';

export function PageTracker() {
  const pathname = usePathname();
  usePageView(pathname);
  return null;
}
```

### React Native / Expo

```bash
bun add @litemetrics/react-native
```

```tsx
import { LitemetricsProvider, useNavigationTracking } from '@litemetrics/react-native';
import { NavigationContainer, useNavigationContainerRef } from '@react-navigation/native';

function App() {
  const navigationRef = useNavigationContainerRef();

  return (
    <LitemetricsProvider
      siteId="YOUR_SITE_ID"
      endpoint="https://analytics.yoursite.com/api/collect"
    >
      <NavigationContainer ref={navigationRef}>
        <NavigationTracker navigationRef={navigationRef} />
        <YourScreens />
      </NavigationContainer>
    </LitemetricsProvider>
  );
}

function NavigationTracker({ navigationRef }) {
  useNavigationTracking(navigationRef);
  return null;
}
```

### Vue

```bash
bun add @litemetrics/tracker
```

```vue
<script setup>
import { onMounted, onUnmounted } from 'vue';
import { createTracker } from '@litemetrics/tracker';
import { useRouter } from 'vue-router';

let tracker;

onMounted(() => {
  tracker = createTracker({
    siteId: 'YOUR_SITE_ID',
    endpoint: 'https://analytics.yoursite.com/api/collect',
    autoSpa: false,
  });

  const router = useRouter();
  router.afterEach((to) => {
    tracker.page(to.fullPath);
  });
});

onUnmounted(() => {
  tracker?.destroy();
});
</script>
```

---

## Non-JavaScript Servers

For Python, PHP, Ruby, Go, or any other backend: send events to `/api/collect`.

```
POST https://analytics.yoursite.com/api/collect
Content-Type: application/json

{
  "events": [{
    "type": "pageview",
    "siteId": "YOUR_SITE_ID",
    "timestamp": 1700000000000,
    "sessionId": "random-session-id",
    "visitorId": "random-visitor-id",
    "url": "/about",
    "referrer": "https://google.com"
  }]
}
```

### Python (Flask)

```python
import requests
from flask import Flask, request, jsonify

app = Flask(__name__)
LITEMETRICS_URL = 'https://analytics.yoursite.com'

@app.route('/api/collect', methods=['POST'])
def collect():
    resp = requests.post(
        f'{LITEMETRICS_URL}/api/collect',
        json=request.json,
        headers={'Content-Type': 'application/json'}
    )
    return jsonify(resp.json()), resp.status_code
```

### Python (Django)

```python
import json
import requests
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt

LITEMETRICS_URL = 'https://analytics.yoursite.com'

@csrf_exempt
def collect(request):
    if request.method != 'POST':
        return JsonResponse({'error': 'Method not allowed'}, status=405)
    resp = requests.post(
        f'{LITEMETRICS_URL}/api/collect',
        json=json.loads(request.body),
        headers={'Content-Type': 'application/json'}
    )
    return JsonResponse(resp.json(), status=resp.status_code)
```

### PHP (Laravel)

```php
Route::post('/collect', function (Request $request) {
    $response = Http::post(
        env('LITEMETRICS_URL') . '/api/collect',
        $request->all()
    );
    return response()->json($response->json(), $response->status());
});
```

### Ruby (Rails)

```ruby
class AnalyticsController < ApplicationController
  skip_before_action :verify_authenticity_token

  def collect
    response = Net::HTTP.post(
      URI("#{ENV['LITEMETRICS_URL']}/api/collect"),
      request.raw_post,
      'Content-Type' => 'application/json'
    )
    render json: JSON.parse(response.body), status: response.code.to_i
  end
end
```

### Go

```go
func trackEvent(siteID, url string) error {
	payload, _ := json.Marshal(map[string]interface{}{
		"events": []map[string]interface{}{{
			"type":      "pageview",
			"siteId":    siteID,
			"timestamp": time.Now().UnixMilli(),
			"sessionId": "server",
			"visitorId": "server",
			"url":       url,
		}},
	})

	resp, err := http.Post(
		"https://analytics.yoursite.com/api/collect",
		"application/json",
		bytes.NewBuffer(payload),
	)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	return nil
}
```

## Reading Data

Use `@litemetrics/client` or query the API directly:

```bash
bun add @litemetrics/client
```

```ts
import { createClient } from '@litemetrics/client';

const client = createClient({
  baseUrl: 'https://analytics.yoursite.com',
  siteId: 'YOUR_SITE_ID',
  secretKey: 'YOUR_SECRET_KEY',
});

// Configure conversions per site via admin API (once)
// PUT /api/sites/:siteId { conversionEvents: ["Signup", "Purchase"] }

const pageviews = await client.getPageviews({ period: '7d' });
const overview = await client.getOverview(
  ['pageviews', 'visitors', 'sessions', 'conversions'],
  { period: '30d' }
);
const conversions = await client.getStats('conversions', { period: '30d' });
const topConversions = await client.getStats('top_conversions', { period: '30d', limit: 10 });
const timeseries = await client.getTimeSeries('pageviews', { period: '30d' });
const retention = await client.getRetention({ period: '90d', weeks: 8 });
```
