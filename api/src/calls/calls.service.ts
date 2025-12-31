import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { CallsRepository } from './calls.repository';
import { PushService } from '../push/push.service';
import { PrismaService } from '../prisma';
import { InviteCallDto } from './dto';
import { InviteCallResponseDto, CallStateResponseDto } from './dto';
import { CallRow, DeviceRow } from '../database/types';
import { toUserRow, toDeviceRow } from '../database/prisma-mappers';

@Injectable()
export class CallsService {
  private readonly logger = new Logger(CallsService.name);

  constructor(
    private readonly callsRepository: CallsRepository,
    private readonly pushService: PushService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * 통화 초대
   */
  async invite(params: {
    callerIdentity: string;
    callerName?: string;
    calleeIdentity: string;
    roomName?: string;
  }): Promise<InviteCallResponseDto> {
    const roomName = params.roomName?.trim() || `call-${randomUUID()}`;

    // Room 생성/확인
    await this.createRoomIfMissing(roomName);

    // 기존 ringing call 확인 (30초 이내)
    const existing = await this.callsRepository.findRinging(
      params.calleeIdentity,
      roomName,
      30,
    );

    const isDeduped = !!existing;
    let callId: string;
    let callState: string;

    if (existing) {
      callId = existing.callId;
      callState = 'ringing';
      this.logger.log(
        `invite deduped caller=${params.callerIdentity} callee=${params.calleeIdentity} room=${roomName} callId=${callId} (resending push)`,
      );
    } else {
      // User upsert
      const callerUser = await this.upsertUser(params.callerIdentity, params.callerName);
      const calleeUser = await this.upsertUser(params.calleeIdentity);

      // Call 생성
      const call = await this.callsRepository.create({
        callerIdentity: params.callerIdentity,
        calleeIdentity: params.calleeIdentity,
        callerUserId: callerUser.id,
        calleeUserId: calleeUser.id,
        roomName,
      });
      callId = call.id;
      callState = call.state;
    }

    // Push 발송
    const push = await this.sendCallPush({
      callId,
      roomName,
      callerIdentity: params.callerIdentity,
      callerName: params.callerName,
      calleeIdentity: params.calleeIdentity,
    });

    this.logger.log(
      `invite sent caller=${params.callerIdentity} callee=${params.calleeIdentity} room=${roomName} callId=${callId} deduped=${isDeduped} voipSent=${push.voip.sent} voipFailed=${push.voip.failed} alertSent=${push.alert.sent} alertFailed=${push.alert.failed}`,
    );

    return {
      callId,
      roomName,
      state: callState,
      deduped: isDeduped,
      push,
    };
  }

  /**
   * 통화 응답
   */
  async answer(callId: string): Promise<CallStateResponseDto | null> {
    this.logger.log(`answer callId=${callId}`);
    const call = await this.callsRepository.updateState(callId, 'answered');
    return call ? this.toCallStateResponse(call) : null;
  }

  /**
   * 통화 종료
   */
  async end(callId: string): Promise<CallStateResponseDto | null> {
    this.logger.log(`end callId=${callId}`);
    const call = await this.callsRepository.updateState(callId, 'ended');
    return call ? this.toCallStateResponse(call) : null;
  }

  /**
   * 통화 정보 (Ward 정보 포함)
   */
  async getWithWardInfo(callId: string) {
    return this.callsRepository.getWithWardInfo(callId);
  }

  /**
   * 분석용 통화 정보
   */
  async getForAnalysis(callId: string) {
    return this.callsRepository.getForAnalysis(callId);
  }

  /**
   * 통화 요약 생성
   */
  async createSummary(params: {
    callId: string;
    wardId: string | null;
    summary: string;
    mood: string;
    moodScore: number;
    tags: string[];
    healthKeywords: Record<string, unknown>;
  }) {
    return this.callsRepository.createSummary(params);
  }

  /**
   * 최근 통화 요약 조회
   */
  async getRecentSummaries(wardId: string, limit: number = 5) {
    return this.callsRepository.getRecentSummaries(wardId, limit);
  }

  /**
   * 보고서용 통화 요약 조회
   */
  async getSummariesForReport(wardId: string, days: number) {
    return this.callsRepository.getSummariesForReport(wardId, days);
  }

  /**
   * 부재 통화 조회
   */
  async getMissedCalls(hoursAgo: number = 1) {
    return this.callsRepository.getMissed(hoursAgo);
  }

  /**
   * 최근 통증 언급 횟수 조회
   */
  async getRecentPainMentions(wardId: string, days: number) {
    return this.callsRepository.getRecentPainMentions(wardId, days);
  }

  /**
   * 통화 요약 조회
   */
  async getSummary(callId: string) {
    return this.callsRepository.getSummary(callId);
  }

  // ============================================================
  // Private methods
  // ============================================================

  private async createRoomIfMissing(roomName: string): Promise<void> {
    await this.prisma.room.upsert({
      where: { roomName },
      update: {},
      create: { roomName },
    });
  }

  private async upsertUser(identity: string, displayName?: string) {
    const user = await this.prisma.user.upsert({
      where: { identity },
      update: {
        displayName: displayName ?? undefined,
        updatedAt: new Date(),
      },
      create: {
        identity,
        displayName: displayName ?? null,
      },
    });
    return toUserRow(user);
  }

  private async sendCallPush(params: {
    callId: string;
    roomName: string;
    callerIdentity: string;
    callerName?: string;
    calleeIdentity: string;
  }) {
    const payload = {
      callId: params.callId,
      roomName: params.roomName,
      callerName: params.callerName ?? params.callerIdentity,
      callerIdentity: params.callerIdentity,
    };

    // Callee의 모든 디바이스 조회
    const devices = await this.listAllDevicesByIdentity(params.calleeIdentity);

    let voipSent = 0;
    let voipFailed = 0;
    let alertSent = 0;
    let alertFailed = 0;
    const invalidTokens: string[] = [];

    // VoIP와 APNs 디바이스 분리
    const voipTokens: { token: string; env: string }[] = [];
    const apnsTokens: { token: string; env: string }[] = [];

    for (const device of devices) {
      if (device.supports_callkit && device.voip_token) {
        // iPhone 또는 Cellular iPad: VoIP Push 사용
        voipTokens.push({ token: device.voip_token, env: device.env });
      } else if (device.apns_token) {
        // WiFi-only iPad 또는 VoIP 토큰 없는 기기: APNs alert 사용
        apnsTokens.push({ token: device.apns_token, env: device.env });
      }
    }

    // VoIP Push 발송
    if (voipTokens.length > 0) {
      const voipResult = await this.pushService.sendPush({
        tokens: voipTokens,
        type: 'voip',
        payload,
      });
      voipSent = voipResult.sent;
      voipFailed = voipResult.failed;
      invalidTokens.push(...voipResult.invalidTokens);
      for (const token of voipResult.invalidTokens) {
        await this.invalidateToken('voip', token);
      }
    }

    // APNs alert 발송
    if (apnsTokens.length > 0) {
      const callerDisplayName = params.callerName ?? params.callerIdentity;
      const apnsResult = await this.pushService.sendPush({
        tokens: apnsTokens,
        type: 'alert',
        title: '수신 전화',
        body: `${callerDisplayName}님이 전화 중`,
        payload,
        category: 'INCOMING_CALL',
        sound: 'ringtone.caf',
        interruptionLevel: 'time-sensitive',
      });
      alertSent = apnsResult.sent;
      alertFailed = apnsResult.failed;
      invalidTokens.push(...apnsResult.invalidTokens);
      for (const token of apnsResult.invalidTokens) {
        await this.invalidateToken('apns', token);
      }
    }

    return {
      sent: voipSent + alertSent,
      failed: voipFailed + alertFailed,
      invalidTokens,
      voip: { sent: voipSent, failed: voipFailed },
      alert: { sent: alertSent, failed: alertFailed },
    };
  }

  private async listAllDevicesByIdentity(identity: string): Promise<DeviceRow[]> {
    const devices = await this.prisma.device.findMany({
      where: {
        user: { identity },
        OR: [{ apnsToken: { not: null } }, { voipToken: { not: null } }],
      },
    });
    return devices.map(toDeviceRow);
  }

  private async invalidateToken(tokenType: 'apns' | 'voip', token: string): Promise<void> {
    if (tokenType === 'voip') {
      await this.prisma.device.updateMany({
        where: { voipToken: token },
        data: { voipToken: null },
      });
    } else {
      await this.prisma.device.updateMany({
        where: { apnsToken: token },
        data: { apnsToken: null },
      });
    }
  }

  private toCallStateResponse(call: CallRow): CallStateResponseDto {
    return {
      id: call.id,
      room_name: call.room_name,
      caller_identity: call.caller_identity,
      callee_identity: call.callee_identity,
      state: call.state,
      created_at: call.created_at,
      answered_at: call.answered_at,
      ended_at: call.ended_at,
    };
  }
}
