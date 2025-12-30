/**
 * Dashboard Repository
 * 대시보드 통계 관련 메서드
 */
import { Injectable } from '@nestjs/common';
import { Pool } from 'pg';

@Injectable()
export class DashboardRepository {
  constructor(private readonly pool: Pool) {}

  async getOverview() {
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
}
