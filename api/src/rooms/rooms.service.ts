import { Injectable, Logger } from '@nestjs/common';
import { RoomsRepository } from './rooms.repository';
import { RoomMemberResponseDto, RoomMembersResponseDto } from './dto';

@Injectable()
export class RoomsService {
  private readonly logger = new Logger(RoomsService.name);

  constructor(private readonly roomsRepository: RoomsRepository) {}

  /**
   * 방 멤버 목록 조회
   */
  async listMembers(roomName: string): Promise<RoomMembersResponseDto> {
    const members = await this.roomsRepository.listMembers(roomName);
    this.logger.log(`listMembers room=${roomName} count=${members.length}`);

    return {
      roomName,
      members: members.map((m) => ({
        identity: m.identity,
        displayName: m.display_name,
        joinedAt: m.joined_at,
      })),
    };
  }

  /**
   * 방 생성 (없는 경우)
   */
  async createIfMissing(roomName: string): Promise<void> {
    await this.roomsRepository.createIfMissing(roomName);
  }

  /**
   * 방 멤버 추가/업데이트
   */
  async upsertMember(params: {
    roomName: string;
    userId: string;
    role: string;
  }): Promise<{ roomId: string }> {
    return this.roomsRepository.upsertMember(params);
  }

  /**
   * 사용자의 모든 방 멤버십 삭제
   */
  async deleteMembersByUserId(userId: string): Promise<void> {
    await this.roomsRepository.deleteMembersByUserId(userId);
  }
}
