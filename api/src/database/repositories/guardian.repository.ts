/**
 * Guardian Repository
 * guardians, guardian_ward_registrations, health_alerts, notification_settings 테이블 관련 메서드
 */
import { Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { GuardianRow, GuardianWardRegistrationRow } from '../types';

@Injectable()
export class GuardianRepository {
  constructor(private readonly pool: Pool) {}

  async create(params: {
    userId: string;
    wardEmail: string;
    wardPhoneNumber: string;
  }): Promise<GuardianRow> {
    const result = await this.pool.query<GuardianRow>(
      `insert into guardians (user_id, ward_email, ward_phone_number, updated_at)
       values ($1, $2, $3, now())
       returning id, user_id, ward_email, ward_phone_number, created_at, updated_at`,
      [params.userId, params.wardEmail, params.wardPhoneNumber],
    );
    return result.rows[0];
  }

  async findByUserId(userId: string): Promise<GuardianRow | undefined> {
    const result = await this.pool.query<GuardianRow>(
      `select id, user_id, ward_email, ward_phone_number, created_at, updated_at
       from guardians
       where user_id = $1
       limit 1`,
      [userId],
    );
    return result.rows[0];
  }

  async findById(guardianId: string): Promise<(GuardianRow & { user_nickname: string | null; user_profile_image_url: string | null }) | undefined> {
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

  async findByWardEmail(wardEmail: string): Promise<GuardianRow | undefined> {
    const result = await this.pool.query<GuardianRow>(
      `select id, user_id, ward_email, ward_phone_number, created_at, updated_at
       from guardians
       where ward_email = $1
       limit 1`,
      [wardEmail],
    );
    return result.rows[0];
  }

  async getWards(guardianId: string) {
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

  async createWardRegistration(params: {
    guardianId: string;
    wardEmail: string;
    wardPhoneNumber: string;
  }): Promise<GuardianWardRegistrationRow> {
    const result = await this.pool.query<GuardianWardRegistrationRow>(
      `insert into guardian_ward_registrations (guardian_id, ward_email, ward_phone_number, updated_at)
       values ($1, $2, $3, now())
       returning id, guardian_id, ward_email, ward_phone_number, linked_ward_id, created_at, updated_at`,
      [params.guardianId, params.wardEmail, params.wardPhoneNumber],
    );
    return result.rows[0];
  }

  async findWardRegistration(id: string, guardianId: string): Promise<GuardianWardRegistrationRow | undefined> {
    const result = await this.pool.query<GuardianWardRegistrationRow>(
      `select id, guardian_id, ward_email, ward_phone_number, linked_ward_id, created_at, updated_at
       from guardian_ward_registrations
       where id = $1 and guardian_id = $2
       limit 1`,
      [id, guardianId],
    );
    return result.rows[0];
  }

  async updateWardRegistration(params: {
    id: string;
    guardianId: string;
    wardEmail: string;
    wardPhoneNumber: string;
  }): Promise<GuardianWardRegistrationRow | undefined> {
    const result = await this.pool.query<GuardianWardRegistrationRow>(
      `update guardian_ward_registrations
       set ward_email = $3, ward_phone_number = $4, updated_at = now()
       where id = $1 and guardian_id = $2
       returning id, guardian_id, ward_email, ward_phone_number, linked_ward_id, created_at, updated_at`,
      [params.id, params.guardianId, params.wardEmail, params.wardPhoneNumber],
    );
    return result.rows[0];
  }

  async deleteWardRegistration(id: string, guardianId: string): Promise<boolean> {
    await this.pool.query(
      `update wards
       set guardian_id = null
       where id = (
         select linked_ward_id from guardian_ward_registrations
         where id = $1 and guardian_id = $2
       )`,
      [id, guardianId],
    );

    const result = await this.pool.query(
      `delete from guardian_ward_registrations
       where id = $1 and guardian_id = $2
       returning id`,
      [id, guardianId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async updatePrimaryWard(params: {
    guardianId: string;
    wardEmail: string;
    wardPhoneNumber: string;
  }): Promise<GuardianRow | undefined> {
    const result = await this.pool.query<GuardianRow>(
      `update guardians
       set ward_email = $2, ward_phone_number = $3, updated_at = now()
       where id = $1
       returning id, user_id, ward_email, ward_phone_number, created_at, updated_at`,
      [params.guardianId, params.wardEmail, params.wardPhoneNumber],
    );
    return result.rows[0];
  }

  async unlinkPrimaryWard(guardianId: string): Promise<void> {
    await this.pool.query(
      `update wards
       set guardian_id = null
       where guardian_id = $1`,
      [guardianId],
    );
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

  async createHealthAlert(params: {
    wardId: string;
    guardianId: string;
    alertType: 'warning' | 'info';
    message: string;
  }): Promise<{ id: string }> {
    const result = await this.pool.query<{ id: string }>(
      `insert into health_alerts (ward_id, guardian_id, alert_type, message)
       values ($1, $2, $3, $4)
       returning id`,
      [params.wardId, params.guardianId, params.alertType, params.message],
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
    return {
      call_reminder: true,
      call_complete: true,
      health_alert: true,
    };
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

  async upsertNotificationSettings(params: {
    userId: string;
    callReminder?: boolean;
    callComplete?: boolean;
    healthAlert?: boolean;
  }) {
    const result = await this.pool.query<{
      call_reminder: boolean;
      call_complete: boolean;
      health_alert: boolean;
    }>(
      `insert into notification_settings (user_id, call_reminder, call_complete, health_alert)
       values ($1, coalesce($2, true), coalesce($3, true), coalesce($4, true))
       on conflict (user_id) do update set
         call_reminder = coalesce($2, notification_settings.call_reminder),
         call_complete = coalesce($3, notification_settings.call_complete),
         health_alert = coalesce($4, notification_settings.health_alert),
         updated_at = now()
       returning call_reminder, call_complete, health_alert`,
      [params.userId, params.callReminder, params.callComplete, params.healthAlert],
    );
    return result.rows[0];
  }
}
