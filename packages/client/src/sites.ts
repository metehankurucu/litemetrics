import axios, { type AxiosInstance } from 'axios';
import type { Site, CreateSiteRequest, UpdateSiteRequest } from '@insayt/core';

export interface SitesClientConfig {
  /** Base URL of the Insayt server */
  baseUrl: string;
  /** Admin secret for authentication */
  adminSecret: string;
  /** Sites endpoint path (default: "/api/sites") */
  endpoint?: string;
}

export class SitesClient {
  private endpoint: string;
  private http: AxiosInstance;

  constructor(config: SitesClientConfig) {
    this.endpoint = config.endpoint ?? '/api/sites';

    this.http = axios.create({
      baseURL: config.baseUrl.replace(/\/$/, ''),
      headers: {
        'Content-Type': 'application/json',
        'X-Insayt-Admin-Secret': config.adminSecret,
      },
    });
  }

  async listSites(): Promise<{ sites: Site[]; total: number }> {
    const { data } = await this.http.get(this.endpoint);
    return data;
  }

  async getSite(siteId: string): Promise<{ site: Site }> {
    const { data } = await this.http.get(`${this.endpoint}/${siteId}`);
    return data;
  }

  async createSite(body: CreateSiteRequest): Promise<{ site: Site }> {
    const { data } = await this.http.post(this.endpoint, body);
    return data;
  }

  async updateSite(siteId: string, body: UpdateSiteRequest): Promise<{ site: Site }> {
    const { data } = await this.http.put(`${this.endpoint}/${siteId}`, body);
    return data;
  }

  async deleteSite(siteId: string): Promise<{ ok: boolean }> {
    const { data } = await this.http.delete(`${this.endpoint}/${siteId}`);
    return data;
  }

  async regenerateSecret(siteId: string): Promise<{ site: Site }> {
    const { data } = await this.http.post(`${this.endpoint}/${siteId}/regenerate`);
    return data;
  }
}

export function createSitesClient(config: SitesClientConfig): SitesClient {
  return new SitesClient(config);
}
