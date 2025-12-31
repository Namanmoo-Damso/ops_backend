/**
 * Guardians Repository
 * guardians, guardian_ward_registrations, health_alerts, notification_settings,
 * ward statistics 관련 메서드
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma';
import { Prisma } from '../generated/prisma';
import { GuardianRow, GuardianWardRegistrationRow } from '../database/types';
import { toGuardianRow, toGuardianWardRegistrationRow, toUserRow } from '../database/prisma-mappers';

@Injectable()
export class GuardiansRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findUserById(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    return user ? toUserRow(user) : undefined;
  }

  async findByUserId(userId: string): Promise<GuardianRow | undefined> {
    const guardian = await this.prisma.guardian.findUnique({
      where: { userId },
    });
    return guardian ? toGuardianRow(guardian) : undefined;
  }

  async findWardByGuardianId(guardianId: string) {
    const ward = await this.prisma.ward.findFirst({
      where: { guardianId },
      include: {
        user: {
          select: {
            nickname: true,
            profileImageUrl: true,
          },
        },
      },
    });

    if (!ward) return undefined;

    return {
      id: ward.id,
      user_id: ward.userId,
      phone_number: ward.phoneNumber,
      guardian_id: ward.guardianId,
      organization_id: ward.organizationId,
      ai_persona: ward.aiPersona,
      weekly_call_count: ward.weeklyCallCount,
      call_duration_minutes: ward.callDurationMinutes,
      created_at: ward.createdAt.toISOString(),
      updated_at: ward.updatedAt.toISOString(),
      user_nickname: ward.user.nickname,
      user_profile_image_url: ward.user.profileImageUrl,
    };
  }

  // Ward statistics methods
  async getWardCallStats(wardId: string) {
    const ward = await this.prisma.ward.findUnique({
      where: { id: wardId },
      select: { userId: true },
    });
    if (!ward) return { totalCalls: 0, avgDuration: 0 };

    const calls = await this.prisma.call.findMany({
      where: {
        calleeUserId: ward.userId,
        state: 'ended',
        answeredAt: { not: null },
      },
      select: {
        answeredAt: true,
        endedAt: true,
      },
    });

    const totalCalls = calls.length;
    let totalDuration = 0;
    for (const call of calls) {
      if (call.answeredAt && call.endedAt) {
        totalDuration += (call.endedAt.getTime() - call.answeredAt.getTime()) / 60000;
      }
    }
    const avgDuration = totalCalls > 0 ? Math.round(totalDuration / totalCalls) : 0;

    return { totalCalls, avgDuration };
  }

  async getWardWeeklyCallChange(wardId: string): Promise<number> {
    const ward = await this.prisma.ward.findUnique({
      where: { id: wardId },
      select: { userId: true },
    });
    if (!ward) return 0;

    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    const thisWeek = await this.prisma.call.count({
      where: {
        calleeUserId: ward.userId,
        state: 'ended',
        createdAt: { gte: oneWeekAgo },
      },
    });

    const lastWeek = await this.prisma.call.count({
      where: {
        calleeUserId: ward.userId,
        state: 'ended',
        createdAt: { gte: twoWeeksAgo, lt: oneWeekAgo },
      },
    });

    return thisWeek - lastWeek;
  }

  async getWardMoodStats(wardId: string) {
    const summaries = await this.prisma.callSummary.groupBy({
      by: ['mood'],
      where: { wardId, mood: { not: null } },
      _count: true,
    });

    let positive = 0;
    let negative = 0;
    let neutral = 0;

    for (const s of summaries) {
      if (s.mood === 'positive') positive = s._count;
      else if (s.mood === 'negative') negative = s._count;
      else neutral = s._count;
    }

    const total = positive + negative + neutral;
    if (total === 0) return { positive: 0, negative: 0 };

    return {
      positive: Math.round((positive / total) * 100),
      negative: Math.round((negative / total) * 100),
    };
  }

  async getHealthAlerts(guardianId: string, limit: number = 5) {
    const alerts = await this.prisma.healthAlert.findMany({
      where: { guardianId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return alerts.map((alert) => ({
      id: alert.id,
      type: alert.alertType,
      message: alert.message,
      date: alert.createdAt.toISOString().split('T')[0],
      isRead: alert.isRead,
    }));
  }

  async getRecentCallSummaries(wardId: string, limit: number = 5) {
    const summaries = await this.prisma.callSummary.findMany({
      where: { wardId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        summary: true,
        mood: true,
        moodScore: true,
        createdAt: true,
      },
    });
    return summaries.map((s) => ({
      id: s.id,
      date: s.createdAt.toISOString().split('T')[0],
      summary: s.summary,
      mood: s.mood,
      moodScore: s.moodScore ? Number(s.moodScore) : null,
    }));
  }

  async getEmotionTrend(wardId: string, days: number) {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const summaries = await this.prisma.callSummary.findMany({
      where: {
        wardId,
        createdAt: { gte: cutoff },
      },
      select: {
        createdAt: true,
        moodScore: true,
        mood: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    const dateMap = new Map<string, { scores: number[]; moods: string[] }>();
    for (const s of summaries) {
      const date = s.createdAt.toISOString().split('T')[0];
      if (!dateMap.has(date)) {
        dateMap.set(date, { scores: [], moods: [] });
      }
      const entry = dateMap.get(date)!;
      if (s.moodScore) entry.scores.push(Number(s.moodScore));
      if (s.mood) entry.moods.push(s.mood);
    }

    const results: Array<{ date: string; score: number; mood: string }> = [];
    for (const [date, data] of dateMap) {
      const avgScore = data.scores.length > 0 ? data.scores.reduce((a, b) => a + b, 0) / data.scores.length : 0;
      const moodCounts: Record<string, number> = {};
      for (const m of data.moods) {
        moodCounts[m] = (moodCounts[m] || 0) + 1;
      }
      const topMood = Object.entries(moodCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'neutral';
      results.push({ date, score: avgScore, mood: topMood });
    }

    return results;
  }

  async getHealthKeywordStats(wardId: string, days: number) {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const summaries = await this.prisma.callSummary.findMany({
      where: {
        wardId,
        createdAt: { gte: cutoff },
        healthKeywords: { not: Prisma.DbNull },
      },
      select: { healthKeywords: true },
    });

    const keywordCounts: Record<string, number> = {};
    for (const row of summaries) {
      const keywords = row.healthKeywords as Record<string, unknown> | null;
      if (keywords) {
        for (const [key, value] of Object.entries(keywords)) {
          if (typeof value === 'number') {
            keywordCounts[key] = (keywordCounts[key] || 0) + value;
          } else {
            keywordCounts[key] = (keywordCounts[key] || 0) + 1;
          }
        }
      }
    }

    return {
      pain: { count: keywordCounts['pain'] || 0, trend: 'stable' },
      sleep: { status: 'normal', mentions: keywordCounts['sleep'] || 0 },
      meal: { status: 'regular', mentions: keywordCounts['meal'] || 0 },
      medication: { status: 'compliant', mentions: keywordCounts['medication'] || 0 },
    };
  }

  async getTopTopics(wardId: string, days: number, limit: number = 5) {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const summaries = await this.prisma.callSummary.findMany({
      where: {
        wardId,
        createdAt: { gte: cutoff },
        tags: { isEmpty: false },
      },
      select: { tags: true },
    });

    const topicCounts: Record<string, number> = {};
    for (const row of summaries) {
      if (row.tags) {
        for (const tag of row.tags) {
          topicCounts[tag] = (topicCounts[tag] || 0) + 1;
        }
      }
    }

    return Object.entries(topicCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([topic, count]) => ({ topic, count }));
  }

  async getCallSummariesForReport(wardId: string, days: number) {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const summaries = await this.prisma.callSummary.findMany({
      where: {
        wardId,
        createdAt: { gte: cutoff },
      },
      select: { summary: true },
      orderBy: { createdAt: 'desc' },
    });

    return summaries;
  }

  // Guardian Wards methods
  async getWards(guardianId: string) {
    const guardian = await this.prisma.guardian.findUnique({
      where: { id: guardianId },
      include: {
        wards: {
          include: {
            user: {
              select: {
                id: true,
                nickname: true,
                profileImageUrl: true,
              },
            },
          },
        },
      },
    });

    const registrations = await this.prisma.guardianWardRegistration.findMany({
      where: { guardianId },
      include: {
        linkedWard: {
          include: {
            user: {
              select: {
                id: true,
                nickname: true,
                profileImageUrl: true,
              },
            },
          },
        },
      },
    });

    const results: Array<{
      id: string;
      ward_email: string;
      ward_phone_number: string;
      is_primary: boolean;
      linked_ward_id: string | null;
      ward_user_id: string | null;
      ward_nickname: string | null;
      ward_profile_image_url: string | null;
      last_call_at: string | null;
    }> = [];

    if (guardian) {
      const primaryWard = guardian.wards[0];
      let lastCallAt: string | null = null;
      if (primaryWard) {
        const lastCall = await this.prisma.call.findFirst({
          where: { calleeUserId: primaryWard.userId },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true },
        });
        lastCallAt = lastCall?.createdAt.toISOString() ?? null;
      }

      results.push({
        id: guardian.id,
        ward_email: guardian.wardEmail,
        ward_phone_number: guardian.wardPhoneNumber,
        is_primary: true,
        linked_ward_id: primaryWard?.id ?? null,
        ward_user_id: primaryWard?.userId ?? null,
        ward_nickname: primaryWard?.user.nickname ?? null,
        ward_profile_image_url: primaryWard?.user.profileImageUrl ?? null,
        last_call_at: lastCallAt,
      });
    }

    for (const reg of registrations) {
      let lastCallAt: string | null = null;
      if (reg.linkedWard) {
        const lastCall = await this.prisma.call.findFirst({
          where: { calleeUserId: reg.linkedWard.userId },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true },
        });
        lastCallAt = lastCall?.createdAt.toISOString() ?? null;
      }

      results.push({
        id: reg.id,
        ward_email: reg.wardEmail,
        ward_phone_number: reg.wardPhoneNumber,
        is_primary: false,
        linked_ward_id: reg.linkedWardId,
        ward_user_id: reg.linkedWard?.userId ?? null,
        ward_nickname: reg.linkedWard?.user.nickname ?? null,
        ward_profile_image_url: reg.linkedWard?.user.profileImageUrl ?? null,
        last_call_at: lastCallAt,
      });
    }

    return results;
  }

  async createWardRegistration(params: {
    guardianId: string;
    wardEmail: string;
    wardPhoneNumber: string;
  }): Promise<GuardianWardRegistrationRow> {
    const registration = await this.prisma.guardianWardRegistration.create({
      data: {
        guardianId: params.guardianId,
        wardEmail: params.wardEmail,
        wardPhoneNumber: params.wardPhoneNumber,
      },
    });
    return toGuardianWardRegistrationRow(registration);
  }

  async findWardRegistration(id: string, guardianId: string): Promise<GuardianWardRegistrationRow | undefined> {
    const registration = await this.prisma.guardianWardRegistration.findFirst({
      where: { id, guardianId },
    });
    return registration ? toGuardianWardRegistrationRow(registration) : undefined;
  }

  async updateWardRegistration(params: {
    id: string;
    guardianId: string;
    wardEmail: string;
    wardPhoneNumber: string;
  }): Promise<GuardianWardRegistrationRow | undefined> {
    try {
      const registration = await this.prisma.guardianWardRegistration.update({
        where: { id: params.id },
        data: {
          wardEmail: params.wardEmail,
          wardPhoneNumber: params.wardPhoneNumber,
        },
      });
      if (registration.guardianId !== params.guardianId) {
        return undefined;
      }
      return toGuardianWardRegistrationRow(registration);
    } catch {
      return undefined;
    }
  }

  async deleteWardRegistration(id: string, guardianId: string): Promise<boolean> {
    const registration = await this.prisma.guardianWardRegistration.findFirst({
      where: { id, guardianId },
    });

    if (!registration) return false;

    if (registration.linkedWardId) {
      await this.prisma.ward.update({
        where: { id: registration.linkedWardId },
        data: { guardianId: null },
      });
    }

    const result = await this.prisma.guardianWardRegistration.deleteMany({
      where: { id, guardianId },
    });
    return result.count > 0;
  }

  async unlinkPrimaryWard(guardianId: string): Promise<void> {
    await this.prisma.ward.updateMany({
      where: { guardianId },
      data: { guardianId: null },
    });
  }

  // Notification Settings
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
    return {
      call_reminder: true,
      call_complete: true,
      health_alert: true,
    };
  }

  async upsertNotificationSettings(params: {
    userId: string;
    callReminder?: boolean;
    callComplete?: boolean;
    healthAlert?: boolean;
  }) {
    const settings = await this.prisma.notificationSettings.upsert({
      where: { userId: params.userId },
      update: {
        callReminder: params.callReminder,
        callComplete: params.callComplete,
        healthAlert: params.healthAlert,
      },
      create: {
        userId: params.userId,
        callReminder: params.callReminder ?? true,
        callComplete: params.callComplete ?? true,
        healthAlert: params.healthAlert ?? true,
      },
    });
    return {
      call_reminder: settings.callReminder,
      call_complete: settings.callComplete,
      health_alert: settings.healthAlert,
    };
  }
}
