import {
  Controller,
  Get,
  Put,
  Body,
  Headers,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { WardsService } from './wards.service';
import { AuthService } from '../auth';

@Controller('v1/ward')
export class WardsController {
  private readonly logger = new Logger(WardsController.name);

  constructor(
    private readonly wardsService: WardsService,
    private readonly authService: AuthService,
  ) {}

  private verifyAuthHeader(authorization: string | undefined) {
    const authHeader = authorization ?? '';
    const token = authHeader.startsWith('Bearer ')
      ? authHeader.slice('Bearer '.length).trim()
      : undefined;

    if (!token) {
      throw new HttpException('Access token is required', HttpStatus.UNAUTHORIZED);
    }

    const payload = this.authService.verifyAccessToken(token);
    if (!payload) {
      throw new HttpException('Invalid or expired access token', HttpStatus.UNAUTHORIZED);
    }

    return payload;
  }

  @Get('settings')
  async getSettings(@Headers('authorization') authorization: string | undefined) {
    const payload = this.verifyAuthHeader(authorization);

    try {
      return await this.wardsService.getSettings(payload.sub);
    } catch (error) {
      if ((error as HttpException).getStatus?.()) {
        throw error;
      }
      this.logger.warn(`getSettings failed error=${(error as Error).message}`);
      throw new HttpException('Failed to get ward settings', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Put('settings')
  async updateSettings(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: {
      aiPersona?: string;
      weeklyCallCount?: number;
      callDurationMinutes?: number;
    },
  ) {
    const payload = this.verifyAuthHeader(authorization);

    try {
      return await this.wardsService.updateSettings(payload.sub, {
        aiPersona: body.aiPersona,
        weeklyCallCount: body.weeklyCallCount,
        callDurationMinutes: body.callDurationMinutes,
      });
    } catch (error) {
      if ((error as HttpException).getStatus?.()) {
        throw error;
      }
      this.logger.warn(`updateSettings failed error=${(error as Error).message}`);
      throw new HttpException('Failed to update ward settings', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
