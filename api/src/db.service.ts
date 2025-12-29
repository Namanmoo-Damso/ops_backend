import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Pool } from 'pg';

type UserType = 'guardian' | 'ward' | null;

type UserRow = {
  id: string;
  identity: string;
  display_name: string | null;
  user_type: UserType;
  email: string | null;
  nickname: string | null;
  profile_image_url: string | null;
  kakao_id: string | null;
  created_at: string;
  updated_at: string;
};

type GuardianRow = {
  id: string;
  user_id: string;
  ward_email: string;
  ward_phone_number: string;
  created_at: string;
  updated_at: string;
};

type WardRow = {
  id: string;
  user_id: string;
  phone_number: string;
  guardian_id: string | null;
  organization_id: string | null;
  ai_persona: string;
  weekly_call_count: number;
  call_duration_minutes: number;
  created_at: string;
  updated_at: string;
};

type OrganizationRow = {
  id: string;
  name: string;
  created_at: string;
};

type RefreshTokenRow = {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: string;
  created_at: string;
};

type DeviceRow = {
  id: string;
  user_id: string | null;
  platform: string;
  apns_token: string | null;
  voip_token: string | null;
  supports_callkit: boolean;
  env: string;
  last_seen: string;
};

type RoomMemberRow = {
  identity: string;
  display_name: string | null;
  joined_at: string;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

@Injectable()
export class DbService implements OnModuleInit, OnModuleDestroy {
  private readonly pool: Pool;

  constructor() {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('Missing DATABASE_URL');
    }
    this.pool = new Pool({ connectionString: databaseUrl });
  }

  async onModuleInit() {
    await this.waitForDb();
  }

  async onModuleDestroy() {
    await this.pool.end();
  }

  private async waitForDb() {
    let lastError: unknown;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      try {
        await this.pool.query('select 1');
        return;
      } catch (error) {
        lastError = error;
        await sleep(1000 + attempt * 500);
      }
    }
    throw lastError;
  }

  async upsertUser(identity: string, displayName?: string) {
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

  async upsertDevice(params: {
    identity: string;
    displayName?: string;
    platform: string;
    env: string;
    apnsToken?: string;
    voipToken?: string;
    supportsCallKit?: boolean;
  }) {
    const user = await this.upsertUser(params.identity, params.displayName);
    const supportsCallKit = params.supportsCallKit ?? true;
    let device: DeviceRow | undefined;

    if (params.apnsToken) {
      // Clear voip_token when supportsCallKit is false (WiFi-only iPad)
      const clearVoip = supportsCallKit === false && !params.voipToken;
      const result = await this.pool.query<DeviceRow>(
        `insert into devices (user_id, platform, apns_token, voip_token, supports_callkit, env, last_seen)
         values ($1, $2, $3, ${clearVoip ? 'null' : 'null'}, $4, $5, now())
         on conflict (apns_token)
         do update set user_id = excluded.user_id,
           platform = excluded.platform,
           supports_callkit = excluded.supports_callkit,
           ${clearVoip ? 'voip_token = null,' : ''}
           env = excluded.env,
           last_seen = now()
         returning id, user_id, platform, apns_token, voip_token, supports_callkit, env, last_seen`,
        [user.id, params.platform, params.apnsToken, supportsCallKit, params.env],
      );
      device = result.rows[0];
    }

    if (params.voipToken) {
      if (device) {
        await this.pool.query(
          `update devices
           set voip_token = null, last_seen = now()
           where voip_token = $1 and id <> $2`,
          [params.voipToken, device.id],
        );
        const result = await this.pool.query<DeviceRow>(
          `update devices
           set voip_token = $1, supports_callkit = $2, env = $3, last_seen = now()
           where id = $4
           returning id, user_id, platform, apns_token, voip_token, supports_callkit, env, last_seen`,
          [params.voipToken, supportsCallKit, params.env, device.id],
        );
        device = result.rows[0];
      } else {
        const result = await this.pool.query<DeviceRow>(
          `insert into devices (user_id, platform, voip_token, supports_callkit, env, last_seen)
           values ($1, $2, $3, $4, $5, now())
           on conflict (voip_token)
           do update set user_id = excluded.user_id,
             platform = excluded.platform,
             supports_callkit = excluded.supports_callkit,
             env = excluded.env,
             last_seen = now()
           returning id, user_id, platform, apns_token, voip_token, supports_callkit, env, last_seen`,
          [user.id, params.platform, params.voipToken, supportsCallKit, params.env],
        );
        device = result.rows[0];
      }
    }

    return { user, device };
  }

  async listDevicesByIdentity(params: {
    identity: string;
    tokenType: 'apns' | 'voip';
    env?: string;
  }) {
    const tokenColumn = params.tokenType === 'voip' ? 'voip_token' : 'apns_token';
    const values: Array<string> = [params.identity];
    let envFilter = '';
    if (params.env) {
      values.push(params.env);
      envFilter = ` and d.env = $${values.length}`;
    }
    const result = await this.pool.query<{ token: string; env: string }>(
      `select d.${tokenColumn} as token, d.env
       from devices d
       join users u on d.user_id = u.id
       where u.identity = $1
         and d.${tokenColumn} is not null${envFilter}`,
      values,
    );
    return result.rows;
  }

  async listAllDevicesByIdentity(params: { identity: string; env?: string }) {
    const values: Array<string> = [params.identity];
    let envFilter = '';
    if (params.env) {
      values.push(params.env);
      envFilter = ` and d.env = $${values.length}`;
    }
    const result = await this.pool.query<{
      apns_token: string | null;
      voip_token: string | null;
      supports_callkit: boolean;
      env: string;
    }>(
      `select d.apns_token, d.voip_token, d.supports_callkit, d.env
       from devices d
       join users u on d.user_id = u.id
       where u.identity = $1${envFilter}`,
      values,
    );
    return result.rows;
  }

  async findUserByDeviceToken(params: {
    tokenType: 'apns' | 'voip';
    token: string;
  }) {
    const tokenColumn = params.tokenType === 'voip' ? 'voip_token' : 'apns_token';
    const result = await this.pool.query<UserRow>(
      `select u.id, u.identity, u.display_name, u.user_type, u.email, u.nickname,
              u.profile_image_url, u.kakao_id, u.created_at, u.updated_at
       from devices d
       join users u on d.user_id = u.id
       where d.${tokenColumn} = $1
       limit 1`,
      [params.token],
    );
    return result.rows[0];
  }

  async listDevices(params: { tokenType: 'apns' | 'voip'; env?: string }) {
    const tokenColumn = params.tokenType === 'voip' ? 'voip_token' : 'apns_token';
    const values: Array<string> = [];
    let envFilter = '';
    if (params.env) {
      values.push(params.env);
      envFilter = ` where env = $${values.length}`;
    }
    const result = await this.pool.query<{ token: string; env: string }>(
      `select ${tokenColumn} as token, env
       from devices
       ${envFilter}
       ${envFilter ? 'and' : 'where'} ${tokenColumn} is not null`,
      values,
    );
    return result.rows;
  }

  async invalidateToken(tokenType: 'apns' | 'voip', token: string) {
    const column = tokenType === 'voip' ? 'voip_token' : 'apns_token';
    await this.pool.query(
      `update devices set ${column} = null, last_seen = now() where ${column} = $1`,
      [token],
    );
  }

  async listRoomMembers(roomName: string) {
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

  async createRoomIfMissing(roomName: string) {
    await this.pool.query(
      `insert into rooms (room_name)
       values ($1)
       on conflict (room_name) do nothing`,
      [roomName],
    );
  }

  async upsertRoomMember(params: {
    roomName: string;
    userId: string;
    role: string;
  }) {
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

  async findRingingCall(calleeIdentity: string, roomName: string, seconds: number) {
    const result = await this.pool.query<{ call_id: string }>(
      `select call_id
       from calls
       where callee_identity = $1
         and room_name = $2
         and state = 'ringing'
         and created_at > now() - ($3 || ' seconds')::interval
       limit 1`,
      [calleeIdentity, roomName, seconds.toString()],
    );
    return result.rows[0];
  }

  async createCall(params: {
    callerIdentity: string;
    calleeIdentity: string;
    callerUserId?: string;
    calleeUserId?: string;
    roomName: string;
  }) {
    const result = await this.pool.query<{
      call_id: string;
      state: string;
      created_at: string;
    }>(
      `insert into calls (caller_user_id, callee_user_id, caller_identity, callee_identity, room_name, state)
       values ($1, $2, $3, $4, $5, 'ringing')
       returning call_id, state, created_at`,
      [
        params.callerUserId ?? null,
        params.calleeUserId ?? null,
        params.callerIdentity,
        params.calleeIdentity,
        params.roomName,
      ],
    );
    return result.rows[0];
  }

  async updateCallState(callId: string, state: 'answered' | 'ended') {
    const timestampColumn = state === 'answered' ? 'answered_at' : 'ended_at';
    const result = await this.pool.query<{
      call_id: string;
      state: string;
      answered_at: string | null;
      ended_at: string | null;
    }>(
      `update calls
       set state = $2, ${timestampColumn} = now()
       where call_id = $1
       returning call_id, state, answered_at, ended_at`,
      [callId, state],
    );
    return result.rows[0];
  }

  // ============================================================
  // Auth related methods
  // ============================================================

  async findUserByKakaoId(kakaoId: string) {
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

  async findUserById(userId: string) {
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

  async findGuardianByWardEmail(wardEmail: string) {
    const result = await this.pool.query<GuardianRow>(
      `select id, user_id, ward_email, ward_phone_number, created_at, updated_at
       from guardians
       where ward_email = $1
       limit 1`,
      [wardEmail],
    );
    return result.rows[0];
  }

  async createUserWithKakao(params: {
    kakaoId: string;
    email: string | null;
    nickname: string | null;
    profileImageUrl: string | null;
    userType: 'guardian' | 'ward';
  }) {
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

  async createWard(params: {
    userId: string;
    phoneNumber: string;
    guardianId: string | null;
  }) {
    const result = await this.pool.query<WardRow>(
      `insert into wards (user_id, phone_number, guardian_id, updated_at)
       values ($1, $2, $3, now())
       returning id, user_id, phone_number, guardian_id, organization_id, ai_persona, weekly_call_count, call_duration_minutes, created_at, updated_at`,
      [params.userId, params.phoneNumber, params.guardianId],
    );
    return result.rows[0];
  }

  async createGuardian(params: {
    userId: string;
    wardEmail: string;
    wardPhoneNumber: string;
  }) {
    const result = await this.pool.query<GuardianRow>(
      `insert into guardians (user_id, ward_email, ward_phone_number, updated_at)
       values ($1, $2, $3, now())
       returning id, user_id, ward_email, ward_phone_number, created_at, updated_at`,
      [params.userId, params.wardEmail, params.wardPhoneNumber],
    );
    return result.rows[0];
  }

  async saveRefreshToken(params: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }) {
    await this.pool.query(
      `insert into refresh_tokens (user_id, token_hash, expires_at)
       values ($1, $2, $3)`,
      [params.userId, params.tokenHash, params.expiresAt.toISOString()],
    );
  }

  async findRefreshToken(tokenHash: string) {
    const result = await this.pool.query<RefreshTokenRow>(
      `select id, user_id, token_hash, expires_at, created_at
       from refresh_tokens
       where token_hash = $1 and expires_at > now()
       limit 1`,
      [tokenHash],
    );
    return result.rows[0];
  }

  async deleteRefreshToken(tokenHash: string) {
    await this.pool.query(
      `delete from refresh_tokens where token_hash = $1`,
      [tokenHash],
    );
  }

  async deleteUserRefreshTokens(userId: string) {
    await this.pool.query(
      `delete from refresh_tokens where user_id = $1`,
      [userId],
    );
  }

  async findGuardianByUserId(userId: string) {
    const result = await this.pool.query<GuardianRow>(
      `select id, user_id, ward_email, ward_phone_number, created_at, updated_at
       from guardians
       where user_id = $1
       limit 1`,
      [userId],
    );
    return result.rows[0];
  }

  async findWardByUserId(userId: string) {
    const result = await this.pool.query<WardRow>(
      `select id, user_id, phone_number, guardian_id, organization_id, ai_persona, weekly_call_count, call_duration_minutes, created_at, updated_at
       from wards
       where user_id = $1
       limit 1`,
      [userId],
    );
    return result.rows[0];
  }

  async findWardByGuardianId(guardianId: string) {
    const result = await this.pool.query<WardRow & { user_nickname: string | null; user_profile_image_url: string | null }>(
      `select w.id, w.user_id, w.phone_number, w.guardian_id, w.organization_id, w.ai_persona,
              w.weekly_call_count, w.call_duration_minutes, w.created_at, w.updated_at,
              u.nickname as user_nickname, u.profile_image_url as user_profile_image_url
       from wards w
       join users u on w.user_id = u.id
       where w.guardian_id = $1
       limit 1`,
      [guardianId],
    );
    return result.rows[0];
  }

  async findGuardianById(guardianId: string) {
    const result = await this.pool.query<GuardianRow & { user_nickname: string | null; user_profile_image_url: string | null }>(
      `select g.id, g.user_id, g.ward_email, g.ward_phone_number, g.created_at, g.updated_at,
              u.nickname as user_nickname, u.profile_image_url as user_profile_image_url
       from guardians g
       join users u on g.user_id = u.id
       where g.id = $1
       limit 1`,
      [guardianId],
    );
    return result.rows[0];
  }

  async deleteUser(userId: string) {
    // 1. Delete refresh tokens
    await this.pool.query(
      `delete from refresh_tokens where user_id = $1`,
      [userId],
    );

    // 2. Unlink wards from guardian (if user is a guardian)
    const guardian = await this.findGuardianByUserId(userId);
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

  // ============================================================
  // Dashboard related methods
  // ============================================================

  async getWardCallStats(wardId: string) {
    const result = await this.pool.query<{
      total_calls: string;
      avg_duration: string | null;
    }>(
      `select
        count(*) as total_calls,
        avg(extract(epoch from (c.ended_at - c.answered_at))/60) as avg_duration
       from calls c
       where c.callee_user_id = (select user_id from wards where id = $1)
         and c.state = 'ended'
         and c.answered_at is not null`,
      [wardId],
    );
    return {
      totalCalls: parseInt(result.rows[0]?.total_calls || '0', 10),
      avgDuration: Math.round(parseFloat(result.rows[0]?.avg_duration || '0')),
    };
  }

  async getWardWeeklyCallChange(wardId: string) {
    const result = await this.pool.query<{ this_week: string; last_week: string }>(
      `select
        (select count(*) from calls c
         where c.callee_user_id = (select user_id from wards where id = $1)
           and c.state = 'ended'
           and c.created_at >= now() - interval '7 days') as this_week,
        (select count(*) from calls c
         where c.callee_user_id = (select user_id from wards where id = $1)
           and c.state = 'ended'
           and c.created_at >= now() - interval '14 days'
           and c.created_at < now() - interval '7 days') as last_week`,
      [wardId],
    );
    const thisWeek = parseInt(result.rows[0]?.this_week || '0', 10);
    const lastWeek = parseInt(result.rows[0]?.last_week || '0', 10);
    return thisWeek - lastWeek;
  }

  async getWardMoodStats(wardId: string) {
    const result = await this.pool.query<{ mood: string; count: string }>(
      `select mood, count(*) as count
       from call_summaries
       where ward_id = $1
         and mood is not null
       group by mood`,
      [wardId],
    );
    let positive = 0;
    let negative = 0;
    let neutral = 0;
    for (const row of result.rows) {
      const count = parseInt(row.count, 10);
      if (row.mood === 'positive') positive = count;
      else if (row.mood === 'negative') negative = count;
      else neutral = count;
    }
    const total = positive + negative + neutral;
    if (total === 0) {
      return { positive: 0, negative: 0 };
    }
    return {
      positive: Math.round((positive / total) * 100),
      negative: Math.round((negative / total) * 100),
    };
  }

  async getHealthAlerts(guardianId: string, limit: number = 5) {
    const result = await this.pool.query<{
      id: string;
      alert_type: string;
      message: string;
      is_read: boolean;
      created_at: string;
    }>(
      `select id, alert_type, message, is_read, created_at
       from health_alerts
       where guardian_id = $1
       order by created_at desc
       limit $2`,
      [guardianId, limit],
    );
    return result.rows.map((row) => ({
      id: row.id,
      type: row.alert_type,
      message: row.message,
      date: row.created_at.split('T')[0],
      isRead: row.is_read,
    }));
  }

  async getRecentCallSummaries(wardId: string, limit: number = 5) {
    const result = await this.pool.query<{
      id: string;
      call_id: string;
      summary: string | null;
      mood: string | null;
      tags: string[] | null;
      created_at: string;
      call_duration: string | null;
    }>(
      `select
        cs.id, cs.call_id, cs.summary, cs.mood, cs.tags, cs.created_at,
        extract(epoch from (c.ended_at - c.answered_at))/60 as call_duration
       from call_summaries cs
       left join calls c on cs.call_id = c.call_id
       where cs.ward_id = $1
       order by cs.created_at desc
       limit $2`,
      [wardId, limit],
    );
    return result.rows.map((row) => ({
      id: row.id,
      date: row.created_at,
      duration: Math.round(parseFloat(row.call_duration || '0')),
      summary: row.summary || '',
      tags: row.tags || [],
      mood: row.mood || 'neutral',
    }));
  }

  // ============================================================
  // Report related methods
  // ============================================================

  async getEmotionTrend(wardId: string, days: number) {
    const result = await this.pool.query<{
      date: string;
      score: string | null;
      mood: string | null;
    }>(
      `select
        to_char(created_at, 'YYYY-MM-DD') as date,
        avg(mood_score) as score,
        mode() within group (order by mood) as mood
       from call_summaries
       where ward_id = $1
         and created_at >= now() - ($2 || ' days')::interval
       group by to_char(created_at, 'YYYY-MM-DD')
       order by date`,
      [wardId, days.toString()],
    );
    return result.rows.map((row) => ({
      date: row.date,
      score: parseFloat(row.score || '0'),
      mood: row.mood || 'neutral',
    }));
  }

  async getHealthKeywordStats(wardId: string, days: number) {
    const result = await this.pool.query<{
      health_keywords: Record<string, unknown> | null;
    }>(
      `select health_keywords
       from call_summaries
       where ward_id = $1
         and created_at >= now() - ($2 || ' days')::interval
         and health_keywords is not null`,
      [wardId, days.toString()],
    );

    const keywordCounts: Record<string, number> = {};
    for (const row of result.rows) {
      if (row.health_keywords) {
        for (const [key, value] of Object.entries(row.health_keywords)) {
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
    const result = await this.pool.query<{ tags: string[] | null }>(
      `select tags
       from call_summaries
       where ward_id = $1
         and created_at >= now() - ($2 || ' days')::interval
         and tags is not null`,
      [wardId, days.toString()],
    );

    const topicCounts: Record<string, number> = {};
    for (const row of result.rows) {
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
    const result = await this.pool.query<{
      summary: string | null;
      mood: string | null;
      health_keywords: Record<string, unknown> | null;
    }>(
      `select summary, mood, health_keywords
       from call_summaries
       where ward_id = $1
         and created_at >= now() - ($2 || ' days')::interval
       order by created_at desc`,
      [wardId, days.toString()],
    );
    return result.rows;
  }
}
