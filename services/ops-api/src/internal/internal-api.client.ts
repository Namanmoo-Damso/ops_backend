import { Injectable, Logger } from '@nestjs/common';

/**
 * Internal API Response types
 */
export interface InternalUserDto {
  id: string;
  identity: string;
  displayName: string | null;
  userType: string | null;
  email: string | null;
  nickname: string | null;
  createdAt: string;
}

export interface InternalWardDto {
  id: string;
  userId: string;
  phoneNumber: string;
  guardianId: string | null;
  organizationId: string | null;
  aiPersona: string;
  createdAt: string;
}

export interface InternalDeviceDto {
  id: string;
  platform: string;
  hasApnsToken: boolean;
  hasVoipToken: boolean;
  supportsCallKit: boolean;
  env: string;
  lastSeen: string;
}

/**
 * Internal API Client
 * 서버 간 동기 HTTP 통신 클라이언트
 */
@Injectable()
export class InternalApiClient {
  private readonly logger = new Logger(InternalApiClient.name);

  private getHeaders(): Record<string, string> {
    const secret = process.env.INTERNAL_AUTH_SECRET;
    const serviceName = process.env.SERVICE_NAME || 'ops-api';

    if (!secret) {
      this.logger.warn('INTERNAL_AUTH_SECRET not configured');
    }

    return {
      'Content-Type': 'application/json',
      'X-Internal-Auth': secret || '',
      'X-Service-Name': serviceName,
    };
  }

  private getBaseUrl(): string {
    return process.env.OPS_API_URL || 'http://localhost:8080';
  }

  async getUser(userId: string): Promise<InternalUserDto | null> {
    const url = `${this.getBaseUrl()}/internal/users/${userId}`;

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      if (response.status === 404) {
        return null;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return (await response.json()) as InternalUserDto;
    } catch (error) {
      this.logger.error(`getUser failed userId=${userId} error=${(error as Error).message}`);
      throw error;
    }
  }

  async getUserByIdentity(identity: string): Promise<InternalUserDto | null> {
    const url = `${this.getBaseUrl()}/internal/users/identity/${encodeURIComponent(identity)}`;

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      if (response.status === 404) {
        return null;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return (await response.json()) as InternalUserDto;
    } catch (error) {
      this.logger.error(`getUserByIdentity failed identity=${identity} error=${(error as Error).message}`);
      throw error;
    }
  }

  async getWard(wardId: string): Promise<InternalWardDto | null> {
    const url = `${this.getBaseUrl()}/internal/wards/${wardId}`;

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      if (response.status === 404) {
        return null;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return (await response.json()) as InternalWardDto;
    } catch (error) {
      this.logger.error(`getWard failed wardId=${wardId} error=${(error as Error).message}`);
      throw error;
    }
  }

  async getDevicesByUser(userId: string): Promise<{ devices: InternalDeviceDto[] }> {
    const url = `${this.getBaseUrl()}/internal/devices/user/${userId}`;

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return (await response.json()) as { devices: InternalDeviceDto[] };
    } catch (error) {
      this.logger.error(`getDevicesByUser failed userId=${userId} error=${(error as Error).message}`);
      throw error;
    }
  }
}
