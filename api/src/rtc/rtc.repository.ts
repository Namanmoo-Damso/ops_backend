/**
 * RTC Repository
 * RTC 토큰 발급을 위한 사용자 조회 메서드
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma';
import { UserRow } from '../database/types';
import { toUserRow } from '../database/prisma-mappers';

@Injectable()
export class RtcRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findUserById(userId: string): Promise<UserRow | undefined> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    return user ? toUserRow(user) : undefined;
  }
}
