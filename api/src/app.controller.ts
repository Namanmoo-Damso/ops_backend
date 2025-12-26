import {
  Body,
  Controller,
  Get,
  Headers,
  HttpException,
  HttpStatus,
  Logger,
  Param,
  Post,
} from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  private readonly logger = new Logger(AppController.name);

  constructor(private readonly appService: AppService) {}

  @Get('/healthz')
  getHealth() {
    return { status: 'ok', ts: new Date().toISOString() };
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
      apnsToken?: string;
      voipToken?: string;
      platform?: string;
      env?: 'prod' | 'sandbox';
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

    this.logger.log(
      `rtcToken room=${roomName} identity=${identity} role=${role} env=${body.env ?? 'default'} apns=${this.summarizeToken(body.apnsToken)} voip=${this.summarizeToken(body.voipToken)}`,
    );

    return await this.appService.issueRtcToken({
      roomName,
      identity,
      name,
      role,
      device:
        body.apnsToken || body.voipToken || body.platform || body.env
          ? {
              apnsToken: body.apnsToken?.trim(),
              voipToken: body.voipToken?.trim(),
              platform: body.platform?.trim(),
              env: body.env,
            }
          : undefined,
    });
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

    if (env && !['prod', 'sandbox'].includes(env)) {
      throw new HttpException('invalid env', HttpStatus.BAD_REQUEST);
    }

    try {
      this.logger.log(
        `registerDevice identity=${identity} platform=${platform} env=${env ?? 'default'} apns=${this.summarizeToken(body.apnsToken)} voip=${this.summarizeToken(body.voipToken)}`,
      );
      return await this.appService.registerDevice({
        identity,
        displayName,
        platform,
        env,
        apnsToken: body.apnsToken,
        voipToken: body.voipToken,
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

  private summarizePayloadKeys(payload?: Record<string, unknown>) {
    if (!payload) return 'none';
    const keys = Object.keys(payload);
    if (keys.length === 0) return 'none';
    return keys.join(',');
  }
}
