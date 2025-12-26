import { Injectable, Logger } from '@nestjs/common';
import { AccessToken, type AccessTokenOptions } from 'livekit-server-sdk';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { DbService } from './db.service';
import { PushService } from './push.service';

type Role = 'host' | 'viewer' | 'observer';
type PushType = 'alert' | 'voip';
type PushEnv = 'prod' | 'sandbox';
type PushEnvMode = 'prod' | 'sandbox' | 'both';

type ApiTokenResult = {
  accessToken: string;
  expiresAt: string;
  user: {
    id: string;
    identity: string;
    displayName: string;
  };
};

type RtcTokenResult = {
  livekitUrl: string;
  roomName: string;
  token: string;
  expiresAt: string;
  identity: string;
  name: string;
  role: Role;
};

type AuthContext = {
  identity?: string;
  displayName?: string;
  userId?: string;
  sub?: string;
};

type AppConfig = {
  port: number;
  livekitUrl: string;
  livekitApiKey: string;
  livekitApiSecret: string;
  livekitTokenTtlSeconds: number;
  apiJwtSecret: string;
  apiJwtTtlSeconds: number;
  authRequired: boolean;
  corsOrigin: string;
  apnsEnvMode: PushEnvMode;
  apnsDefaultEnv: PushEnv;
};

const getEnv = (key: string, fallback?: string): string => {
  const value = process.env[key] ?? fallback;
  if (!value) {
    throw new Error(`Missing required env: ${key}`);
  }
  return value;
};

const parseBoolean = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined) return fallback;
  return value === 'true' || value === '1';
};

const parseNumber = (value: string | undefined, fallback: number): number => {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return fallback;
  return parsed;
};

let cachedConfig: AppConfig | null = null;
const getConfig = (): AppConfig => {
  if (cachedConfig) return cachedConfig;
  const apnsModeRaw = process.env.APNS_ENV ?? 'prod';
  const apnsMode: PushEnvMode =
    apnsModeRaw === 'both' ? 'both' : apnsModeRaw === 'sandbox' ? 'sandbox' : 'prod';
  cachedConfig = {
    port: parseNumber(process.env.PORT, 8080),
    livekitUrl: getEnv('LIVEKIT_URL'),
    livekitApiKey: getEnv('LIVEKIT_API_KEY'),
    livekitApiSecret: getEnv('LIVEKIT_API_SECRET'),
    livekitTokenTtlSeconds: parseNumber(process.env.LIVEKIT_TOKEN_TTL, 600),
    apiJwtSecret: getEnv('API_JWT_SECRET', 'change-me'),
    apiJwtTtlSeconds: parseNumber(process.env.API_JWT_TTL, 60 * 60 * 24),
    authRequired: parseBoolean(process.env.API_AUTH_REQUIRED, false),
    corsOrigin: getEnv('CORS_ORIGIN', '*'),
    apnsEnvMode: apnsMode,
    apnsDefaultEnv: apnsMode === 'sandbox' ? 'sandbox' : 'prod',
  };
  return cachedConfig;
};

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);

  constructor(
    private readonly dbService: DbService,
    private readonly pushService: PushService,
  ) {}

  getConfig(): AppConfig {
    return getConfig();
  }

  async listRoomMembers(roomName: string) {
    const members = await this.dbService.listRoomMembers(roomName);
    return members.map((member) => ({
      identity: member.identity,
      displayName: member.display_name,
      joinedAt: member.joined_at,
    }));
  }

  issueApiToken(identity: string, displayName: string): ApiTokenResult {
    const config = getConfig();
    const userId = randomUUID();
    const token = jwt.sign(
      { sub: userId, identity, displayName },
      config.apiJwtSecret,
      { expiresIn: config.apiJwtTtlSeconds },
    );
    const expiresAt = new Date(
      Date.now() + config.apiJwtTtlSeconds * 1000,
    ).toISOString();

    return {
      accessToken: token,
      expiresAt,
      user: {
        id: userId,
        identity,
        displayName,
      },
    };
  }

  verifyApiToken(token: string): AuthContext {
    const config = getConfig();
    const payload = jwt.verify(token, config.apiJwtSecret) as AuthContext;
    if (!payload.userId && payload.sub) {
      payload.userId = payload.sub;
    }
    return payload;
  }

  getAuthContext(authorization?: string): AuthContext | null {
    if (!authorization) return null;
    const token = authorization.startsWith('Bearer ')
      ? authorization.slice('Bearer '.length)
      : '';
    if (!token) return null;
    try {
      return this.verifyApiToken(token);
    } catch {
      return null;
    }
  }

  async issueRtcToken(params: {
    roomName: string;
    identity: string;
    name: string;
    role: Role;
    device?: {
      apnsToken?: string;
      voipToken?: string;
      platform?: string;
      env?: string;
    };
  }): Promise<RtcTokenResult> {
    const config = getConfig();
    const ttlSeconds = config.livekitTokenTtlSeconds;
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
    const deviceSummary = params.device
      ? `apns=${this.summarizeToken(params.device.apnsToken)} voip=${this.summarizeToken(params.device.voipToken)} env=${params.device.env ?? 'default'} platform=${params.device.platform ?? 'ios'}`
      : 'none';
    this.logger.log(
      `issueRtcToken room=${params.roomName} identity=${params.identity} role=${params.role} device=${deviceSummary}`,
    );

    let identity = params.identity;
    let name = params.name;
    const candidates: Array<{ tokenType: 'apns' | 'voip'; token: string }> = [];
    if (params.device?.voipToken) {
      candidates.push({ tokenType: 'voip', token: params.device.voipToken.trim() });
    }
    if (params.device?.apnsToken) {
      candidates.push({ tokenType: 'apns', token: params.device.apnsToken.trim() });
    }
    for (const candidate of candidates) {
      if (!candidate.token) continue;
      const existing = await this.dbService.findUserByDeviceToken(candidate);
      if (existing) {
        identity = existing.identity;
        name = existing.display_name ?? name;
        this.logger.log(
          `issueRtcToken identity override via ${candidate.tokenType} -> ${identity}`,
        );
        break;
      }
    }

    const user = await this.dbService.upsertUser(identity, name);
    await this.dbService.upsertRoomMember({
      roomName: params.roomName,
      userId: user.id,
      role: params.role,
    });

    if (params.device?.apnsToken || params.device?.voipToken) {
      await this.registerDevice({
        identity,
        displayName: name,
        platform: params.device.platform ?? 'ios',
        env: params.device.env,
        apnsToken: params.device.apnsToken,
        voipToken: params.device.voipToken,
      });
    }

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

  private normalizeEnv(env?: string): PushEnv {
    return env === 'sandbox' ? 'sandbox' : 'prod';
  }

  async registerDevice(params: {
    identity: string;
    displayName?: string;
    platform: string;
    env?: string;
    apnsToken?: string;
    voipToken?: string;
  }) {
    if (!params.apnsToken && !params.voipToken) {
      throw new Error('apnsToken or voipToken is required');
    }
    const env = this.normalizeEnv(params.env ?? getConfig().apnsDefaultEnv);
    this.logger.log(
      `registerDevice identity=${params.identity} env=${env} apns=${this.summarizeToken(params.apnsToken)} voip=${this.summarizeToken(params.voipToken)}`,
    );
    return this.dbService.upsertDevice({
      identity: params.identity,
      displayName: params.displayName,
      platform: params.platform,
      env,
      apnsToken: params.apnsToken,
      voipToken: params.voipToken,
    });
  }

  async sendBroadcastPush(params: {
    type: PushType;
    title?: string;
    body?: string;
    payload?: Record<string, unknown>;
    env?: string;
  }) {
    const tokenType = params.type === 'voip' ? 'voip' : 'apns';
    const env = params.env ? this.normalizeEnv(params.env) : undefined;
    const tokens = await this.dbService.listDevices({ tokenType, env });
    const result = await this.pushService.sendPush({
      tokens,
      type: params.type,
      title: params.title,
      body: params.body,
      payload: params.payload,
    });
    for (const token of result.invalidTokens) {
      await this.dbService.invalidateToken(tokenType, token);
    }
    this.logger.log(
      `pushBroadcast type=${params.type} requested=${tokens.length} sent=${result.sent} failed=${result.failed} invalid=${result.invalidTokens.length}`,
    );
    return { ...result, requested: tokens.length };
  }

  async sendUserPush(params: {
    identity: string;
    type: PushType;
    title?: string;
    body?: string;
    payload?: Record<string, unknown>;
    env?: string;
  }) {
    const tokenType = params.type === 'voip' ? 'voip' : 'apns';
    const env = params.env ? this.normalizeEnv(params.env) : undefined;
    const tokens = await this.dbService.listDevicesByIdentity({
      identity: params.identity,
      tokenType,
      env,
    });
    const result = await this.pushService.sendPush({
      tokens,
      type: params.type,
      title: params.title,
      body: params.body,
      payload: params.payload,
    });
    for (const token of result.invalidTokens) {
      await this.dbService.invalidateToken(tokenType, token);
    }
    this.logger.log(
      `pushUser identity=${params.identity} type=${params.type} requested=${tokens.length} sent=${result.sent} failed=${result.failed} invalid=${result.invalidTokens.length}`,
    );
    return { ...result, requested: tokens.length };
  }

  async inviteCall(params: {
    callerIdentity: string;
    callerName?: string;
    calleeIdentity: string;
    roomName?: string;
  }) {
    const roomName = params.roomName?.trim() || `call-${randomUUID()}`;
    await this.dbService.createRoomIfMissing(roomName);

    const existing = await this.dbService.findRingingCall(
      params.calleeIdentity,
      roomName,
      30,
    );
    if (existing) {
      this.logger.log(
        `inviteCall deduped caller=${params.callerIdentity} callee=${params.calleeIdentity} room=${roomName} callId=${existing.call_id}`,
      );
      return { callId: existing.call_id, roomName, state: 'ringing', deduped: true };
    }

    const callerUser = await this.dbService.upsertUser(
      params.callerIdentity,
      params.callerName,
    );
    const calleeUser = await this.dbService.upsertUser(params.calleeIdentity);

    const call = await this.dbService.createCall({
      callerIdentity: params.callerIdentity,
      calleeIdentity: params.calleeIdentity,
      callerUserId: callerUser.id,
      calleeUserId: calleeUser.id,
      roomName,
    });

    const payload = {
      callId: call.call_id,
      roomName,
      callerName: params.callerName ?? params.callerIdentity,
      callerIdentity: params.callerIdentity,
    };

    const push = await this.sendUserPush({
      identity: params.calleeIdentity,
      type: 'voip',
      payload,
    });

    this.logger.log(
      `inviteCall sent caller=${params.callerIdentity} callee=${params.calleeIdentity} room=${roomName} callId=${call.call_id} pushSent=${push.sent} pushFailed=${push.failed}`,
    );
    return {
      callId: call.call_id,
      roomName,
      state: call.state,
      push,
    };
  }

  async answerCall(callId: string) {
    this.logger.log(`answerCall callId=${callId}`);
    return this.dbService.updateCallState(callId, 'answered');
  }

  async endCall(callId: string) {
    this.logger.log(`endCall callId=${callId}`);
    return this.dbService.updateCallState(callId, 'ended');
  }

  private summarizeToken(token?: string) {
    if (!token) return 'none';
    const suffix = token.slice(-6);
    return `len=${token.length}..${suffix}`;
  }
}
