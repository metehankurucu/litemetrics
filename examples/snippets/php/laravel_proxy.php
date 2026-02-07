<?php

/**
 * Laravel proxy for Litemetrics analytics.
 *
 * Add to routes/api.php:
 *   Route::post('/collect', [LitemetricsController::class, 'collect']);
 *   Route::get('/stats', [LitemetricsController::class, 'stats']);
 *
 * Set LITEMETRICS_URL in your .env:
 *   LITEMETRICS_URL=http://localhost:3002
 */

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;

class LitemetricsController extends Controller
{
    private function litemetricsUrl(): string
    {
        return rtrim(env('LITEMETRICS_URL', 'http://localhost:3002'), '/');
    }

    /**
     * Proxy tracker events to Litemetrics server.
     */
    public function collect(Request $request)
    {
        $response = Http::post(
            $this->litemetricsUrl() . '/api/collect',
            $request->all()
        );

        return response()->json(
            $response->json(),
            $response->status()
        );
    }

    /**
     * Proxy stats queries to Litemetrics server.
     */
    public function stats(Request $request)
    {
        $headers = [];
        if ($request->hasHeader('X-Litemetrics-Secret')) {
            $headers['X-Litemetrics-Secret'] = $request->header('X-Litemetrics-Secret');
        }

        $response = Http::withHeaders($headers)->get(
            $this->litemetricsUrl() . '/api/stats',
            $request->query()
        );

        return response()->json(
            $response->json(),
            $response->status()
        );
    }
}
