import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

/**
 * خدمة المصادقة مع منصة NPHIES السعودية
 * 
 * تستخدم OAuth 2.0 Client Credentials Grant
 * كل طلب يتطلب Access Token صالح
 * يتم تجديد التوكن تلقائياً قبل انتهاء صلاحيته
 * 
 * @see https://www.nphies.sa/en/developers
 */
@Injectable()
export class NphiesAuthService {
  private readonly logger = new Logger(NphiesAuthService.name);

  private accessToken: string | null = null;
  private tokenExpiresAt: Date | null = null;

  // NPHIES Gateway URLs
  private readonly baseUrl: string;
  private readonly clientId: string;
  private readonly clientSecret: string;

  constructor(
    private httpService: HttpService,
    private configService: ConfigService,
  ) {
    this.baseUrl = this.configService.get<string>(
      'NPHIES_BASE_URL',
      'https://HSB.nphies.sa',
    );
    this.clientId = this.configService.get<string>('NPHIES_CLIENT_ID', '');
    this.clientSecret = this.configService.get<string>('NPHIES_CLIENT_SECRET', '');
  }

  /**
   * الحصول على Access Token صالح
   * يعيد التوكن المخزن مؤقتاً إذا كان صالحاً، أو يطلب توكن جديد
   */
  async getAccessToken(): Promise<string> {
    if (this.isTokenValid()) {
      return this.accessToken!;
    }

    return this.refreshToken();
  }

  /**
   * طلب توكن جديد من NPHIES OAuth2 endpoint
   */
  private async refreshToken(): Promise<string> {
    try {
      const tokenUrl = `${this.baseUrl}/oauth2/token`;

      const params = new URLSearchParams();
      params.append('grant_type', 'client_credentials');
      params.append('client_id', this.clientId);
      params.append('client_secret', this.clientSecret);

      const response = await firstValueFrom(
        this.httpService.post(tokenUrl, params.toString(), {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        }),
      );

      this.accessToken = response.data.access_token;
      // تعيين وقت الانتهاء مع هامش أمان 60 ثانية
      const expiresIn = (response.data.expires_in || 3600) - 60;
      this.tokenExpiresAt = new Date(Date.now() + expiresIn * 1000);

      this.logger.log('✅ تم الحصول على NPHIES Access Token بنجاح');
      return this.accessToken!;
    } catch (error: any) {
      this.logger.error(
        `❌ فشل الحصول على NPHIES Token: ${error.response?.data?.error_description || error.message}`,
      );
      throw new Error(`NPHIES Authentication Failed: ${error.message}`);
    }
  }

  /**
   * فحص صلاحية التوكن الحالي
   */
  private isTokenValid(): boolean {
    if (!this.accessToken || !this.tokenExpiresAt) return false;
    return new Date() < this.tokenExpiresAt;
  }

  /**
   * جلب Base URL لاستخدامه في باقي الخدمات
   */
  getBaseUrl(): string {
    return this.baseUrl;
  }

  /**
   * إرسال طلب FHIR مع التوكن (helper مشترك)
   */
  async sendFhirRequest<T = any>(
    endpoint: string,
    bundle: any,
    method: 'POST' | 'GET' = 'POST',
  ): Promise<T> {
    const token = await this.getAccessToken();
    const url = `${this.baseUrl}${endpoint}`;

    const headers = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/fhir+json',
      Accept: 'application/fhir+json',
    };

    try {
      const response = method === 'POST'
        ? await firstValueFrom(this.httpService.post<T>(url, bundle, { headers }))
        : await firstValueFrom(this.httpService.get<T>(url, { headers }));

      return response.data;
    } catch (error: any) {
      const status = error.response?.status;
      const detail = error.response?.data;

      this.logger.error(
        `❌ NPHIES ${endpoint} failed [${status}]: ${JSON.stringify(detail)}`,
      );

      // إذا كان التوكن منتهي، أعد المحاولة مرة واحدة
      if (status === 401) {
        this.accessToken = null;
        const newToken = await this.refreshToken();
        headers.Authorization = `Bearer ${newToken}`;

        const retry = method === 'POST'
          ? await firstValueFrom(this.httpService.post<T>(url, bundle, { headers }))
          : await firstValueFrom(this.httpService.get<T>(url, { headers }));

        return retry.data;
      }

      throw error;
    }
  }
}
