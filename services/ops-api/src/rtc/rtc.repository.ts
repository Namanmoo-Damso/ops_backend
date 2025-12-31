/**
 * RTC Repository
 * RTC 토큰 발급을 위한 사용자/룸 관련 메서드
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma';
import { UserRow } from '../database/types';
import { toUserRow } from '../database/prisma-mappers';

type Role = 'host' | 'viewer' | 'observer';

@Injectable()
export class RtcRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findUserById(userId: string): Promise<UserRow | undefined> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    return user ? toUserRow(user) : undefined;
  }

  async findUserByDeviceToken(params: {
    tokenType: 'apns' | 'voip';
    token: string;
  }): Promise<UserRow | undefined> {
    const device = await this.prisma.device.findFirst({
      where:
        params.tokenType === 'voip'
          ? { voipToken: params.token }
          : { apnsToken: params.token },
      include: { user: true },
    });
    return device?.user ? toUserRow(device.user) : undefined;
  }

  async upsertUser(identity: string, displayName?: string): Promise<UserRow> {
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

  async upsertRoomMember(params: {
    roomName: string;
    userId: string;
    role: Role;
  }): Promise<void> {
    // Room 생성/확인하고 ID 받기
    const room = await this.prisma.room.upsert({
      where: { roomName: params.roomName },
      update: {},
      create: { roomName: params.roomName },
    });

    // Room member upsert (roomId와 userId로)
    await this.prisma.roomMember.upsert({
      where: {
        roomId_userId: {
          roomId: room.id,
          userId: params.userId,
        },
      },
      update: {
        role: params.role,
        joinedAt: new Date(),
      },
      create: {
        roomId: room.id,
        userId: params.userId,
        role: params.role,
      },
    });
  }
}
