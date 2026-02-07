<?php

/**
 * Laravel proxy for Insayt analytics.
 *
 * Add to routes/api.php:
 *   Route::post('/collect', [InsaytController::class, 'collect']);
 *   Route::get('/stats', [InsaytController::class, 'stats']);
 *
 * Set INSAYT_URL in your .env:
 *   INSAYT_URL=http://localhost:3002
 */

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;

class InsaytController extends Controller
{
    private function insaytUrl(): string
    {
        return rtrim(env('INSAYT_URL', 'http://localhost:3002'), '/');
    }

    /**
     * Proxy tracker events to Insayt server.
     */
    public function collect(Request $request)
    {
        $response = Http::post(
            $this->insaytUrl() . '/api/collect',
            $request->all()
        );

        return response()->json(
            $response->json(),
            $response->status()
        );
    }

    /**
     * Proxy stats queries to Insayt server.
     */
    public function stats(Request $request)
    {
        $headers = [];
        if ($request->hasHeader('X-Insayt-Secret')) {
            $headers['X-Insayt-Secret'] = $request->header('X-Insayt-Secret');
        }

        $response = Http::withHeaders($headers)->get(
            $this->insaytUrl() . '/api/stats',
            $request->query()
        );

        return response()->json(
            $response->json(),
            $response->status()
        );
    }
}
