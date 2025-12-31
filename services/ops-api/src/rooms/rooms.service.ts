import { Injectable, Logger } from '@nestjs/common';
import { RoomServiceClient } from 'livekit-server-sdk';
import { RoomsRepository } from './rooms.repository';
import { RoomMemberResponseDto, RoomMembersResponseDto } from './dto';

const getLivekitConfig = () => ({
  livekitUrl: process.env.LIVEKIT_URL ?? '',
  livekitApiKey: process.env.LIVEKIT_API_KEY ?? '',
  livekitApiSecret: process.env.LIVEKIT_API_SECRET ?? '',
});

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

  /**
   * LiveKit에서 특정 사용자를 모든 room에서 강제 퇴장
   */
  async removeParticipantFromAllRooms(identity: string): Promise<void> {
    const config = getLivekitConfig();
    if (!config.livekitUrl || !config.livekitApiKey || !config.livekitApiSecret) {
      this.logger.warn(`removeParticipantFromAllRooms skipped - LiveKit not configured`);
      return;
    }

    const roomService = new RoomServiceClient(
      config.livekitUrl,
      config.livekitApiKey,
      config.livekitApiSecret,
    );

    try {
      // 활성 room 목록 조회
      const rooms = await roomService.listRooms();

      for (const room of rooms) {
        try {
          // 각 room에서 해당 participant 조회
          const participants = await roomService.listParticipants(room.name);
          const participant = participants.find((p) => p.identity === identity);

          if (participant) {
            await roomService.removeParticipant(room.name, identity);
            this.logger.log(`removeParticipant room=${room.name} identity=${identity}`);
          }
        } catch (err) {
          // participant가 없거나 이미 나간 경우 무시
          this.logger.debug(`removeParticipant failed room=${room.name} identity=${identity} error=${(err as Error).message}`);
        }
      }
    } catch (err) {
      this.logger.warn(`removeParticipantFromAllRooms failed identity=${identity} error=${(err as Error).message}`);
    }
  }
}
