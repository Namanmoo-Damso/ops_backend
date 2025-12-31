/**
 * Auth Repository
 * users, guardians, wards, refresh_tokens, devices, room_members 관련 인증 메서드
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma';
import { UserRow, GuardianRow, WardRow, RefreshTokenRow } from '../database/types';
import { toUserRow, toGuardianRow, toWardRow, toRefreshTokenRow } from '../database/prisma-mappers';

@Injectable()
export class AuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  // User methods
  async findUserByKakaoId(kakaoId: string): Promise<UserRow | undefined> {
    const user = await this.prisma.user.findUnique({
      where: { kakaoId },
    });
    return user ? toUserRow(user) : undefined;
  }

  async findUserById(userId: string): Promise<UserRow | undefined> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    return user ? toUserRow(user) : undefined;
  }

  async createUserWithKakao(params: {
    kakaoId: string;
    email: string | null;
    nickname: string | null;
    profileImageUrl: string | null;
    userType: 'guardian' | 'ward' | null;
  }): Promise<UserRow> {
    const identity = `kakao_${params.kakaoId}`;
    const user = await this.prisma.user.create({
      data: {
        identity,
        displayName: params.nickname,
        userType: params.userType,
        email: params.email,
        nickname: params.nickname,
        profileImageUrl: params.profileImageUrl,
        kakaoId: params.kakaoId,
      },
    });
    return toUserRow(user);
  }

  async updateUserType(userId: string, userType: 'guardian' | 'ward'): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        userType,
        updatedAt: new Date(),
      },
    });
  }

  // Guardian methods
  async findGuardianByWardEmail(wardEmail: string): Promise<GuardianRow | undefined> {
    const guardian = await this.prisma.guardian.findFirst({
      where: { wardEmail },
    });
    return guardian ? toGuardianRow(guardian) : undefined;
  }

  async createGuardian(params: {
    userId: string;
    wardEmail: string;
    wardPhoneNumber: string;
  }): Promise<GuardianRow> {
    const guardian = await this.prisma.guardian.create({
      data: {
        userId: params.userId,
        wardEmail: params.wardEmail,
        wardPhoneNumber: params.wardPhoneNumber,
      },
    });
    return toGuardianRow(guardian);
  }

  // Ward methods
  async createWard(params: {
    userId: string;
    phoneNumber: string;
    guardianId: string | null;
  }): Promise<WardRow> {
    const ward = await this.prisma.ward.create({
      data: {
        userId: params.userId,
        phoneNumber: params.phoneNumber,
        guardianId: params.guardianId,
      },
    });
    return toWardRow(ward);
  }

  // Refresh Token methods
  async saveRefreshToken(params: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<void> {
    await this.prisma.refreshToken.create({
      data: {
        userId: params.userId,
        tokenHash: params.tokenHash,
        expiresAt: params.expiresAt,
      },
    });
  }

  async findRefreshToken(tokenHash: string): Promise<RefreshTokenRow | undefined> {
    const token = await this.prisma.refreshToken.findFirst({
      where: {
        tokenHash,
        expiresAt: { gt: new Date() },
      },
    });
    return token ? toRefreshTokenRow(token) : undefined;
  }

  async deleteRefreshToken(tokenHash: string): Promise<void> {
    await this.prisma.refreshToken.deleteMany({
      where: { tokenHash },
    });
  }

  async deleteUserRefreshTokens(userId: string): Promise<void> {
    await this.prisma.refreshToken.deleteMany({
      where: { userId },
    });
  }

  // Logout cleanup methods
  async deleteRoomMembersByUserId(userId: string): Promise<void> {
    await this.prisma.roomMember.deleteMany({
      where: { userId },
    });
  }

  async deleteDevicesByUserId(userId: string): Promise<void> {
    await this.prisma.device.deleteMany({
      where: { userId },
    });
  }
}
