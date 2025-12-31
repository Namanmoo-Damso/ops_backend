import { Injectable, Logger } from '@nestjs/common';
import { DevicesRepository } from './devices.repository';
import { PrismaService } from '../prisma';
import { RegisterDeviceDto, DeviceResponseDto } from './dto';
import { toUserRow } from '../database/prisma-mappers';

type PushEnv = 'prod' | 'sandbox';

@Injectable()
export class DevicesService {
  private readonly logger = new Logger(DevicesService.name);

  constructor(
    private readonly devicesRepository: DevicesRepository,
    private readonly prisma: PrismaService,
  ) {}

  private normalizeEnv(env?: string): PushEnv {
    return env === 'sandbox' ? 'sandbox' : 'prod';
  }

  private summarizeToken(token?: string): string {
    if (!token) return 'none';
    const suffix = token.slice(-6);
    return `len=${token.length}..${suffix}`;
  }

  /**
   * 디바이스 등록
   */
  async registerDevice(params: {
    identity: string;
    displayName?: string;
    platform: string;
    env?: string;
    apnsToken?: string;
    voipToken?: string;
    supportsCallKit?: boolean;
  }): Promise<DeviceResponseDto> {
    if (!params.apnsToken && !params.voipToken) {
      throw new Error('apnsToken or voipToken is required');
    }

    const defaultEnv = process.env.APNS_ENV === 'sandbox' ? 'sandbox' : 'prod';
    const env = this.normalizeEnv(params.env ?? defaultEnv);

    this.logger.log(
      `registerDevice identity=${params.identity} env=${env} supportsCallKit=${params.supportsCallKit ?? true} apns=${this.summarizeToken(params.apnsToken)} voip=${this.summarizeToken(params.voipToken)}`,
    );

    // User upsert
    const user = await this.prisma.user.upsert({
      where: { identity: params.identity },
      update: {
        displayName: params.displayName ?? undefined,
        updatedAt: new Date(),
      },
      create: {
        identity: params.identity,
        displayName: params.displayName ?? null,
      },
    });

    const userRow = toUserRow(user);

    const result = await this.devicesRepository.upsert(userRow, {
      platform: params.platform,
      env,
      apnsToken: params.apnsToken,
      voipToken: params.voipToken,
      supportsCallKit: params.supportsCallKit,
    });

    return {
      user: {
        id: result.user.id,
        identity: result.user.identity,
        displayName: result.user.display_name,
      },
      device: result.device
        ? {
            id: result.device.id,
            platform: result.device.platform,
            hasApnsToken: !!result.device.apns_token,
            hasVoipToken: !!result.device.voip_token,
            supportsCallKit: result.device.supports_callkit,
            env: result.device.env,
            lastSeen: result.device.last_seen,
          }
        : undefined,
    };
  }

  /**
   * Identity로 모든 디바이스 조회
   */
  async listAllByIdentity(identity: string, env?: string) {
    return this.devicesRepository.listAllByIdentity({ identity, env });
  }

  /**
   * Identity로 특정 유형 디바이스 조회
   */
  async listByIdentity(identity: string, tokenType: 'apns' | 'voip', env?: string) {
    return this.devicesRepository.listByIdentity({ identity, tokenType, env });
  }

  /**
   * 토큰 무효화
   */
  async invalidateToken(tokenType: 'apns' | 'voip', token: string) {
    return this.devicesRepository.invalidateToken(tokenType, token);
  }

  /**
   * 토큰으로 사용자 찾기
   */
  async findUserByToken(tokenType: 'apns' | 'voip', token: string) {
    return this.devicesRepository.findUserByToken({ tokenType, token });
  }

  /**
   * 전체 디바이스 목록 (브로드캐스트용)
   */
  async listDevices(tokenType: 'apns' | 'voip', env?: string) {
    return this.devicesRepository.list({ tokenType, env });
  }
}
