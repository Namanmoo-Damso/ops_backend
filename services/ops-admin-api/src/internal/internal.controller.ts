import {
  Controller,
  Get,
  Param,
  UseGuards,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { InternalAuthGuard } from './internal-auth.guard';
import { UsersService } from '../users';
import { WardsService } from '../wards';
import { DevicesService } from '../devices';

/**
 * Internal API Controller
 * 서버 간 동기 통신용 엔드포인트
 * 모든 엔드포인트는 InternalAuthGuard로 보호됨
 */
@Controller('internal')
@UseGuards(InternalAuthGuard)
export class InternalController {
  private readonly logger = new Logger(InternalController.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly wardsService: WardsService,
    private readonly devicesService: DevicesService,
  ) {}

  @Get('users/:id')
  async getUser(@Param('id') id: string) {
    this.logger.debug(`getUser id=${id}`);

    const user = await this.usersService.findById(id);
    if (!user) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }

    return {
      id: user.id,
      identity: user.identity,
      displayName: user.display_name,
      userType: user.user_type,
      email: user.email,
      nickname: user.nickname,
      createdAt: user.created_at,
    };
  }

  @Get('users/identity/:identity')
  async getUserByIdentity(@Param('identity') identity: string) {
    this.logger.debug(`getUserByIdentity identity=${identity}`);

    const user = await this.usersService.findByIdentity(identity);
    if (!user) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }

    return {
      id: user.id,
      identity: user.identity,
      displayName: user.display_name,
      userType: user.user_type,
      email: user.email,
      nickname: user.nickname,
      createdAt: user.created_at,
    };
  }

  @Get('wards/:id')
  async getWard(@Param('id') id: string) {
    this.logger.debug(`getWard id=${id}`);

    const ward = await this.wardsService.findById(id);
    if (!ward) {
      throw new HttpException('Ward not found', HttpStatus.NOT_FOUND);
    }

    return {
      id: ward.id,
      userId: ward.user_id,
      phoneNumber: ward.phone_number,
      guardianId: ward.guardian_id,
      organizationId: ward.organization_id,
      aiPersona: ward.ai_persona,
      createdAt: ward.created_at,
    };
  }

  @Get('devices/user/:userId')
  async getDevicesByUser(@Param('userId') userId: string) {
    this.logger.debug(`getDevicesByUser userId=${userId}`);

    const devices = await this.devicesService.findByUserId(userId);

    return {
      devices: devices.map((d) => ({
        id: d.id,
        platform: d.platform,
        hasApnsToken: !!d.apns_token,
        hasVoipToken: !!d.voip_token,
        supportsCallKit: d.supports_callkit,
        env: d.env,
        lastSeen: d.last_seen,
      })),
    };
  }
}
