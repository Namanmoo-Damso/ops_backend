/**
 * Device Repository
 * devices 테이블 관련 메서드
 */
import { Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { DeviceRow, UserRow } from '../types';

@Injectable()
export class DeviceRepository {
  constructor(private readonly pool: Pool) {}

  async upsert(
    user: UserRow,
    params: {
      platform: string;
      env: string;
      apnsToken?: string;
      voipToken?: string;
      supportsCallKit?: boolean;
    },
  ): Promise<{ user: UserRow; device: DeviceRow | undefined }> {
    const supportsCallKit = params.supportsCallKit ?? true;
    let device: DeviceRow | undefined;

    if (params.apnsToken) {
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

  async listByIdentity(params: {
    identity: string;
    env?: string;
    tokenType?: 'apns' | 'voip';
  }): Promise<DeviceRow[]> {
    const env = params.env ?? 'production';
    const tokenColumn = params.tokenType === 'voip' ? 'voip_token' : 'apns_token';
    const result = await this.pool.query<DeviceRow>(
      `select d.id, d.user_id, d.platform, d.apns_token, d.voip_token, d.supports_callkit, d.env, d.last_seen
       from devices d
       join users u on d.user_id = u.id
       where u.identity = $1
         and d.env = $2
         and d.${tokenColumn} is not null`,
      [params.identity, env],
    );
    return result.rows;
  }

  async listAllByIdentity(params: { identity: string; env?: string }): Promise<DeviceRow[]> {
    const env = params.env ?? 'production';
    const result = await this.pool.query<DeviceRow>(
      `select d.id, d.user_id, d.platform, d.apns_token, d.voip_token, d.supports_callkit, d.env, d.last_seen
       from devices d
       join users u on d.user_id = u.id
       where u.identity = $1
         and d.env = $2
         and (d.apns_token is not null or d.voip_token is not null)`,
      [params.identity, env],
    );
    return result.rows;
  }

  async findUserByToken(params: {
    tokenType: 'apns' | 'voip';
    token: string;
    env?: string;
  }): Promise<(UserRow & { device_id: string }) | undefined> {
    const tokenColumn = params.tokenType === 'voip' ? 'voip_token' : 'apns_token';
    const env = params.env ?? 'production';
    const result = await this.pool.query<UserRow & { device_id: string }>(
      `select u.id, u.identity, u.display_name, u.user_type, u.email, u.nickname,
              u.profile_image_url, u.kakao_id, u.created_at, u.updated_at, d.id as device_id
       from devices d
       join users u on d.user_id = u.id
       where d.${tokenColumn} = $1 and d.env = $2
       limit 1`,
      [params.token, env],
    );
    return result.rows[0];
  }

  async list(params: { tokenType: 'apns' | 'voip'; env?: string }): Promise<DeviceRow[]> {
    const tokenColumn = params.tokenType === 'voip' ? 'voip_token' : 'apns_token';
    const env = params.env ?? 'production';
    const result = await this.pool.query<DeviceRow>(
      `select id, user_id, platform, apns_token, voip_token, supports_callkit, env, last_seen
       from devices
       where ${tokenColumn} is not null and env = $1`,
      [env],
    );
    return result.rows;
  }

  async invalidateToken(tokenType: 'apns' | 'voip', token: string): Promise<void> {
    const tokenColumn = tokenType === 'voip' ? 'voip_token' : 'apns_token';
    await this.pool.query(
      `update devices set ${tokenColumn} = null where ${tokenColumn} = $1`,
      [token],
    );
  }
}
