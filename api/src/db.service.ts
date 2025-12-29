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

type GuardianWardRegistrationRow = {
  id: string;
  guardian_id: string;
  ward_email: string;
  ward_phone_number: string;
  linked_ward_id: string | null;
  created_at: string;
  updated_at: string;
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

  // ============================================================
  // Guardian Ward Management methods
  // ============================================================

  async getGuardianWards(guardianId: string) {
    // 1차 등록 (guardians 테이블) + 추가 등록 (guardian_ward_registrations 테이블)
    // 연결된 ward 정보도 함께 조회
    const result = await this.pool.query<{
      id: string;
      ward_email: string;
      ward_phone_number: string;
      is_primary: boolean;
      linked_ward_id: string | null;
      ward_user_id: string | null;
      ward_nickname: string | null;
      ward_profile_image_url: string | null;
      last_call_at: string | null;
    }>(
      `-- Primary registration from guardians table
       select
         g.id,
         g.ward_email,
         g.ward_phone_number,
         true as is_primary,
         w.id as linked_ward_id,
         w.user_id as ward_user_id,
         u.nickname as ward_nickname,
         u.profile_image_url as ward_profile_image_url,
         (select max(c.created_at) from calls c where c.callee_user_id = w.user_id) as last_call_at
       from guardians g
       left join wards w on w.guardian_id = g.id
       left join users u on w.user_id = u.id
       where g.id = $1

       union all

       -- Additional registrations from guardian_ward_registrations table
       select
         gwr.id,
         gwr.ward_email,
         gwr.ward_phone_number,
         false as is_primary,
         gwr.linked_ward_id,
         w.user_id as ward_user_id,
         u.nickname as ward_nickname,
         u.profile_image_url as ward_profile_image_url,
         (select max(c.created_at) from calls c where c.callee_user_id = w.user_id) as last_call_at
       from guardian_ward_registrations gwr
       left join wards w on gwr.linked_ward_id = w.id
       left join users u on w.user_id = u.id
       where gwr.guardian_id = $1

       order by is_primary desc, ward_email`,
      [guardianId],
    );
    return result.rows;
  }

  async createGuardianWardRegistration(params: {
    guardianId: string;
    wardEmail: string;
    wardPhoneNumber: string;
  }) {
    const result = await this.pool.query<GuardianWardRegistrationRow>(
      `insert into guardian_ward_registrations (guardian_id, ward_email, ward_phone_number, updated_at)
       values ($1, $2, $3, now())
       returning id, guardian_id, ward_email, ward_phone_number, linked_ward_id, created_at, updated_at`,
      [params.guardianId, params.wardEmail, params.wardPhoneNumber],
    );
    return result.rows[0];
  }

  async findGuardianWardRegistration(id: string, guardianId: string) {
    const result = await this.pool.query<GuardianWardRegistrationRow>(
      `select id, guardian_id, ward_email, ward_phone_number, linked_ward_id, created_at, updated_at
       from guardian_ward_registrations
       where id = $1 and guardian_id = $2
       limit 1`,
      [id, guardianId],
    );
    return result.rows[0];
  }

  async updateGuardianWardRegistration(params: {
    id: string;
    guardianId: string;
    wardEmail: string;
    wardPhoneNumber: string;
  }) {
    const result = await this.pool.query<GuardianWardRegistrationRow>(
      `update guardian_ward_registrations
       set ward_email = $3, ward_phone_number = $4, updated_at = now()
       where id = $1 and guardian_id = $2
       returning id, guardian_id, ward_email, ward_phone_number, linked_ward_id, created_at, updated_at`,
      [params.id, params.guardianId, params.wardEmail, params.wardPhoneNumber],
    );
    return result.rows[0];
  }

  async deleteGuardianWardRegistration(id: string, guardianId: string) {
    // 연결된 ward가 있으면 guardian_id를 null로 설정
    await this.pool.query(
      `update wards
       set guardian_id = null
       where id = (
         select linked_ward_id from guardian_ward_registrations
         where id = $1 and guardian_id = $2
       )`,
      [id, guardianId],
    );

    // registration 삭제
    const result = await this.pool.query(
      `delete from guardian_ward_registrations
       where id = $1 and guardian_id = $2
       returning id`,
      [id, guardianId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async updateGuardianPrimaryWard(params: {
    guardianId: string;
    wardEmail: string;
    wardPhoneNumber: string;
  }) {
    // 1차 등록 정보 (guardians 테이블) 수정
    const result = await this.pool.query<GuardianRow>(
      `update guardians
       set ward_email = $2, ward_phone_number = $3, updated_at = now()
       where id = $1
       returning id, user_id, ward_email, ward_phone_number, created_at, updated_at`,
      [params.guardianId, params.wardEmail, params.wardPhoneNumber],
    );
    return result.rows[0];
  }

  async unlinkPrimaryWard(guardianId: string) {
    // 1차 등록된 ward의 연결 해제 (wards.guardian_id = null)
    await this.pool.query(
      `update wards
       set guardian_id = null
       where guardian_id = $1`,
      [guardianId],
    );
  }

  // ============================================================
  // Ward Settings methods
  // ============================================================

  async updateWardSettings(params: {
    wardId: string;
    aiPersona?: string;
    weeklyCallCount?: number;
    callDurationMinutes?: number;
  }) {
    const updates: string[] = [];
    const values: (string | number)[] = [];
    let paramIndex = 1;

    if (params.aiPersona !== undefined) {
      updates.push(`ai_persona = $${paramIndex++}`);
      values.push(params.aiPersona);
    }
    if (params.weeklyCallCount !== undefined) {
      updates.push(`weekly_call_count = $${paramIndex++}`);
      values.push(params.weeklyCallCount);
    }
    if (params.callDurationMinutes !== undefined) {
      updates.push(`call_duration_minutes = $${paramIndex++}`);
      values.push(params.callDurationMinutes);
    }

    if (updates.length === 0) {
      return this.findWardByUserId(params.wardId);
    }

    updates.push('updated_at = now()');
    values.push(params.wardId);

    const result = await this.pool.query<WardRow>(
      `update wards
       set ${updates.join(', ')}
       where user_id = $${paramIndex}
       returning id, user_id, phone_number, guardian_id, organization_id, ai_persona, weekly_call_count, call_duration_minutes, created_at, updated_at`,
      values,
    );
    return result.rows[0];
  }

  async getNotificationSettings(userId: string) {
    const result = await this.pool.query<{
      call_reminder: boolean;
      call_complete: boolean;
      health_alert: boolean;
    }>(
      `select call_reminder, call_complete, health_alert
       from notification_settings
       where user_id = $1
       limit 1`,
      [userId],
    );
    if (result.rows[0]) {
      return result.rows[0];
    }
    // 기본값 반환
    return {
      call_reminder: true,
      call_complete: true,
      health_alert: true,
    };
  }

  // ============================================================
  // Notification Scheduling methods
  // ============================================================

  async getUpcomingCallSchedules(dayOfWeek: number, startTime: string, endTime: string) {
    const result = await this.pool.query<{
      id: string;
      ward_id: string;
      ward_user_id: string;
      ward_identity: string;
      ai_persona: string;
      guardian_id: string | null;
      guardian_user_id: string | null;
      guardian_identity: string | null;
    }>(
      `select
        cs.id,
        cs.ward_id,
        w.user_id as ward_user_id,
        u.identity as ward_identity,
        w.ai_persona,
        w.guardian_id,
        g.user_id as guardian_user_id,
        gu.identity as guardian_identity
       from call_schedules cs
       join wards w on cs.ward_id = w.id
       join users u on w.user_id = u.id
       left join guardians g on w.guardian_id = g.id
       left join users gu on g.user_id = gu.id
       where cs.day_of_week = $1
         and cs.scheduled_time >= $2::time
         and cs.scheduled_time < $3::time
         and cs.is_active = true
         and (cs.reminder_sent_at is null or cs.reminder_sent_at < now() - interval '1 hour')`,
      [dayOfWeek, startTime, endTime],
    );
    return result.rows;
  }

  async markReminderSent(scheduleId: string) {
    await this.pool.query(
      `update call_schedules set reminder_sent_at = now() where id = $1`,
      [scheduleId],
    );
  }

  async getMissedCalls(hoursAgo: number = 1) {
    const result = await this.pool.query<{
      ward_id: string;
      ward_identity: string;
      guardian_identity: string;
      guardian_user_id: string;
    }>(
      `select
        w.id as ward_id,
        u.identity as ward_identity,
        gu.identity as guardian_identity,
        g.user_id as guardian_user_id
       from call_schedules cs
       join wards w on cs.ward_id = w.id
       join users u on w.user_id = u.id
       join guardians g on w.guardian_id = g.id
       join users gu on g.user_id = gu.id
       where cs.day_of_week = extract(dow from now() - ($1 || ' hours')::interval)::int
         and cs.is_active = true
         and cs.last_called_at < now() - ($1 || ' hours')::interval
         and not exists (
           select 1 from calls c
           where c.callee_user_id = w.user_id
             and c.state = 'ended'
             and c.created_at > now() - ($1 || ' hours')::interval
         )`,
      [hoursAgo.toString()],
    );
    return result.rows;
  }

  async getCallWithWardInfo(callId: string) {
    const result = await this.pool.query<{
      call_id: string;
      callee_user_id: string | null;
      callee_identity: string;
      ward_id: string | null;
      ward_ai_persona: string | null;
      guardian_id: string | null;
      guardian_user_id: string | null;
      guardian_identity: string | null;
    }>(
      `select
        c.call_id,
        c.callee_user_id,
        c.callee_identity,
        w.id as ward_id,
        w.ai_persona as ward_ai_persona,
        w.guardian_id,
        g.user_id as guardian_user_id,
        gu.identity as guardian_identity
       from calls c
       left join wards w on c.callee_user_id = w.user_id
       left join guardians g on w.guardian_id = g.id
       left join users gu on g.user_id = gu.id
       where c.call_id = $1`,
      [callId],
    );
    return result.rows[0];
  }

  async createHealthAlert(params: {
    wardId: string;
    guardianId: string;
    alertType: 'warning' | 'info';
    message: string;
  }) {
    const result = await this.pool.query<{ id: string }>(
      `insert into health_alerts (ward_id, guardian_id, alert_type, message)
       values ($1, $2, $3, $4)
       returning id`,
      [params.wardId, params.guardianId, params.alertType, params.message],
    );
    return result.rows[0];
  }

  async getGuardianNotificationSettings(guardianUserId: string) {
    const result = await this.pool.query<{
      call_complete: boolean;
      health_alert: boolean;
    }>(
      `select call_complete, health_alert
       from notification_settings
       where user_id = $1
       limit 1`,
      [guardianUserId],
    );
    if (result.rows[0]) {
      return result.rows[0];
    }
    return { call_complete: true, health_alert: true };
  }

  // ============================================================
  // Call Analysis methods
  // ============================================================

  async getCallForAnalysis(callId: string) {
    const result = await this.pool.query<{
      call_id: string;
      callee_user_id: string | null;
      ward_id: string | null;
      guardian_id: string | null;
      duration: number | null;
      transcript: string | null;
    }>(
      `select
        c.call_id,
        c.callee_user_id,
        w.id as ward_id,
        w.guardian_id,
        extract(epoch from (c.ended_at - c.answered_at))/60 as duration,
        null as transcript  -- 추후 녹취록 연동 시 확장
       from calls c
       left join wards w on c.callee_user_id = w.user_id
       where c.call_id = $1`,
      [callId],
    );
    return result.rows[0];
  }

  async createCallSummary(params: {
    callId: string;
    wardId: string | null;
    summary: string;
    mood: string;
    moodScore: number;
    tags: string[];
    healthKeywords: Record<string, unknown>;
  }) {
    const result = await this.pool.query<{
      id: string;
      call_id: string;
      ward_id: string | null;
      summary: string;
      mood: string;
      mood_score: number;
      tags: string[];
      health_keywords: Record<string, unknown>;
      created_at: string;
    }>(
      `insert into call_summaries (call_id, ward_id, summary, mood, mood_score, tags, health_keywords)
       values ($1, $2, $3, $4, $5, $6, $7)
       returning id, call_id, ward_id, summary, mood, mood_score, tags, health_keywords, created_at`,
      [
        params.callId,
        params.wardId,
        params.summary,
        params.mood,
        params.moodScore,
        params.tags,
        JSON.stringify(params.healthKeywords),
      ],
    );
    return result.rows[0];
  }

  async getRecentPainMentions(wardId: string, days: number) {
    const result = await this.pool.query<{ count: string }>(
      `select count(*) as count
       from call_summaries
       where ward_id = $1
         and created_at > now() - ($2 || ' days')::interval
         and (health_keywords->>'pain')::int > 0`,
      [wardId, days.toString()],
    );
    return parseInt(result.rows[0]?.count || '0', 10);
  }

  async getCallSummary(callId: string) {
    const result = await this.pool.query<{
      id: string;
      call_id: string;
      ward_id: string | null;
      summary: string;
      mood: string;
      mood_score: number;
      tags: string[];
      health_keywords: Record<string, unknown>;
      created_at: string;
    }>(
      `select id, call_id, ward_id, summary, mood, mood_score, tags, health_keywords, created_at
       from call_summaries
       where call_id = $1
       order by created_at desc
       limit 1`,
      [callId],
    );
    return result.rows[0];
  }

  // ============================================================
  // Organization Wards methods (CSV bulk upload)
  // ============================================================

  async findOrganization(organizationId: string) {
    const result = await this.pool.query<{
      id: string;
      name: string;
      created_at: string;
    }>(
      `select id, name, created_at from organizations where id = $1`,
      [organizationId],
    );
    return result.rows[0];
  }

  async findOrganizationWard(organizationId: string, email: string) {
    const result = await this.pool.query<{
      id: string;
      organization_id: string;
      email: string;
    }>(
      `select id, organization_id, email
       from organization_wards
       where organization_id = $1 and email = $2
       limit 1`,
      [organizationId, email],
    );
    return result.rows[0];
  }

  async createOrganizationWard(params: {
    organizationId: string;
    email: string;
    phoneNumber: string;
    name: string;
    birthDate: string | null;
    address: string | null;
  }) {
    const result = await this.pool.query<{
      id: string;
      organization_id: string;
      email: string;
      phone_number: string;
      name: string;
      birth_date: string | null;
      address: string | null;
      is_registered: boolean;
      created_at: string;
    }>(
      `insert into organization_wards (organization_id, email, phone_number, name, birth_date, address)
       values ($1, $2, $3, $4, $5, $6)
       returning id, organization_id, email, phone_number, name, birth_date, address, is_registered, created_at`,
      [
        params.organizationId,
        params.email,
        params.phoneNumber,
        params.name,
        params.birthDate,
        params.address,
      ],
    );
    return result.rows[0];
  }

  async getOrganizationWards(organizationId: string) {
    const result = await this.pool.query<{
      id: string;
      email: string;
      phone_number: string;
      name: string;
      birth_date: string | null;
      address: string | null;
      is_registered: boolean;
      ward_id: string | null;
      created_at: string;
    }>(
      `select id, email, phone_number, name, birth_date, address, is_registered, ward_id, created_at
       from organization_wards
       where organization_id = $1
       order by created_at desc`,
      [organizationId],
    );
    return result.rows;
  }

  // ============================================================
  // Ward Location methods
  // ============================================================

  async createWardLocation(params: {
    wardId: string;
    latitude: number;
    longitude: number;
    accuracy: number | null;
    recordedAt: Date;
  }) {
    const result = await this.pool.query<{
      id: string;
      ward_id: string;
      latitude: string;
      longitude: string;
      accuracy: string | null;
      recorded_at: string;
      created_at: string;
    }>(
      `insert into ward_locations (ward_id, latitude, longitude, accuracy, recorded_at)
       values ($1, $2, $3, $4, $5)
       returning id, ward_id, latitude, longitude, accuracy, recorded_at, created_at`,
      [
        params.wardId,
        params.latitude,
        params.longitude,
        params.accuracy,
        params.recordedAt.toISOString(),
      ],
    );
    return result.rows[0];
  }

  async upsertWardCurrentLocation(params: {
    wardId: string;
    latitude: number;
    longitude: number;
    accuracy: number | null;
    status?: 'normal' | 'warning' | 'emergency';
  }) {
    const status = params.status || 'normal';
    const result = await this.pool.query<{
      ward_id: string;
      latitude: string;
      longitude: string;
      accuracy: string | null;
      status: string;
      last_updated: string;
    }>(
      `insert into ward_current_locations (ward_id, latitude, longitude, accuracy, status, last_updated)
       values ($1, $2, $3, $4, $5, now())
       on conflict (ward_id)
       do update set
         latitude = excluded.latitude,
         longitude = excluded.longitude,
         accuracy = excluded.accuracy,
         status = excluded.status,
         last_updated = now()
       returning ward_id, latitude, longitude, accuracy, status, last_updated`,
      [params.wardId, params.latitude, params.longitude, params.accuracy, status],
    );
    return result.rows[0];
  }

  async getAllWardCurrentLocations(organizationId?: string) {
    let query = `
      select
        wcl.ward_id,
        w.user_id,
        u.display_name as ward_name,
        u.nickname as ward_nickname,
        wcl.latitude,
        wcl.longitude,
        wcl.accuracy,
        wcl.status,
        wcl.last_updated,
        w.organization_id
      from ward_current_locations wcl
      join wards w on wcl.ward_id = w.id
      join users u on w.user_id = u.id
    `;
    const values: string[] = [];

    if (organizationId) {
      query += ` where w.organization_id = $1`;
      values.push(organizationId);
    }

    query += ` order by wcl.last_updated desc`;

    const result = await this.pool.query<{
      ward_id: string;
      user_id: string;
      ward_name: string | null;
      ward_nickname: string | null;
      latitude: string;
      longitude: string;
      accuracy: string | null;
      status: string;
      last_updated: string;
      organization_id: string | null;
    }>(query, values);

    return result.rows;
  }

  async getWardLocationHistory(params: {
    wardId: string;
    from?: Date;
    to?: Date;
    limit?: number;
  }) {
    const values: (string | number)[] = [params.wardId];
    let whereClause = 'where ward_id = $1';
    let paramIndex = 2;

    if (params.from) {
      whereClause += ` and recorded_at >= $${paramIndex++}`;
      values.push(params.from.toISOString());
    }

    if (params.to) {
      whereClause += ` and recorded_at <= $${paramIndex++}`;
      values.push(params.to.toISOString());
    }

    const limit = params.limit || 100;
    values.push(limit);

    const result = await this.pool.query<{
      id: string;
      latitude: string;
      longitude: string;
      accuracy: string | null;
      recorded_at: string;
    }>(
      `select id, latitude, longitude, accuracy, recorded_at
       from ward_locations
       ${whereClause}
       order by recorded_at desc
       limit $${paramIndex}`,
      values,
    );

    return result.rows;
  }

  async findWardById(wardId: string) {
    const result = await this.pool.query<WardRow>(
      `select id, user_id, phone_number, guardian_id, organization_id, ai_persona,
              weekly_call_count, call_duration_minutes, created_at, updated_at
       from wards
       where id = $1
       limit 1`,
      [wardId],
    );
    return result.rows[0];
  }

  async updateWardLocationStatus(wardId: string, status: 'normal' | 'warning' | 'emergency') {
    await this.pool.query(
      `update ward_current_locations set status = $2, last_updated = now() where ward_id = $1`,
      [wardId, status],
    );
  }

  // ============================================================
  // Emergency methods
  // ============================================================

  async createEmergency(params: {
    wardId: string;
    type: 'manual' | 'ai_detected' | 'geofence' | 'admin';
    latitude?: number;
    longitude?: number;
    message?: string;
  }) {
    const result = await this.pool.query<{
      id: string;
      ward_id: string;
      type: string;
      status: string;
      latitude: string | null;
      longitude: string | null;
      message: string | null;
      guardian_notified: boolean;
      created_at: string;
    }>(
      `insert into emergencies (ward_id, type, latitude, longitude, message)
       values ($1, $2, $3, $4, $5)
       returning id, ward_id, type, status, latitude, longitude, message, guardian_notified, created_at`,
      [
        params.wardId,
        params.type,
        params.latitude ?? null,
        params.longitude ?? null,
        params.message ?? null,
      ],
    );
    return result.rows[0];
  }

  async updateEmergencyGuardianNotified(emergencyId: string) {
    await this.pool.query(
      `update emergencies set guardian_notified = true where id = $1`,
      [emergencyId],
    );
  }

  async findNearbyAgencies(latitude: number, longitude: number, radiusKm: number = 5, limit: number = 5) {
    // Haversine formula를 사용한 거리 계산 (PostGIS 없이)
    const result = await this.pool.query<{
      id: string;
      name: string;
      type: string;
      phone_number: string;
      latitude: string;
      longitude: string;
      address: string | null;
      distance_km: string;
    }>(
      `select
        id, name, type, phone_number, latitude, longitude, address,
        (
          6371 * acos(
            cos(radians($1)) * cos(radians(latitude)) *
            cos(radians(longitude) - radians($2)) +
            sin(radians($1)) * sin(radians(latitude))
          )
        ) as distance_km
       from emergency_agencies
       where is_active = true
       having (
         6371 * acos(
           cos(radians($1)) * cos(radians(latitude)) *
           cos(radians(longitude) - radians($2)) +
           sin(radians($1)) * sin(radians(latitude))
         )
       ) <= $3
       order by distance_km
       limit $4`,
      [latitude, longitude, radiusKm, limit],
    );
    return result.rows;
  }

  async createEmergencyContact(params: {
    emergencyId: string;
    agencyId: string;
    distanceKm: number;
    responseStatus?: 'pending' | 'answered' | 'dispatched' | 'failed';
  }) {
    const status = params.responseStatus || 'pending';
    const result = await this.pool.query<{
      id: string;
      emergency_id: string;
      agency_id: string;
      distance_km: string;
      response_status: string;
      contacted_at: string;
    }>(
      `insert into emergency_contacts (emergency_id, agency_id, distance_km, response_status)
       values ($1, $2, $3, $4)
       returning id, emergency_id, agency_id, distance_km, response_status, contacted_at`,
      [params.emergencyId, params.agencyId, params.distanceKm, status],
    );
    return result.rows[0];
  }

  async getEmergencyById(emergencyId: string) {
    const result = await this.pool.query<{
      id: string;
      ward_id: string | null;
      type: string;
      status: string;
      latitude: string | null;
      longitude: string | null;
      message: string | null;
      guardian_notified: boolean;
      resolved_at: string | null;
      resolved_by: string | null;
      resolution_note: string | null;
      created_at: string;
      ward_name: string | null;
      ward_user_id: string | null;
    }>(
      `select
        e.id, e.ward_id, e.type, e.status, e.latitude, e.longitude,
        e.message, e.guardian_notified, e.resolved_at, e.resolved_by,
        e.resolution_note, e.created_at,
        u.nickname as ward_name,
        w.user_id as ward_user_id
       from emergencies e
       left join wards w on e.ward_id = w.id
       left join users u on w.user_id = u.id
       where e.id = $1`,
      [emergencyId],
    );
    return result.rows[0];
  }

  async getEmergencies(params: {
    status?: 'active' | 'resolved' | 'false_alarm';
    wardId?: string;
    limit?: number;
  }) {
    const values: (string | number)[] = [];
    const conditions: string[] = [];
    let paramIndex = 1;

    if (params.status) {
      conditions.push(`e.status = $${paramIndex++}`);
      values.push(params.status);
    }

    if (params.wardId) {
      conditions.push(`e.ward_id = $${paramIndex++}`);
      values.push(params.wardId);
    }

    const whereClause = conditions.length > 0 ? `where ${conditions.join(' and ')}` : '';
    const limit = params.limit || 50;
    values.push(limit);

    const result = await this.pool.query<{
      id: string;
      ward_id: string | null;
      type: string;
      status: string;
      latitude: string | null;
      longitude: string | null;
      message: string | null;
      guardian_notified: boolean;
      created_at: string;
      resolved_at: string | null;
      ward_name: string | null;
    }>(
      `select
        e.id, e.ward_id, e.type, e.status, e.latitude, e.longitude,
        e.message, e.guardian_notified, e.created_at, e.resolved_at,
        coalesce(u.nickname, u.display_name) as ward_name
       from emergencies e
       left join wards w on e.ward_id = w.id
       left join users u on w.user_id = u.id
       ${whereClause}
       order by e.created_at desc
       limit $${paramIndex}`,
      values,
    );
    return result.rows;
  }

  async getEmergencyContacts(emergencyId: string) {
    const result = await this.pool.query<{
      id: string;
      agency_id: string;
      agency_name: string;
      agency_type: string;
      distance_km: string;
      response_status: string;
      contacted_at: string;
    }>(
      `select
        ec.id, ec.agency_id, ea.name as agency_name, ea.type as agency_type,
        ec.distance_km, ec.response_status, ec.contacted_at
       from emergency_contacts ec
       join emergency_agencies ea on ec.agency_id = ea.id
       where ec.emergency_id = $1
       order by ec.distance_km`,
      [emergencyId],
    );
    return result.rows;
  }

  async resolveEmergency(params: {
    emergencyId: string;
    resolvedBy: string;
    status: 'resolved' | 'false_alarm';
    resolutionNote?: string;
  }) {
    const result = await this.pool.query<{
      id: string;
      status: string;
      resolved_at: string;
      resolved_by: string;
      resolution_note: string | null;
    }>(
      `update emergencies
       set status = $2, resolved_at = now(), resolved_by = $3, resolution_note = $4
       where id = $1
       returning id, status, resolved_at, resolved_by, resolution_note`,
      [params.emergencyId, params.status, params.resolvedBy, params.resolutionNote ?? null],
    );
    return result.rows[0];
  }

  async getWardWithGuardianInfo(wardId: string) {
    const result = await this.pool.query<{
      ward_id: string;
      ward_user_id: string;
      ward_identity: string;
      ward_name: string | null;
      guardian_id: string | null;
      guardian_user_id: string | null;
      guardian_identity: string | null;
    }>(
      `select
        w.id as ward_id,
        w.user_id as ward_user_id,
        u.identity as ward_identity,
        coalesce(u.nickname, u.display_name) as ward_name,
        w.guardian_id,
        g.user_id as guardian_user_id,
        gu.identity as guardian_identity
       from wards w
       join users u on w.user_id = u.id
       left join guardians g on w.guardian_id = g.id
       left join users gu on g.user_id = gu.id
       where w.id = $1`,
      [wardId],
    );
    return result.rows[0];
  }

  async getWardCurrentLocation(wardId: string) {
    const result = await this.pool.query<{
      ward_id: string;
      latitude: string;
      longitude: string;
      accuracy: string | null;
      status: string;
      last_updated: string;
    }>(
      `select ward_id, latitude, longitude, accuracy, status, last_updated
       from ward_current_locations
       where ward_id = $1`,
      [wardId],
    );
    return result.rows[0];
  }

  // ============================================================
  // Dashboard Statistics methods
  // ============================================================

  async getDashboardOverview() {
    const result = await this.pool.query<{
      total_wards: string;
      active_wards: string;
      total_guardians: string;
      total_organizations: string;
      total_calls: string;
      total_call_minutes: string;
    }>(
      `select
        (select count(*) from wards) as total_wards,
        (select count(distinct w.id) from wards w
         join ward_current_locations wcl on w.id = wcl.ward_id
         where wcl.last_updated > now() - interval '24 hours') as active_wards,
        (select count(*) from guardians) as total_guardians,
        (select count(*) from organizations) as total_organizations,
        (select count(*) from calls where state = 'ended') as total_calls,
        (select coalesce(sum(extract(epoch from (ended_at - answered_at))/60), 0)
         from calls where state = 'ended' and answered_at is not null) as total_call_minutes`,
    );
    return {
      totalWards: parseInt(result.rows[0].total_wards, 10),
      activeWards: parseInt(result.rows[0].active_wards, 10),
      totalGuardians: parseInt(result.rows[0].total_guardians, 10),
      totalOrganizations: parseInt(result.rows[0].total_organizations, 10),
      totalCalls: parseInt(result.rows[0].total_calls, 10),
      totalCallMinutes: Math.round(parseFloat(result.rows[0].total_call_minutes)),
    };
  }

  async getTodayStats() {
    const result = await this.pool.query<{
      calls: string;
      avg_duration: string | null;
      emergencies: string;
      new_registrations: string;
    }>(
      `select
        (select count(*) from calls
         where created_at >= current_date and state = 'ended') as calls,
        (select avg(extract(epoch from (ended_at - answered_at))/60)
         from calls
         where created_at >= current_date and state = 'ended' and answered_at is not null) as avg_duration,
        (select count(*) from emergencies
         where created_at >= current_date) as emergencies,
        (select count(*) from wards
         where created_at >= current_date) as new_registrations`,
    );
    return {
      calls: parseInt(result.rows[0].calls, 10),
      avgDuration: Math.round(parseFloat(result.rows[0].avg_duration || '0')),
      emergencies: parseInt(result.rows[0].emergencies, 10),
      newRegistrations: parseInt(result.rows[0].new_registrations, 10),
    };
  }

  async getWeeklyTrend() {
    // 최근 7일간의 통화 및 비상 현황
    const result = await this.pool.query<{
      day: string;
      day_label: string;
      calls: string;
      emergencies: string;
    }>(
      `with days as (
        select generate_series(
          current_date - interval '6 days',
          current_date,
          '1 day'::interval
        )::date as day
      )
      select
        d.day::text,
        to_char(d.day, 'Dy') as day_label,
        coalesce((
          select count(*) from calls c
          where c.created_at::date = d.day and c.state = 'ended'
        ), 0)::text as calls,
        coalesce((
          select count(*) from emergencies e
          where e.created_at::date = d.day
        ), 0)::text as emergencies
      from days d
      order by d.day`,
    );

    const dayLabels: Record<string, string> = {
      Mon: '월',
      Tue: '화',
      Wed: '수',
      Thu: '목',
      Fri: '금',
      Sat: '토',
      Sun: '일',
    };

    return {
      calls: result.rows.map((r) => parseInt(r.calls, 10)),
      emergencies: result.rows.map((r) => parseInt(r.emergencies, 10)),
      labels: result.rows.map((r) => dayLabels[r.day_label] || r.day_label),
    };
  }

  async getMoodDistribution() {
    const result = await this.pool.query<{
      positive: string;
      neutral: string;
      negative: string;
    }>(
      `select
        (select count(*) from call_summaries where mood = 'positive')::text as positive,
        (select count(*) from call_summaries where mood = 'neutral')::text as neutral,
        (select count(*) from call_summaries where mood = 'negative')::text as negative`,
    );
    const positive = parseInt(result.rows[0].positive, 10);
    const neutral = parseInt(result.rows[0].neutral, 10);
    const negative = parseInt(result.rows[0].negative, 10);
    const total = positive + neutral + negative;

    if (total === 0) {
      return { positive: 0, neutral: 0, negative: 0 };
    }

    return {
      positive: Math.round((positive / total) * 100),
      neutral: Math.round((neutral / total) * 100),
      negative: Math.round((negative / total) * 100),
    };
  }

  async getHealthAlertsSummary() {
    const result = await this.pool.query<{
      warning: string;
      info: string;
      unread: string;
    }>(
      `select
        (select count(*) from health_alerts where alert_type = 'warning')::text as warning,
        (select count(*) from health_alerts where alert_type = 'info')::text as info,
        (select count(*) from health_alerts where is_read = false)::text as unread`,
    );
    return {
      warning: parseInt(result.rows[0].warning, 10),
      info: parseInt(result.rows[0].info, 10),
      unread: parseInt(result.rows[0].unread, 10),
    };
  }

  async getTopHealthKeywords(limit: number = 5) {
    const result = await this.pool.query<{
      health_keywords: Record<string, unknown> | null;
    }>(
      `select health_keywords
       from call_summaries
       where health_keywords is not null
         and created_at > now() - interval '30 days'`,
    );

    const keywordCounts: Record<string, number> = {};
    const keywordLabels: Record<string, string> = {
      pain: '통증',
      sleep: '수면',
      meal: '식사',
      medication: '약 복용',
    };

    for (const row of result.rows) {
      if (row.health_keywords) {
        for (const [key, value] of Object.entries(row.health_keywords)) {
          if (typeof value === 'number') {
            keywordCounts[key] = (keywordCounts[key] || 0) + value;
          } else if (value) {
            keywordCounts[key] = (keywordCounts[key] || 0) + 1;
          }
        }
      }
    }

    return Object.entries(keywordCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([keyword, count]) => ({
        keyword: keywordLabels[keyword] || keyword,
        count,
      }));
  }

  async getOrganizationStats() {
    const result = await this.pool.query<{
      id: string;
      name: string;
      wards: string;
      calls: string;
    }>(
      `select
        o.id,
        o.name,
        (select count(*) from wards w where w.organization_id = o.id)::text as wards,
        (select count(*) from calls c
         join wards w on c.callee_user_id = w.user_id
         where w.organization_id = o.id and c.state = 'ended')::text as calls
       from organizations o
       order by wards desc`,
    );
    return result.rows.map((r) => ({
      id: r.id,
      name: r.name,
      wards: parseInt(r.wards, 10),
      calls: parseInt(r.calls, 10),
    }));
  }

  async getRealtimeStats() {
    const result = await this.pool.query<{
      active_calls: string;
      online_wards: string;
      pending_emergencies: string;
    }>(
      `select
        (select count(*) from calls where state = 'answered')::text as active_calls,
        (select count(*) from ward_current_locations
         where last_updated > now() - interval '5 minutes')::text as online_wards,
        (select count(*) from emergencies where status = 'active')::text as pending_emergencies`,
    );
    return {
      activeCalls: parseInt(result.rows[0].active_calls, 10),
      onlineWards: parseInt(result.rows[0].online_wards, 10),
      pendingEmergencies: parseInt(result.rows[0].pending_emergencies, 10),
    };
  }

  async getRecentActivity(limit: number = 10) {
    // 최근 통화 및 비상 상황 활동
    const callsResult = await this.pool.query<{
      type: string;
      ward_name: string | null;
      duration: string | null;
      time: string;
      created_at: string;
    }>(
      `(
        select
          'call_started' as type,
          u.nickname as ward_name,
          null as duration,
          to_char(c.created_at, 'HH24:MI') as time,
          c.created_at
        from calls c
        join users u on c.callee_user_id = u.id
        where c.state in ('ringing', 'answered')
          and c.created_at > now() - interval '1 hour'
      )
      union all
      (
        select
          'call_ended' as type,
          u.nickname as ward_name,
          extract(epoch from (c.ended_at - c.answered_at))/60 as duration,
          to_char(c.ended_at, 'HH24:MI') as time,
          c.ended_at as created_at
        from calls c
        join users u on c.callee_user_id = u.id
        where c.state = 'ended'
          and c.ended_at > now() - interval '1 hour'
          and c.answered_at is not null
      )
      union all
      (
        select
          'emergency' as type,
          u.nickname as ward_name,
          null as duration,
          to_char(e.created_at, 'HH24:MI') as time,
          e.created_at
        from emergencies e
        join wards w on e.ward_id = w.id
        join users u on w.user_id = u.id
        where e.created_at > now() - interval '24 hours'
      )
      order by created_at desc
      limit $1`,
      [limit],
    );

    return callsResult.rows.map((r) => ({
      type: r.type,
      wardName: r.ward_name || '알 수 없음',
      duration: r.duration ? Math.round(parseFloat(r.duration)) : undefined,
      time: r.time,
    }));
  }

  // ─────────────────────────────────────────────────────────────────────────
  // [관리자 관리] - Issue #18
  // ─────────────────────────────────────────────────────────────────────────

  async findAdminByProviderId(provider: string, providerId: string) {
    const result = await this.pool.query<{
      id: string;
      email: string;
      name: string | null;
      provider: string;
      provider_id: string;
      role: string;
      organization_id: string | null;
      is_active: boolean;
      last_login_at: string | null;
      created_at: string;
    }>(
      `select * from admins where provider = $1 and provider_id = $2`,
      [provider, providerId],
    );
    return result.rows[0] || null;
  }

  async findAdminByEmail(email: string) {
    const result = await this.pool.query<{
      id: string;
      email: string;
      name: string | null;
      provider: string;
      provider_id: string;
      role: string;
      organization_id: string | null;
      is_active: boolean;
      last_login_at: string | null;
      created_at: string;
    }>(
      `select * from admins where email = $1`,
      [email],
    );
    return result.rows[0] || null;
  }

  async findAdminById(adminId: string) {
    const result = await this.pool.query<{
      id: string;
      email: string;
      name: string | null;
      provider: string;
      provider_id: string;
      role: string;
      organization_id: string | null;
      is_active: boolean;
      last_login_at: string | null;
      created_at: string;
    }>(
      `select * from admins where id = $1`,
      [adminId],
    );
    return result.rows[0] || null;
  }

  async createAdmin(params: {
    email: string;
    name?: string;
    provider: string;
    providerId: string;
    role?: string;
    organizationId?: string;
  }) {
    const result = await this.pool.query<{ id: string }>(
      `insert into admins (email, name, provider, provider_id, role, organization_id)
       values ($1, $2, $3, $4, $5, $6)
       returning id`,
      [
        params.email,
        params.name || null,
        params.provider,
        params.providerId,
        params.role || 'viewer',
        params.organizationId || null,
      ],
    );
    return result.rows[0];
  }

  async updateAdminLastLogin(adminId: string) {
    await this.pool.query(
      `update admins set last_login_at = now(), updated_at = now() where id = $1`,
      [adminId],
    );
  }

  async getAdminPermissions(adminId: string) {
    const result = await this.pool.query<{ permission: string }>(
      `select permission from admin_permissions where admin_id = $1`,
      [adminId],
    );
    return result.rows.map((r) => r.permission);
  }

  async createAdminRefreshToken(adminId: string, tokenHash: string, expiresAt: Date) {
    const result = await this.pool.query<{ id: string }>(
      `insert into admin_refresh_tokens (admin_id, token_hash, expires_at)
       values ($1, $2, $3)
       returning id`,
      [adminId, tokenHash, expiresAt],
    );
    return result.rows[0];
  }

  async findAdminRefreshToken(tokenHash: string) {
    const result = await this.pool.query<{
      id: string;
      admin_id: string;
      expires_at: string;
    }>(
      `select id, admin_id, expires_at from admin_refresh_tokens
       where token_hash = $1 and expires_at > now()`,
      [tokenHash],
    );
    return result.rows[0] || null;
  }

  async deleteAdminRefreshToken(tokenHash: string) {
    await this.pool.query(
      `delete from admin_refresh_tokens where token_hash = $1`,
      [tokenHash],
    );
  }

  async deleteAllAdminRefreshTokens(adminId: string) {
    await this.pool.query(
      `delete from admin_refresh_tokens where admin_id = $1`,
      [adminId],
    );
  }

  async getAllAdmins() {
    const result = await this.pool.query<{
      id: string;
      email: string;
      name: string | null;
      provider: string;
      role: string;
      organization_id: string | null;
      organization_name: string | null;
      is_active: boolean;
      last_login_at: string | null;
      created_at: string;
    }>(
      `select a.*, o.name as organization_name
       from admins a
       left join organizations o on a.organization_id = o.id
       order by a.created_at desc`,
    );
    return result.rows;
  }

  async updateAdminRole(adminId: string, role: string, organizationId?: string) {
    await this.pool.query(
      `update admins set role = $1, organization_id = $2, updated_at = now() where id = $3`,
      [role, organizationId || null, adminId],
    );
  }

  async updateAdminActiveStatus(adminId: string, isActive: boolean) {
    await this.pool.query(
      `update admins set is_active = $1, updated_at = now() where id = $2`,
      [isActive, adminId],
    );
  }
}
