/**
 * Ward Repository
 * wards, organization_wards, call_schedules 테이블 관련 메서드
 */
import { Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { WardRow } from '../types';

@Injectable()
export class WardRepository {
  constructor(private readonly pool: Pool) {}

  async create(params: {
    userId: string;
    phoneNumber: string;
    guardianId: string | null;
  }): Promise<WardRow> {
    const result = await this.pool.query<WardRow>(
      `insert into wards (user_id, phone_number, guardian_id, updated_at)
       values ($1, $2, $3, now())
       returning id, user_id, phone_number, guardian_id, organization_id, ai_persona, weekly_call_count, call_duration_minutes, created_at, updated_at`,
      [params.userId, params.phoneNumber, params.guardianId],
    );
    return result.rows[0];
  }

  async findByUserId(userId: string): Promise<WardRow | undefined> {
    const result = await this.pool.query<WardRow>(
      `select id, user_id, phone_number, guardian_id, organization_id, ai_persona, weekly_call_count, call_duration_minutes, created_at, updated_at
       from wards
       where user_id = $1
       limit 1`,
      [userId],
    );
    return result.rows[0];
  }

  async findById(wardId: string): Promise<WardRow | undefined> {
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

  async findByGuardianId(guardianId: string): Promise<(WardRow & { user_nickname: string | null; user_profile_image_url: string | null }) | undefined> {
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

  async getCallStats(wardId: string) {
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

  async getWeeklyCallChange(wardId: string): Promise<number> {
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

  async getMoodStats(wardId: string) {
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

  async updateSettings(params: {
    wardId: string;
    aiPersona?: string;
    weeklyCallCount?: number;
    callDurationMinutes?: number;
  }): Promise<WardRow | undefined> {
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
      return undefined;
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

  async getWithGuardianInfo(wardId: string) {
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

  // Organization Wards methods
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
    uploadedByAdminId?: string;
    notes?: string;
  }) {
    const result = await this.pool.query<{
      id: string;
      organization_id: string;
      uploaded_by_admin_id: string | null;
      email: string;
      phone_number: string;
      name: string;
      birth_date: string | null;
      address: string | null;
      notes: string | null;
      is_registered: boolean;
      created_at: string;
    }>(
      `insert into organization_wards (organization_id, uploaded_by_admin_id, email, phone_number, name, birth_date, address, notes)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       returning id, organization_id, uploaded_by_admin_id, email, phone_number, name, birth_date, address, notes, is_registered, created_at`,
      [
        params.organizationId,
        params.uploadedByAdminId ?? null,
        params.email,
        params.phoneNumber,
        params.name,
        params.birthDate,
        params.address,
        params.notes ?? null,
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
      notes: string | null;
      is_registered: boolean;
      ward_id: string | null;
      uploaded_by_admin_id: string | null;
      created_at: string;
    }>(
      `select id, email, phone_number, name, birth_date, address, notes, is_registered, ward_id, uploaded_by_admin_id, created_at
       from organization_wards
       where organization_id = $1
       order by created_at desc`,
      [organizationId],
    );
    return result.rows;
  }

  async getMyManagedWards(adminId: string) {
    const result = await this.pool.query<{
      id: string;
      organization_id: string;
      organization_name: string;
      email: string;
      phone_number: string;
      name: string;
      birth_date: string | null;
      address: string | null;
      notes: string | null;
      is_registered: boolean;
      ward_id: string | null;
      created_at: string;
      last_call_at: string | null;
      total_calls: string;
      last_mood: string | null;
    }>(
      `select
        ow.id, ow.organization_id, o.name as organization_name,
        ow.email, ow.phone_number, ow.name, ow.birth_date, ow.address, ow.notes,
        ow.is_registered, ow.ward_id, ow.created_at,
        (select max(c.created_at) from calls c
         join wards w on c.callee_user_id = w.user_id
         where w.id = ow.ward_id) as last_call_at,
        (select count(*) from calls c
         join wards w on c.callee_user_id = w.user_id
         where w.id = ow.ward_id and c.state = 'ended')::text as total_calls,
        (select cs.mood from call_summaries cs
         where cs.ward_id = ow.ward_id
         order by cs.created_at desc limit 1) as last_mood
       from organization_wards ow
       join organizations o on ow.organization_id = o.id
       where ow.uploaded_by_admin_id = $1
       order by ow.created_at desc`,
      [adminId],
    );
    return result.rows;
  }

  async getMyManagedWardsStats(adminId: string) {
    const result = await this.pool.query<{
      total: string;
      registered: string;
      pending: string;
      positive_mood: string;
      negative_mood: string;
    }>(
      `select
        count(*)::text as total,
        count(*) filter (where is_registered = true)::text as registered,
        count(*) filter (where is_registered = false)::text as pending,
        (select count(*) from call_summaries cs
         join organization_wards ow2 on cs.ward_id = ow2.ward_id
         where ow2.uploaded_by_admin_id = $1 and cs.mood = 'positive')::text as positive_mood,
        (select count(*) from call_summaries cs
         join organization_wards ow2 on cs.ward_id = ow2.ward_id
         where ow2.uploaded_by_admin_id = $1 and cs.mood = 'negative')::text as negative_mood
       from organization_wards
       where uploaded_by_admin_id = $1`,
      [adminId],
    );
    return {
      total: parseInt(result.rows[0]?.total || '0', 10),
      registered: parseInt(result.rows[0]?.registered || '0', 10),
      pending: parseInt(result.rows[0]?.pending || '0', 10),
      positiveMood: parseInt(result.rows[0]?.positive_mood || '0', 10),
      negativeMood: parseInt(result.rows[0]?.negative_mood || '0', 10),
    };
  }

  // Call Schedule methods
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

  async markReminderSent(scheduleId: string): Promise<void> {
    await this.pool.query(
      `update call_schedules set reminder_sent_at = now() where id = $1`,
      [scheduleId],
    );
  }
}
