import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { UsersRepository } from './users.repository';
import { PrismaService } from '../prisma';
import { toGuardianRow, toWardRow } from '../database/prisma-mappers';
import { GuardianRow } from '../database/types';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly prisma: PrismaService,
  ) {}

  async getUserInfo(userId: string) {
    const user = await this.usersRepository.findById(userId);
    if (!user) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }

    const baseResponse = {
      id: user.id,
      email: user.email,
      nickname: user.nickname,
      profileImageUrl: user.profile_image_url,
      userType: user.user_type,
      createdAt: user.created_at,
    };

    if (user.user_type === 'guardian') {
      const guardian = await this.findGuardianByUserId(user.id);
      const linkedWard = guardian ? await this.findWardByGuardianId(guardian.id) : undefined;

      return {
        ...baseResponse,
        guardianInfo: guardian
          ? {
              id: guardian.id,
              wardEmail: guardian.ward_email,
              wardPhoneNumber: guardian.ward_phone_number,
              linkedWard: linkedWard
                ? {
                    id: linkedWard.user_id,
                    nickname: linkedWard.user_nickname,
                    profileImageUrl: linkedWard.user_profile_image_url,
                  }
                : null,
            }
          : null,
      };
    } else if (user.user_type === 'ward') {
      const ward = await this.findWardByUserId(user.id);
      const linkedGuardian = ward?.guardian_id
        ? await this.findGuardianById(ward.guardian_id)
        : undefined;

      const guardianUser = linkedGuardian
        ? await this.usersRepository.findById(linkedGuardian.user_id)
        : null;

      return {
        ...baseResponse,
        wardInfo: ward
          ? {
              id: ward.id,
              phoneNumber: ward.phone_number,
              linkedGuardian: guardianUser
                ? {
                    id: guardianUser.id,
                    nickname: guardianUser.nickname,
                    profileImageUrl: guardianUser.profile_image_url,
                  }
                : null,
            }
          : null,
      };
    }

    return baseResponse;
  }

  async deleteUser(userId: string) {
    const user = await this.usersRepository.findById(userId);
    if (!user) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }

    await this.usersRepository.delete(userId, (userId) => this.findGuardianByUserId(userId));
    this.logger.log(`deleteUser userId=${userId}`);
  }

  async findById(userId: string) {
    return this.usersRepository.findById(userId);
  }

  async findByIdentity(identity: string) {
    return this.usersRepository.findByIdentity(identity);
  }

  async findByKakaoId(kakaoId: string) {
    return this.usersRepository.findByKakaoId(kakaoId);
  }

  async createWithKakao(params: {
    kakaoId: string;
    email: string | null;
    nickname: string | null;
    profileImageUrl: string | null;
    userType: 'guardian' | 'ward' | null;
  }) {
    return this.usersRepository.createWithKakao(params);
  }

  async updateType(userId: string, userType: 'guardian' | 'ward') {
    return this.usersRepository.updateType(userId, userType);
  }

  async upsert(identity: string, displayName?: string) {
    return this.usersRepository.upsert(identity, displayName);
  }

  // Refresh Token methods
  async saveRefreshToken(userId: string, tokenHash: string, expiresAt: Date) {
    return this.usersRepository.saveRefreshToken({ userId, tokenHash, expiresAt });
  }

  async findRefreshToken(tokenHash: string) {
    return this.usersRepository.findRefreshToken(tokenHash);
  }

  async deleteRefreshToken(tokenHash: string) {
    return this.usersRepository.deleteRefreshToken(tokenHash);
  }

  async deleteUserRefreshTokens(userId: string) {
    return this.usersRepository.deleteUserRefreshTokens(userId);
  }

  // Helper methods for cross-domain queries (temporary until full refactoring)
  private async findGuardianByUserId(userId: string): Promise<GuardianRow | undefined> {
    const guardian = await this.prisma.guardian.findUnique({
      where: { userId },
    });
    return guardian ? toGuardianRow(guardian) : undefined;
  }

  private async findGuardianById(guardianId: string): Promise<GuardianRow | undefined> {
    const guardian = await this.prisma.guardian.findUnique({
      where: { id: guardianId },
    });
    return guardian ? toGuardianRow(guardian) : undefined;
  }

  private async findWardByGuardianId(guardianId: string) {
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
      ...toWardRow(ward),
      user_nickname: ward.user.nickname,
      user_profile_image_url: ward.user.profileImageUrl,
    };
  }

  private async findWardByUserId(userId: string) {
    const ward = await this.prisma.ward.findUnique({
      where: { userId },
    });
    return ward ? toWardRow(ward) : undefined;
  }
}
