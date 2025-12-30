/**
 * Location Repository
 * ward_locations, ward_current_locations 테이블 관련 메서드
 */
import { Injectable } from '@nestjs/common';
import { Pool } from 'pg';

@Injectable()
export class LocationRepository {
  constructor(private readonly pool: Pool) {}

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

  async upsertCurrentLocation(params: {
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

  async getAllCurrentLocations(organizationId?: string) {
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

  async getHistory(params: {
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

  async getCurrentLocation(wardId: string) {
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

  async updateStatus(wardId: string, status: 'normal' | 'warning' | 'emergency'): Promise<void> {
    await this.pool.query(
      `update ward_current_locations set status = $2, last_updated = now() where ward_id = $1`,
      [wardId, status],
    );
  }
}
