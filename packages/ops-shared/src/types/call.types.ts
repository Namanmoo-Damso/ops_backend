/**
 * Call Types
 */
export type RoomRow = {
  id: string;
  room_name: string;
  created_at: string;
};

export type RoomMemberRow = {
  identity: string;
  display_name: string | null;
  joined_at: string;
};

export type CallRow = {
  id: string;
  room_name: string;
  caller_identity: string;
  callee_identity: string;
  state: string;
  created_at: string;
  answered_at: string | null;
  ended_at: string | null;
};

export type CallSummaryRow = {
  id: string;
  call_id: string;
  ward_id: string;
  summary: string | null;
  mood: string | null;
  health_keywords: string[] | null;
  topics: string[] | null;
  pain_mentions: string[] | null;
  analyzed_at: string;
};
