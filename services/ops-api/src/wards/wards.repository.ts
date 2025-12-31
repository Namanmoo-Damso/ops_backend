/**
 * Wards Repository
 * wards, ward_locations, ward_current_locations, notification_settings 테이블 관련 메서드
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma';
import { Prisma } from '../generated/prisma';
import { WardRow } from '../database/types';
import { toWardRow } from '../database/prisma-mappers';

@Injectable()
export class WardsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByUserId(userId: string): Promise<WardRow | undefined> {
    const ward = await this.prisma.ward.findUnique({
      where: { userId },
    });
    return ward ? toWardRow(ward) : undefined;
  }

  async findById(wardId: string): Promise<WardRow | undefined> {
    const ward = await this.prisma.ward.findUnique({
      where: { id: wardId },
    });
    return ward ? toWardRow(ward) : undefined;
  }

  async updateSettings(params: {
    wardId: string;
    aiPersona?: string;
    weeklyCallCount?: number;
    callDurationMinutes?: number;
  }): Promise<WardRow | undefined> {
    try {
      const updateData: {
        aiPersona?: string;
        weeklyCallCount?: number;
        callDurationMinutes?: number;
      } = {};

      if (params.aiPersona !== undefined) updateData.aiPersona = params.aiPersona;
      if (params.weeklyCallCount !== undefined) updateData.weeklyCallCount = params.weeklyCallCount;
      if (params.callDurationMinutes !== undefined) updateData.callDurationMinutes = params.callDurationMinutes;

      if (Object.keys(updateData).length === 0) return undefined;

      // Note: params.wardId is actually userId based on original SQL
      const ward = await this.prisma.ward.update({
        where: { userId: params.wardId },
        data: updateData,
      });
      return toWardRow(ward);
    } catch {
      return undefined;
    }
  }

  // Location methods
  async upsertCurrentLocation(params: {
    wardId: string;
    latitude: number;
    longitude: number;
    accuracy: number | null;
  }) {
    const location = await this.prisma.wardCurrentLocation.upsert({
      where: { wardId: params.wardId },
      update: {
        latitude: new Prisma.Decimal(params.latitude),
        longitude: new Prisma.Decimal(params.longitude),
        accuracy: params.accuracy ? new Prisma.Decimal(params.accuracy) : null,
        lastUpdated: new Date(),
      },
      create: {
        wardId: params.wardId,
        latitude: new Prisma.Decimal(params.latitude),
        longitude: new Prisma.Decimal(params.longitude),
        accuracy: params.accuracy ? new Prisma.Decimal(params.accuracy) : null,
        status: 'normal',
        lastUpdated: new Date(),
      },
    });
    return {
      ward_id: location.wardId,
      latitude: location.latitude.toString(),
      longitude: location.longitude.toString(),
      accuracy: location.accuracy?.toString() ?? null,
      status: location.status,
      last_updated: location.lastUpdated.toISOString(),
    };
  }

  async createLocationRecord(params: {
    wardId: string;
    latitude: number;
    longitude: number;
    accuracy: number | null;
    recordedAt: Date;
  }) {
    const location = await this.prisma.wardLocation.create({
      data: {
        wardId: params.wardId,
        latitude: new Prisma.Decimal(params.latitude),
        longitude: new Prisma.Decimal(params.longitude),
        accuracy: params.accuracy ? new Prisma.Decimal(params.accuracy) : null,
        recordedAt: params.recordedAt,
      },
    });
    return {
      id: location.id,
      ward_id: location.wardId,
      latitude: location.latitude.toString(),
      longitude: location.longitude.toString(),
      accuracy: location.accuracy?.toString() ?? null,
      recorded_at: location.recordedAt.toISOString(),
      created_at: location.createdAt.toISOString(),
    };
  }

  async updateLocationStatus(wardId: string, status: 'normal' | 'warning' | 'emergency'): Promise<void> {
    await this.prisma.wardCurrentLocation.update({
      where: { wardId },
      data: { status, lastUpdated: new Date() },
    });
  }

  // Notification Settings methods
  async getNotificationSettings(userId: string) {
    const settings = await this.prisma.notificationSettings.findUnique({
      where: { userId },
    });
    if (settings) {
      return {
        call_reminder: settings.callReminder,
        call_complete: settings.callComplete,
        health_alert: settings.healthAlert,
      };
    }
    // Return defaults if no settings found
    return {
      call_reminder: true,
      call_complete: true,
      health_alert: true,
    };
  }
}
