/**
 * Call Repository
 * calls, call_summaries 테이블 관련 메서드
 */
import { Injectable } from '@nestjs/common';
import { Pool } from 'pg';

type CallResult = {
  call_id: string;
  state: string;
  created_at: string;
  answered_at?: string | null;
  ended_at?: string | null;
};

type CallSummaryRow = {
  id: string;
  call_id: string;
  ward_id: string | null;
  summary: string;
  mood: string;
  mood_score: number;
  tags: string[];
  health_keywords: Record<string, unknown>;
  created_at: string;
};

@Injectable()
export class CallRepository {
  constructor(private readonly pool: Pool) {}

  async findRinging(calleeIdentity: string, roomName: string, seconds: number): Promise<{ call_id: string } | undefined> {
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

  async create(params: {
    callerIdentity: string;
    calleeIdentity: string;
    callerUserId?: string;
    calleeUserId?: string;
    roomName: string;
  }): Promise<CallResult> {
    const result = await this.pool.query<CallResult>(
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

  async updateState(callId: string, state: 'answered' | 'ended'): Promise<CallResult | undefined> {
    const timestampColumn = state === 'answered' ? 'answered_at' : 'ended_at';
    const result = await this.pool.query<CallResult>(
      `update calls
       set state = $2, ${timestampColumn} = now()
       where call_id = $1
       returning call_id, state, answered_at, ended_at`,
      [callId, state],
    );
    return result.rows[0];
  }

  async getRecentSummaries(wardId: string, limit: number = 5) {
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

  async getSummariesForReport(wardId: string, days: number) {
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

  async getMissed(hoursAgo: number = 1) {
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

  async getWithWardInfo(callId: string) {
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

  async getForAnalysis(callId: string) {
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
        null as transcript
       from calls c
       left join wards w on c.callee_user_id = w.user_id
       where c.call_id = $1`,
      [callId],
    );
    return result.rows[0];
  }

  async createSummary(params: {
    callId: string;
    wardId: string | null;
    summary: string;
    mood: string;
    moodScore: number;
    tags: string[];
    healthKeywords: Record<string, unknown>;
  }): Promise<CallSummaryRow> {
    const result = await this.pool.query<CallSummaryRow>(
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

  async getRecentPainMentions(wardId: string, days: number): Promise<number> {
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

  async getSummary(callId: string): Promise<CallSummaryRow | undefined> {
    const result = await this.pool.query<CallSummaryRow>(
      `select id, call_id, ward_id, summary, mood, mood_score, tags, health_keywords, created_at
       from call_summaries
       where call_id = $1
       order by created_at desc
       limit 1`,
      [callId],
    );
    return result.rows[0];
  }
}
