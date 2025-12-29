import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpException,
  HttpStatus,
  Logger,
  Param,
  Post,
} from '@nestjs/common';
import { AppService } from './app.service';
import { AuthService } from './auth.service';
import { DbService } from './db.service';

@Controller()
export class AppController {
  private readonly logger = new Logger(AppController.name);

  constructor(
    private readonly appService: AppService,
    private readonly authService: AuthService,
    private readonly dbService: DbService,
  ) {}

  @Get('/healthz')
  getHealth() {
    return { status: 'ok', ts: new Date().toISOString() };
  }

  @Post('/v1/auth/kakao')
  async authKakao(
    @Body()
    body: {
      kakaoAccessToken?: string;
      userType?: 'guardian' | 'ward';
    },
  ) {
    const kakaoAccessToken = body.kakaoAccessToken?.trim();
    if (!kakaoAccessToken) {
      throw new HttpException(
        'kakaoAccessToken is required',
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      this.logger.log(`authKakao userType=${body.userType ?? 'none'}`);
      const result = await this.authService.kakaoLogin({
        kakaoAccessToken,
        userType: body.userType,
      });
      return result;
    } catch (error) {
      if ((error as HttpException).getStatus?.() === HttpStatus.UNAUTHORIZED) {
        throw error;
      }
      this.logger.warn(`authKakao failed error=${(error as Error).message}`);
      throw new HttpException(
        (error as Error).message || 'Authentication failed',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Post('/v1/auth/refresh')
  async authRefresh(@Body() body: { refreshToken?: string }) {
    const refreshToken = body.refreshToken?.trim();
    if (!refreshToken) {
      throw new HttpException('refreshToken is required', HttpStatus.BAD_REQUEST);
    }

    try {
      this.logger.log('authRefresh');
      const tokens = await this.authService.refreshTokens(refreshToken);
      return tokens;
    } catch (error) {
      if ((error as HttpException).getStatus?.() === HttpStatus.UNAUTHORIZED) {
        throw error;
      }
      this.logger.warn(`authRefresh failed error=${(error as Error).message}`);
      throw new HttpException(
        (error as Error).message || 'Token refresh failed',
        HttpStatus.UNAUTHORIZED,
      );
    }
  }

  @Post('/v1/users/register/guardian')
  async registerGuardian(
    @Headers('authorization') authorization: string | undefined,
    @Body()
    body: {
      wardEmail?: string;
      wardPhoneNumber?: string;
    },
  ) {
    // Authorization header에서 temp token 추출
    const authHeader = authorization ?? '';
    const tempToken = authHeader.startsWith('Bearer ')
      ? authHeader.slice('Bearer '.length).trim()
      : undefined;

    if (!tempToken) {
      throw new HttpException('Temp token is required', HttpStatus.UNAUTHORIZED);
    }

    const wardEmail = body.wardEmail?.trim();
    const wardPhoneNumber = body.wardPhoneNumber?.trim();

    if (!wardEmail) {
      throw new HttpException('wardEmail is required', HttpStatus.BAD_REQUEST);
    }
    if (!wardPhoneNumber) {
      throw new HttpException('wardPhoneNumber is required', HttpStatus.BAD_REQUEST);
    }

    // 간단한 이메일 형식 검증
    if (!wardEmail.includes('@')) {
      throw new HttpException('Invalid email format', HttpStatus.BAD_REQUEST);
    }

    // 간단한 전화번호 형식 검증 (숫자와 하이픈만 허용)
    if (!/^[\d-]+$/.test(wardPhoneNumber)) {
      throw new HttpException('Invalid phone number format', HttpStatus.BAD_REQUEST);
    }

    try {
      this.logger.log(`registerGuardian wardEmail=${wardEmail}`);
      const result = await this.authService.registerGuardian({
        tempToken,
        wardEmail,
        wardPhoneNumber,
      });
      return result;
    } catch (error) {
      if ((error as HttpException).getStatus?.() === HttpStatus.UNAUTHORIZED) {
        throw error;
      }
      this.logger.warn(`registerGuardian failed error=${(error as Error).message}`);
      throw new HttpException(
        (error as Error).message || 'Registration failed',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Get('/v1/users/me')
  async getMe(@Headers('authorization') authorization: string | undefined) {
    // Access token 검증
    const payload = this.verifyAuthHeader(authorization);

    try {
      const user = await this.dbService.findUserById(payload.sub);
      if (!user) {
        throw new HttpException('User not found', HttpStatus.NOT_FOUND);
      }

      this.logger.log(`getMe userId=${user.id}`);

      const baseResponse = {
        id: user.id,
        email: user.email,
        nickname: user.nickname,
        profileImageUrl: user.profile_image_url,
        userType: user.user_type,
        createdAt: user.created_at,
      };

      if (user.user_type === 'guardian') {
        const guardian = await this.dbService.findGuardianByUserId(user.id);
        const linkedWard = guardian
          ? await this.dbService.findWardByGuardianId(guardian.id)
          : undefined;

        return {
          ...baseResponse,
          guardianInfo: guardian
            ? {
                id: guardian.id,
                wardEmail: guardian.ward_email,
                wardPhoneNumber: guardian.ward_phone_number,
                linkedWard: linkedWard
                  ? {
                      id: linkedWard.user_id,
                      nickname: linkedWard.user_nickname,
                      profileImageUrl: linkedWard.user_profile_image_url,
                    }
                  : null,
              }
            : null,
        };
      } else if (user.user_type === 'ward') {
        const ward = await this.dbService.findWardByUserId(user.id);
        const linkedGuardian = ward?.guardian_id
          ? await this.dbService.findGuardianById(ward.guardian_id)
          : undefined;

        return {
          ...baseResponse,
          wardInfo: ward
            ? {
                id: ward.id,
                phoneNumber: ward.phone_number,
                aiPersona: ward.ai_persona,
                weeklyCallCount: ward.weekly_call_count,
                callDurationMinutes: ward.call_duration_minutes,
                linkedGuardian: linkedGuardian
                  ? {
                      id: linkedGuardian.user_id,
                      nickname: linkedGuardian.user_nickname,
                      profileImageUrl: linkedGuardian.user_profile_image_url,
                    }
                  : null,
                linkedOrganization: null,
              }
            : null,
        };
      }

      return baseResponse;
    } catch (error) {
      if ((error as HttpException).getStatus?.()) {
        throw error;
      }
      this.logger.warn(`getMe failed error=${(error as Error).message}`);
      throw new HttpException('Failed to get user info', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Delete('/v1/users/me')
  async deleteMe(@Headers('authorization') authorization: string | undefined) {
    // Access token 검증
    const payload = this.verifyAuthHeader(authorization);

    try {
      const user = await this.dbService.findUserById(payload.sub);
      if (!user) {
        throw new HttpException('User not found', HttpStatus.NOT_FOUND);
      }

      this.logger.log(`deleteMe userId=${user.id}`);
      await this.dbService.deleteUser(user.id);

      return {
        success: true,
        message: '회원탈퇴가 완료되었습니다.',
      };
    } catch (error) {
      if ((error as HttpException).getStatus?.()) {
        throw error;
      }
      this.logger.warn(`deleteMe failed error=${(error as Error).message}`);
      throw new HttpException('Failed to delete user', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  private verifyAuthHeader(authorization: string | undefined) {
    const authHeader = authorization ?? '';
    const token = authHeader.startsWith('Bearer ')
      ? authHeader.slice('Bearer '.length).trim()
      : undefined;

    if (!token) {
      throw new HttpException('Authorization required', HttpStatus.UNAUTHORIZED);
    }

    const payload = this.authService.verifyAccessToken(token);
    if (!payload) {
      throw new HttpException('Invalid or expired token', HttpStatus.UNAUTHORIZED);
    }

    return payload;
  }

  @Get('/v1/rooms/:roomName/members')
  async listRoomMembers(
    @Headers('authorization') authorization: string | undefined,
    @Param('roomName') roomNameParam: string,
  ) {
    const config = this.appService.getConfig();
    const auth = this.appService.getAuthContext(authorization);
    if (config.authRequired && !auth) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    const roomName = roomNameParam?.trim();
    if (!roomName) {
      throw new HttpException('roomName is required', HttpStatus.BAD_REQUEST);
    }

    const members = await this.appService.listRoomMembers(roomName);
    this.logger.log(`listRoomMembers room=${roomName} count=${members.length}`);
    return { roomName, members };
  }

  @Post('/v1/auth/anonymous')
  authAnonymous(@Body() body: { identity?: string; displayName?: string }) {
    const identity = body.identity?.trim() || `user-${Date.now()}`;
    const displayName = body.displayName?.trim() || identity;
    return this.appService.issueApiToken(identity, displayName);
  }

  @Post('/v1/rtc/token')
  async rtcToken(
    @Headers('authorization') authorization: string | undefined,
    @Body()
    body: {
      roomName?: string;
      identity?: string;
      name?: string;
      role?: 'host' | 'viewer' | 'observer';
      livekitUrl?: string;
      apnsToken?: string;
      voipToken?: string;
      platform?: string;
      env?: 'prod' | 'sandbox';
      supportsCallKit?: boolean;
    },
  ) {
    const config = this.appService.getConfig();
    const authHeader = authorization ?? '';
    const bearer = authHeader.startsWith('Bearer ')
      ? authHeader.slice('Bearer '.length)
      : undefined;

    let authIdentity: string | undefined;
    let authName: string | undefined;
    if (bearer) {
      try {
        const payload = this.appService.verifyApiToken(bearer);
        authIdentity = payload.identity;
        authName = payload.displayName;
      } catch (error) {
        if (config.authRequired) {
          throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
        }
      }
    } else if (config.authRequired) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    const roomName = body.roomName?.trim();
    if (!roomName) {
      throw new HttpException('roomName is required', HttpStatus.BAD_REQUEST);
    }

    const identity = (body.identity ?? authIdentity)?.trim();
    if (!identity) {
      throw new HttpException('identity is required', HttpStatus.BAD_REQUEST);
    }

    const name = (body.name ?? authName ?? identity).trim();
    const role = body.role ?? 'viewer';

    if (!['host', 'viewer', 'observer'].includes(role)) {
      throw new HttpException('invalid role', HttpStatus.BAD_REQUEST);
    }

    const livekitUrlOverride = this.normalizeLivekitUrl(body.livekitUrl);
    if (body.livekitUrl && !livekitUrlOverride) {
      throw new HttpException('invalid livekitUrl', HttpStatus.BAD_REQUEST);
    }

    this.logger.log(
      `rtcToken room=${roomName} identity=${identity} role=${role} env=${body.env ?? 'default'} livekit=${livekitUrlOverride ?? 'default'} apns=${this.summarizeToken(body.apnsToken)} voip=${this.summarizeToken(body.voipToken)}`,
    );

    const rtcData = await this.appService.issueRtcToken({
      roomName,
      identity,
      name,
      role,
      device:
        body.apnsToken || body.voipToken || body.platform || body.env || body.supportsCallKit !== undefined
          ? {
              apnsToken: body.apnsToken?.trim(),
              voipToken: body.voipToken?.trim(),
              platform: body.platform?.trim(),
              env: body.env,
              supportsCallKit: body.supportsCallKit,
            }
          : undefined,
    });
    return {
      ...rtcData,
      livekitUrl: livekitUrlOverride ?? rtcData.livekitUrl,
    };
  }

  @Post('/v1/devices/register')
  async registerDevice(
    @Headers('authorization') authorization: string | undefined,
    @Body()
    body: {
      identity?: string;
      displayName?: string;
      platform?: string;
      env?: 'prod' | 'sandbox';
      apnsToken?: string;
      voipToken?: string;
      supportsCallKit?: boolean;
    },
  ) {
    const config = this.appService.getConfig();
    const auth = this.appService.getAuthContext(authorization);
    if (config.authRequired && !auth) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    const identity = body.identity?.trim() || auth?.identity;
    if (!identity) {
      throw new HttpException('identity is required', HttpStatus.BAD_REQUEST);
    }

    const displayName = body.displayName?.trim() || auth?.displayName;
    const platform = body.platform?.trim() || 'ios';
    const env = body.env;
    const supportsCallKit = body.supportsCallKit ?? true;

    if (env && !['prod', 'sandbox'].includes(env)) {
      throw new HttpException('invalid env', HttpStatus.BAD_REQUEST);
    }

    try {
      this.logger.log(
        `registerDevice identity=${identity} platform=${platform} env=${env ?? 'default'} supportsCallKit=${supportsCallKit} apns=${this.summarizeToken(body.apnsToken)} voip=${this.summarizeToken(body.voipToken)}`,
      );
      return await this.appService.registerDevice({
        identity,
        displayName,
        platform,
        env,
        apnsToken: body.apnsToken,
        voipToken: body.voipToken,
        supportsCallKit,
      });
    } catch (error) {
      this.logger.warn(
        `registerDevice failed identity=${identity} error=${(error as Error).message}`,
      );
      throw new HttpException(
        (error as Error).message || 'Bad request',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Post('/v1/push/broadcast')
  async pushBroadcast(
    @Headers('authorization') authorization: string | undefined,
    @Body()
    body: {
      type?: 'alert' | 'voip';
      title?: string;
      body?: string;
      payload?: Record<string, unknown>;
      env?: 'prod' | 'sandbox';
    },
  ) {
    const config = this.appService.getConfig();
    const auth = this.appService.getAuthContext(authorization);
    if (config.authRequired && !auth) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    const type = body.type ?? 'alert';
    if (!['alert', 'voip'].includes(type)) {
      throw new HttpException('invalid type', HttpStatus.BAD_REQUEST);
    }

    this.logger.log(
      `pushBroadcast type=${type} env=${body.env ?? 'default'} payloadKeys=${this.summarizePayloadKeys(body.payload)}`,
    );
    return await this.appService.sendBroadcastPush({
      type,
      title: body.title,
      body: body.body,
      payload: body.payload,
      env: body.env,
    });
  }

  @Post('/v1/push/user')
  async pushUser(
    @Headers('authorization') authorization: string | undefined,
    @Body()
    body: {
      identity?: string;
      type?: 'alert' | 'voip';
      title?: string;
      body?: string;
      payload?: Record<string, unknown>;
      env?: 'prod' | 'sandbox';
    },
  ) {
    const config = this.appService.getConfig();
    const auth = this.appService.getAuthContext(authorization);
    if (config.authRequired && !auth) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    const identity = body.identity?.trim() || auth?.identity;
    if (!identity) {
      throw new HttpException('identity is required', HttpStatus.BAD_REQUEST);
    }

    const type = body.type ?? 'alert';
    if (!['alert', 'voip'].includes(type)) {
      throw new HttpException('invalid type', HttpStatus.BAD_REQUEST);
    }

    this.logger.log(
      `pushUser identity=${identity} type=${type} env=${body.env ?? 'default'} payloadKeys=${this.summarizePayloadKeys(body.payload)}`,
    );
    return await this.appService.sendUserPush({
      identity,
      type,
      title: body.title,
      body: body.body,
      payload: body.payload,
      env: body.env,
    });
  }

  @Post('/v1/calls/invite')
  async inviteCall(
    @Headers('authorization') authorization: string | undefined,
    @Body()
    body: {
      callerIdentity?: string;
      callerName?: string;
      calleeIdentity?: string;
      roomName?: string;
    },
  ) {
    const config = this.appService.getConfig();
    const auth = this.appService.getAuthContext(authorization);
    if (config.authRequired && !auth) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    const callerIdentity = body.callerIdentity?.trim() || auth?.identity;
    if (!callerIdentity) {
      throw new HttpException('callerIdentity is required', HttpStatus.BAD_REQUEST);
    }
    const calleeIdentity = body.calleeIdentity?.trim();
    if (!calleeIdentity) {
      throw new HttpException('calleeIdentity is required', HttpStatus.BAD_REQUEST);
    }

    this.logger.log(
      `inviteCall caller=${callerIdentity} callee=${calleeIdentity} room=${body.roomName ?? 'auto'}`,
    );
    return await this.appService.inviteCall({
      callerIdentity,
      callerName: body.callerName?.trim(),
      calleeIdentity,
      roomName: body.roomName?.trim(),
    });
  }

  @Post('/v1/calls/answer')
  async answerCall(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: { callId?: string },
  ) {
    const config = this.appService.getConfig();
    const auth = this.appService.getAuthContext(authorization);
    if (config.authRequired && !auth) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    const callId = body.callId?.trim();
    if (!callId) {
      throw new HttpException('callId is required', HttpStatus.BAD_REQUEST);
    }

    this.logger.log(`answerCall callId=${callId}`);
    return await this.appService.answerCall(callId);
  }

  @Post('/v1/calls/end')
  async endCall(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: { callId?: string },
  ) {
    const config = this.appService.getConfig();
    const auth = this.appService.getAuthContext(authorization);
    if (config.authRequired && !auth) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    const callId = body.callId?.trim();
    if (!callId) {
      throw new HttpException('callId is required', HttpStatus.BAD_REQUEST);
    }

    this.logger.log(`endCall callId=${callId}`);
    return await this.appService.endCall(callId);
  }

  private summarizeToken(token?: string) {
    if (!token) return 'none';
    const suffix = token.slice(-6);
    return `len=${token.length}..${suffix}`;
  }

  private normalizeLivekitUrl(value?: string) {
    if (!value) return undefined;
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    try {
      const url = new URL(trimmed);
      if (url.protocol !== 'wss:' && url.protocol !== 'ws:') {
        return undefined;
      }
      return trimmed;
    } catch {
      return undefined;
    }
  }

  private summarizePayloadKeys(payload?: Record<string, unknown>) {
    if (!payload) return 'none';
    const keys = Object.keys(payload);
    if (keys.length === 0) return 'none';
    return keys.join(',');
  }
}
