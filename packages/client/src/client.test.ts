import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LitemetricsClient, createClient } from './client';

// Mock axios
const mockGet = vi.fn().mockResolvedValue({ data: {} });
vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => ({ get: mockGet })),
  },
}));

import axios from 'axios';
const mockCreate = vi.mocked(axios.create);

describe('LitemetricsClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue({ data: { total: 0, data: [] } });
  });

  // ─── Constructor ───

  describe('constructor', () => {
    it('removes trailing slash from baseUrl', () => {
      new LitemetricsClient({ baseUrl: 'https://example.com/', siteId: 's' });
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ baseURL: 'https://example.com' }),
      );
    });

    it('sets X-Litemetrics-Secret header when secretKey provided', () => {
      new LitemetricsClient({ baseUrl: 'https://example.com', siteId: 's', secretKey: 'sk_abc' });
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({ 'X-Litemetrics-Secret': 'sk_abc' }),
        }),
      );
    });

    it('does not set secret header when secretKey is absent', () => {
      new LitemetricsClient({ baseUrl: 'https://example.com', siteId: 's' });
      const headers = mockCreate.mock.calls[0][0]!.headers as Record<string, string>;
      expect(headers['X-Litemetrics-Secret']).toBeUndefined();
    });

    it('merges custom headers', () => {
      new LitemetricsClient({
        baseUrl: 'https://example.com',
        siteId: 's',
        headers: { 'X-Custom': 'val' },
      });
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({ 'X-Custom': 'val' }),
        }),
      );
    });
  });

  // ─── getStats ───

  describe('getStats', () => {
    it('sends siteId and metric as params', async () => {
      const client = new LitemetricsClient({ baseUrl: 'https://x.com', siteId: 'site_a' });
      await client.getStats('pageviews');

      expect(mockGet).toHaveBeenCalledWith('/api/stats', {
        params: expect.objectContaining({ siteId: 'site_a', metric: 'pageviews' }),
      });
    });

    it('includes period and timezone when provided', async () => {
      const client = new LitemetricsClient({ baseUrl: 'https://x.com', siteId: 's' });
      await client.getStats('visitors', { period: '7d', timezone: 'America/New_York' });

      expect(mockGet).toHaveBeenCalledWith('/api/stats', {
        params: expect.objectContaining({
          period: '7d',
          timezone: 'America/New_York',
        }),
      });
    });

    it('converts limit to string', async () => {
      const client = new LitemetricsClient({ baseUrl: 'https://x.com', siteId: 's' });
      await client.getStats('top_pages', { limit: 10 });

      expect(mockGet).toHaveBeenCalledWith('/api/stats', {
        params: expect.objectContaining({ limit: '10' }),
      });
    });

    it('serializes filters as JSON', async () => {
      const client = new LitemetricsClient({ baseUrl: 'https://x.com', siteId: 's' });
      await client.getStats('pageviews', { filters: { country: 'US' } });

      expect(mockGet).toHaveBeenCalledWith('/api/stats', {
        params: expect.objectContaining({ filters: '{"country":"US"}' }),
      });
    });

    it('sends compare as "true"', async () => {
      const client = new LitemetricsClient({ baseUrl: 'https://x.com', siteId: 's' });
      await client.getStats('pageviews', { compare: true });

      expect(mockGet).toHaveBeenCalledWith('/api/stats', {
        params: expect.objectContaining({ compare: 'true' }),
      });
    });

    it('omits undefined optional params', async () => {
      const client = new LitemetricsClient({ baseUrl: 'https://x.com', siteId: 's' });
      await client.getStats('pageviews');

      const params = mockGet.mock.calls[0][1].params;
      expect(params).not.toHaveProperty('period');
      expect(params).not.toHaveProperty('timezone');
      expect(params).not.toHaveProperty('filters');
      expect(params).not.toHaveProperty('compare');
      expect(params).not.toHaveProperty('limit');
    });
  });

  // ─── getTimeSeries ───

  describe('getTimeSeries', () => {
    it('sets metric=timeseries and tsMetric', async () => {
      const client = new LitemetricsClient({ baseUrl: 'https://x.com', siteId: 's' });
      await client.getTimeSeries('pageviews');

      expect(mockGet).toHaveBeenCalledWith('/api/stats', {
        params: expect.objectContaining({ metric: 'timeseries', tsMetric: 'pageviews' }),
      });
    });

    it('includes timezone when provided', async () => {
      const client = new LitemetricsClient({ baseUrl: 'https://x.com', siteId: 's' });
      await client.getTimeSeries('visitors', { timezone: 'Europe/Istanbul' });

      expect(mockGet).toHaveBeenCalledWith('/api/stats', {
        params: expect.objectContaining({ timezone: 'Europe/Istanbul' }),
      });
    });

    it('includes granularity when provided', async () => {
      const client = new LitemetricsClient({ baseUrl: 'https://x.com', siteId: 's' });
      await client.getTimeSeries('pageviews', { granularity: 'hour' });

      expect(mockGet).toHaveBeenCalledWith('/api/stats', {
        params: expect.objectContaining({ granularity: 'hour' }),
      });
    });
  });

  // ─── getOverview ───

  describe('getOverview', () => {
    it('fetches default 5 metrics', async () => {
      const client = new LitemetricsClient({ baseUrl: 'https://x.com', siteId: 's' });
      const result = await client.getOverview();

      expect(mockGet).toHaveBeenCalledTimes(5);
      expect(result).toHaveProperty('pageviews');
      expect(result).toHaveProperty('visitors');
      expect(result).toHaveProperty('sessions');
      expect(result).toHaveProperty('events');
      expect(result).toHaveProperty('conversions');
    });

    it('fetches custom metrics list', async () => {
      const client = new LitemetricsClient({ baseUrl: 'https://x.com', siteId: 's' });
      const result = await client.getOverview(['pageviews', 'visitors']);

      expect(mockGet).toHaveBeenCalledTimes(2);
      expect(result).toHaveProperty('pageviews');
      expect(result).toHaveProperty('visitors');
    });
  });

  // ─── setSiteId ───

  describe('setSiteId', () => {
    it('subsequent calls use the new siteId', async () => {
      const client = new LitemetricsClient({ baseUrl: 'https://x.com', siteId: 'site_a' });
      client.setSiteId('site_b');
      await client.getStats('pageviews');

      expect(mockGet).toHaveBeenCalledWith('/api/stats', {
        params: expect.objectContaining({ siteId: 'site_b' }),
      });
    });
  });

  // ─── createClient factory ───

  describe('createClient', () => {
    it('returns a LitemetricsClient instance', () => {
      const client = createClient({ baseUrl: 'https://x.com', siteId: 's' });
      expect(client).toBeInstanceOf(LitemetricsClient);
    });
  });
});
