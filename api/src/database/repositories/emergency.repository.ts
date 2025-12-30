/**
 * Emergency Repository
 * emergencies, emergency_contacts, emergency_agencies 테이블 관련 메서드
 */
import { Injectable } from '@nestjs/common';
import { Pool } from 'pg';

type EmergencyResult = {
  id: string;
  ward_id: string;
  type: string;
  status: string;
  latitude: string | null;
  longitude: string | null;
  message: string | null;
  guardian_notified: boolean;
  created_at: string;
};

@Injectable()
export class EmergencyRepository {
  constructor(private readonly pool: Pool) {}

  async create(params: {
    wardId: string;
    type: 'manual' | 'ai_detected' | 'geofence' | 'admin';
    latitude?: number;
    longitude?: number;
    message?: string;
  }): Promise<EmergencyResult> {
    const result = await this.pool.query<EmergencyResult>(
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

  async updateGuardianNotified(emergencyId: string): Promise<void> {
    await this.pool.query(
      `update emergencies set guardian_notified = true where id = $1`,
      [emergencyId],
    );
  }

  async findNearbyAgencies(latitude: number, longitude: number, radiusKm: number = 5, limit: number = 5) {
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

  async createContact(params: {
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

  async getById(emergencyId: string) {
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

  async getList(params: {
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

  async getContacts(emergencyId: string) {
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

  async resolve(params: {
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
}
