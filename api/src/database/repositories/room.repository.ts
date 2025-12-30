/**
 * Room Repository
 * rooms, room_members 테이블 관련 메서드
 */
import { Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { RoomMemberRow } from '../types';

@Injectable()
export class RoomRepository {
  constructor(private readonly pool: Pool) {}

  async listMembers(roomName: string): Promise<RoomMemberRow[]> {
    const result = await this.pool.query<RoomMemberRow>(
      `select u.identity, u.display_name, m.joined_at
       from room_members m
       join rooms r on m.room_id = r.id
       join users u on m.user_id = u.id
       where r.room_name = $1
       order by m.joined_at asc`,
      [roomName],
    );
    return result.rows;
  }

  async createIfMissing(roomName: string): Promise<void> {
    await this.pool.query(
      `insert into rooms (room_name)
       values ($1)
       on conflict (room_name) do nothing`,
      [roomName],
    );
  }

  async upsertMember(params: {
    roomName: string;
    userId: string;
    role: string;
  }): Promise<{ roomId: string }> {
    const result = await this.pool.query<{ id: string }>(
      `insert into rooms (room_name)
       values ($1)
       on conflict (room_name) do update set room_name = excluded.room_name
       returning id`,
      [params.roomName],
    );
    const roomId = result.rows[0].id;

    await this.pool.query(
      `insert into room_members (room_id, user_id, role)
       values ($1, $2, $3)
       on conflict (room_id, user_id)
       do update set role = excluded.role, joined_at = now()`,
      [roomId, params.userId, params.role],
    );

    return { roomId };
  }
}
