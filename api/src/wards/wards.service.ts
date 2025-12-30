import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { DbService } from '../db.service';

@Injectable()
export class WardsService {
  private readonly logger = new Logger(WardsService.name);

  constructor(private readonly dbService: DbService) {}

  async verifyWardAccess(userId: string) {
    const user = await this.dbService.findUserById(userId);
    if (!user || user.user_type !== 'ward') {
      throw new HttpException('Ward access required', HttpStatus.FORBIDDEN);
    }

    const ward = await this.dbService.findWardByUserId(user.id);
    if (!ward) {
      throw new HttpException('Ward info not found', HttpStatus.NOT_FOUND);
    }

    return { user, ward };
  }

  async getSettings(userId: string) {
    const { user, ward } = await this.verifyWardAccess(userId);
    this.logger.log(`getSettings userId=${user.id} wardId=${ward.id}`);

    const notificationSettings = await this.dbService.getNotificationSettings(user.id);

    return {
      aiPersona: ward.ai_persona,
      weeklyCallCount: ward.weekly_call_count,
      callDurationMinutes: ward.call_duration_minutes,
      notificationSettings: {
        callReminder: notificationSettings.call_reminder,
        callComplete: notificationSettings.call_complete,
        healthAlert: notificationSettings.health_alert,
      },
    };
  }

  async updateSettings(
    userId: string,
    settings: {
      aiPersona?: string;
      weeklyCallCount?: number;
      callDurationMinutes?: number;
    },
  ) {
    const { user, ward } = await this.verifyWardAccess(userId);

    if (settings.weeklyCallCount !== undefined && (settings.weeklyCallCount < 1 || settings.weeklyCallCount > 7)) {
      throw new HttpException('weeklyCallCount must be between 1 and 7', HttpStatus.BAD_REQUEST);
    }
    if (settings.callDurationMinutes !== undefined && (settings.callDurationMinutes < 5 || settings.callDurationMinutes > 60)) {
      throw new HttpException('callDurationMinutes must be between 5 and 60', HttpStatus.BAD_REQUEST);
    }

    this.logger.log(`updateSettings userId=${user.id} wardId=${ward.id}`);

    const updated = await this.dbService.updateWardSettings({
      wardId: user.id,
      aiPersona: settings.aiPersona?.trim(),
      weeklyCallCount: settings.weeklyCallCount,
      callDurationMinutes: settings.callDurationMinutes,
    });

    if (!updated) {
      throw new HttpException('Failed to update settings', HttpStatus.INTERNAL_SERVER_ERROR);
    }

    return {
      aiPersona: updated.ai_persona,
      weeklyCallCount: updated.weekly_call_count,
      callDurationMinutes: updated.call_duration_minutes,
    };
  }
}
