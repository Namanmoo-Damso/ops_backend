/**
 * RTC Service
 * LiveKit RTC 토큰 발급 서비스
 */
import { Injectable, Logger } from '@nestjs/common';
import { AccessToken, type AccessTokenOptions } from 'livekit-server-sdk';
import { RtcRepository } from './rtc.repository';
import { DevicesService } from '../devices/devices.service';

type Role = 'host' | 'viewer' | 'observer';

type RtcTokenResult = {
  livekitUrl: string;
  roomName: string;
  token: string;
  expiresAt: string;
  identity: string;
  name: string;
  role: Role;
};

type RtcConfig = {
  livekitUrl: string;
  livekitApiKey: string;
  livekitApiSecret: string;
  livekitTokenTtlSeconds: number;
};

const getConfig = (): RtcConfig => {
  const livekitUrl = process.env.LIVEKIT_URL;
  const livekitApiKey = process.env.LIVEKIT_API_KEY;
  const livekitApiSecret = process.env.LIVEKIT_API_SECRET;

  if (!livekitUrl || !livekitApiKey || !livekitApiSecret) {
    throw new Error('Missing required LiveKit environment variables');
  }

  return {
    livekitUrl,
    livekitApiKey,
    livekitApiSecret,
    livekitTokenTtlSeconds: parseInt(process.env.LIVEKIT_TOKEN_TTL ?? '600', 10),
  };
};

@Injectable()
export class RtcService {
  private readonly logger = new Logger(RtcService.name);

  constructor(
    private readonly rtcRepository: RtcRepository,
    private readonly devicesService: DevicesService,
  ) {}

  async issueToken(params: {
    roomName: string;
    identity: string;
    name: string;
    role: Role;
    device?: {
      apnsToken?: string;
      voipToken?: string;
      platform?: string;
      env?: string;
      supportsCallKit?: boolean;
    };
  }): Promise<RtcTokenResult> {
    const config = getConfig();
    const ttlSeconds = config.livekitTokenTtlSeconds;
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
    const deviceSummary = params.device
      ? `apns=${this.summarizeToken(params.device.apnsToken)} voip=${this.summarizeToken(params.device.voipToken)} env=${params.device.env ?? 'default'} platform=${params.device.platform ?? 'ios'}`
      : 'none';
    this.logger.log(
      `issueToken room=${params.roomName} identity=${params.identity} role=${params.role} device=${deviceSummary}`,
    );

    let identity = params.identity;
    let name = params.name;

    // 디바이스 토큰으로 기존 사용자 조회 (identity 덮어쓰기)
    const candidates: Array<{ tokenType: 'apns' | 'voip'; token: string }> = [];
    if (params.device?.voipToken) {
      candidates.push({ tokenType: 'voip', token: params.device.voipToken.trim() });
    }
    if (params.device?.apnsToken) {
      candidates.push({ tokenType: 'apns', token: params.device.apnsToken.trim() });
    }
    for (const candidate of candidates) {
      if (!candidate.token) continue;
      const existing = await this.rtcRepository.findUserByDeviceToken(candidate);
      if (existing) {
        identity = existing.identity;
        name = existing.display_name ?? name;
        this.logger.log(
          `issueToken identity override via ${candidate.tokenType} -> ${identity}`,
        );
        break;
      }
    }

    // User upsert
    const user = await this.rtcRepository.upsertUser(identity, name);

    // Room member upsert
    await this.rtcRepository.upsertRoomMember({
      roomName: params.roomName,
      userId: user.id,
      role: params.role,
    });

    // 디바이스 등록
    if (params.device?.apnsToken || params.device?.voipToken) {
      await this.devicesService.registerDevice({
        identity,
        displayName: name,
        platform: params.device.platform ?? 'ios',
        env: params.device.env,
        apnsToken: params.device.apnsToken,
        voipToken: params.device.voipToken,
        supportsCallKit: params.device.supportsCallKit,
      });
    }

    // LiveKit 토큰 생성
    const options: AccessTokenOptions = {
      identity,
      name,
      ttl: ttlSeconds,
    };
    const accessToken = new AccessToken(
      config.livekitApiKey,
      config.livekitApiSecret,
      options,
    );

    accessToken.addGrant({
      roomJoin: true,
      room: params.roomName,
      canPublish: params.role !== 'observer',
      canSubscribe: true,
      canPublishData: params.role !== 'observer',
      roomAdmin: params.role === 'host',
    });

    return {
      livekitUrl: config.livekitUrl,
      roomName: params.roomName,
      token: await accessToken.toJwt(),
      expiresAt,
      identity,
      name,
      role: params.role,
    };
  }

  private summarizeToken(token?: string) {
    if (!token) return 'none';
    const suffix = token.slice(-6);
    return `len=${token.length}..${suffix}`;
  }
}
