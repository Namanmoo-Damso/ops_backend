import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Pool } from 'pg';

type UserRow = {
  id: string;
  identity: string;
  display_name: string | null;
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
      `insert into users (identity, display_name)
       values ($1, $2)
       on conflict (identity)
       do update set display_name = excluded.display_name
       returning id, identity, display_name`,
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
      const result = await this.pool.query<DeviceRow>(
        `insert into devices (user_id, platform, apns_token, supports_callkit, env, last_seen)
         values ($1, $2, $3, $4, $5, now())
         on conflict (apns_token)
         do update set user_id = excluded.user_id,
           platform = excluded.platform,
           supports_callkit = excluded.supports_callkit,
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
      `select u.id, u.identity, u.display_name
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
}
