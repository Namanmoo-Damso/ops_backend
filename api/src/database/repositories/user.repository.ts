/**
 * User Repository
 * users, refresh_tokens 테이블 관련 메서드
 */
import { Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { UserRow, RefreshTokenRow, GuardianRow } from '../types';

@Injectable()
export class UserRepository {
  constructor(private readonly pool: Pool) {}

  async upsert(identity: string, displayName?: string): Promise<UserRow> {
    const result = await this.pool.query<UserRow>(
      `insert into users (identity, display_name, updated_at)
       values ($1, $2, now())
       on conflict (identity)
       do update set display_name = coalesce(excluded.display_name, users.display_name),
         updated_at = now()
       returning id, identity, display_name, user_type, email, nickname, profile_image_url, kakao_id, created_at, updated_at`,
      [identity, displayName ?? null],
    );
    return result.rows[0];
  }

  async findById(userId: string): Promise<UserRow | undefined> {
    const result = await this.pool.query<UserRow>(
      `select id, identity, display_name, user_type, email, nickname,
              profile_image_url, kakao_id, created_at, updated_at
       from users
       where id = $1
       limit 1`,
      [userId],
    );
    return result.rows[0];
  }

  async findByKakaoId(kakaoId: string): Promise<UserRow | undefined> {
    const result = await this.pool.query<UserRow>(
      `select id, identity, display_name, user_type, email, nickname,
              profile_image_url, kakao_id, created_at, updated_at
       from users
       where kakao_id = $1
       limit 1`,
      [kakaoId],
    );
    return result.rows[0];
  }

  async updateType(userId: string, userType: 'guardian' | 'ward'): Promise<void> {
    await this.pool.query(
      `update users set user_type = $1, updated_at = now() where id = $2`,
      [userType, userId],
    );
  }

  async createWithKakao(params: {
    kakaoId: string;
    email: string | null;
    nickname: string | null;
    profileImageUrl: string | null;
    userType: 'guardian' | 'ward' | null;
  }): Promise<UserRow> {
    const identity = `kakao_${params.kakaoId}`;
    const result = await this.pool.query<UserRow>(
      `insert into users (identity, display_name, user_type, email, nickname, profile_image_url, kakao_id, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7, now())
       returning id, identity, display_name, user_type, email, nickname, profile_image_url, kakao_id, created_at, updated_at`,
      [
        identity,
        params.nickname,
        params.userType,
        params.email,
        params.nickname,
        params.profileImageUrl,
        params.kakaoId,
      ],
    );
    return result.rows[0];
  }

  async delete(userId: string, findGuardianByUserId: (userId: string) => Promise<GuardianRow | undefined>): Promise<void> {
    // 1. Delete refresh tokens
    await this.pool.query(
      `delete from refresh_tokens where user_id = $1`,
      [userId],
    );

    // 2. Unlink wards from guardian (if user is a guardian)
    const guardian = await findGuardianByUserId(userId);
    if (guardian) {
      await this.pool.query(
        `update wards set guardian_id = null where guardian_id = $1`,
        [guardian.id],
      );
      await this.pool.query(
        `delete from guardians where id = $1`,
        [guardian.id],
      );
    }

    // 3. Delete ward record if user is a ward
    await this.pool.query(
      `delete from wards where user_id = $1`,
      [userId],
    );

    // 4. Delete user
    await this.pool.query(
      `delete from users where id = $1`,
      [userId],
    );
  }

  // Refresh Token methods
  async saveRefreshToken(params: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<void> {
    await this.pool.query(
      `insert into refresh_tokens (user_id, token_hash, expires_at)
       values ($1, $2, $3)`,
      [params.userId, params.tokenHash, params.expiresAt.toISOString()],
    );
  }

  async findRefreshToken(tokenHash: string): Promise<RefreshTokenRow | undefined> {
    const result = await this.pool.query<RefreshTokenRow>(
      `select id, user_id, token_hash, expires_at, created_at
       from refresh_tokens
       where token_hash = $1 and expires_at > now()
       limit 1`,
      [tokenHash],
    );
    return result.rows[0];
  }

  async deleteRefreshToken(tokenHash: string): Promise<void> {
    await this.pool.query(
      `delete from refresh_tokens where token_hash = $1`,
      [tokenHash],
    );
  }

  async deleteUserRefreshTokens(userId: string): Promise<void> {
    await this.pool.query(
      `delete from refresh_tokens where user_id = $1`,
      [userId],
    );
  }
}
