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
import { AppService } from '../app.service';
import { AiService } from '../ai.service';
import { NotificationScheduler } from '../notification.scheduler';

@Controller('v1/calls')
export class CallsController {
  private readonly logger = new Logger(CallsController.name);

  constructor(
    private readonly appService: AppService,
    private readonly aiService: AiService,
    private readonly notificationScheduler: NotificationScheduler,
  ) {}

  @Post('invite')
  async invite(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: {
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
      `invite caller=${callerIdentity} callee=${calleeIdentity} room=${body.roomName ?? 'auto'}`,
    );
    return await this.appService.inviteCall({
      callerIdentity,
      callerName: body.callerName?.trim(),
      calleeIdentity,
      roomName: body.roomName?.trim(),
    });
  }

  @Post('answer')
  async answer(
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

    this.logger.log(`answer callId=${callId}`);
    return await this.appService.answerCall(callId);
  }

  @Post('end')
  async end(
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

    this.logger.log(`end callId=${callId}`);
    const result = await this.appService.endCall(callId);

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
    const config = this.appService.getConfig();
    const auth = this.appService.getAuthContext(authorization);
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
