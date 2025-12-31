import {
  Controller,
  Post,
  Body,
  Param,
  Headers,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { CallsService } from './calls.service';
import { AiService } from '../ai';
import { NotificationScheduler } from '../scheduler';
import { InviteCallDto, AnswerCallDto, EndCallDto } from './dto';
import jwt from 'jsonwebtoken';

type AuthContext = {
  identity?: string;
  displayName?: string;
  userId?: string;
  sub?: string;
};

const getConfig = () => ({
  apiJwtSecret: process.env.API_JWT_SECRET || 'change-me',
  authRequired: process.env.API_AUTH_REQUIRED === 'true',
});

@Controller('v1/calls')
export class CallsController {
  private readonly logger = new Logger(CallsController.name);

  constructor(
    private readonly callsService: CallsService,
    private readonly aiService: AiService,
    private readonly notificationScheduler: NotificationScheduler,
  ) {}

  private getAuthContext(authorization?: string): AuthContext | null {
    if (!authorization) return null;
    const token = authorization.startsWith('Bearer ')
      ? authorization.slice('Bearer '.length)
      : '';
    if (!token) return null;
    try {
      const config = getConfig();
      const payload = jwt.verify(token, config.apiJwtSecret) as AuthContext;
      if (!payload.userId && payload.sub) {
        payload.userId = payload.sub;
      }
      return payload;
    } catch {
      return null;
    }
  }

  @Post('invite')
  async invite(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: InviteCallDto,
  ) {
    const config = getConfig();
    const auth = this.getAuthContext(authorization);
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
      `invite caller=${callerIdentity} callee=${calleeIdentity} room=${body.roomName ?? 'auto'}`,
    );
    return await this.callsService.invite({
      callerIdentity,
      callerName: body.callerName?.trim(),
      calleeIdentity,
      roomName: body.roomName?.trim(),
    });
  }

  @Post('answer')
  async answer(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: AnswerCallDto,
  ) {
    const config = getConfig();
    const auth = this.getAuthContext(authorization);
    if (config.authRequired && !auth) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    const callId = body.callId?.trim();
    if (!callId) {
      throw new HttpException('callId is required', HttpStatus.BAD_REQUEST);
    }

    this.logger.log(`answer callId=${callId}`);
    return await this.callsService.answer(callId);
  }

  @Post('end')
  async end(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: EndCallDto,
  ) {
    const config = getConfig();
    const auth = this.getAuthContext(authorization);
    if (config.authRequired && !auth) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    const callId = body.callId?.trim();
    if (!callId) {
      throw new HttpException('callId is required', HttpStatus.BAD_REQUEST);
    }

    this.logger.log(`end callId=${callId}`);
    const result = await this.callsService.end(callId);

    // 비동기로 보호자에게 통화 완료 알림 전송
    this.notificationScheduler.notifyCallComplete(callId).catch((error) => {
      this.logger.warn(`end notifyCallComplete failed callId=${callId} error=${(error as Error).message}`);
    });

    return result;
  }

  @Post(':callId/analyze')
  async analyze(
    @Headers('authorization') authorization: string | undefined,
    @Param('callId') callId: string,
  ) {
    const config = getConfig();
    const auth = this.getAuthContext(authorization);
    if (config.authRequired && !auth) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    if (!callId?.trim()) {
      throw new HttpException('callId is required', HttpStatus.BAD_REQUEST);
    }

    this.logger.log(`analyze callId=${callId}`);

    try {
      const result = await this.aiService.analyzeCall(callId);
      return result;
    } catch (error) {
      const message = (error as Error).message;
      if (message.includes('not found')) {
        throw new HttpException('Call not found', HttpStatus.NOT_FOUND);
      }
      this.logger.error(`analyze failed callId=${callId} error=${message}`);
      throw new HttpException('Failed to analyze call', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
