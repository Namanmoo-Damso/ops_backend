import {
  Controller,
  Get,
  Param,
  Headers,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { RoomsService } from './rooms.service';
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

@Controller('v1/rooms')
export class RoomsController {
  private readonly logger = new Logger(RoomsController.name);

  constructor(private readonly roomsService: RoomsService) {}

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

  @Get(':roomName/members')
  async listMembers(
    @Headers('authorization') authorization: string | undefined,
    @Param('roomName') roomNameParam: string,
  ) {
    const config = getConfig();
    const auth = this.getAuthContext(authorization);
    if (config.authRequired && !auth) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    const roomName = roomNameParam?.trim();
    if (!roomName) {
      throw new HttpException('roomName is required', HttpStatus.BAD_REQUEST);
    }

    return this.roomsService.listMembers(roomName);
  }
}
