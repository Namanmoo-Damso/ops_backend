export class PushResultDto {
  sent: number;
  failed: number;
}

export class InviteCallResponseDto {
  callId: string;
  roomName: string;
  state: string;
  deduped: boolean;
  push: {
    sent: number;
    failed: number;
    invalidTokens: string[];
    voip: PushResultDto;
    alert: PushResultDto;
  };
}

export class CallStateResponseDto {
  id: string;
  room_name: string;
  caller_identity: string;
  callee_identity: string;
  state: string;
  created_at: string;
  answered_at: string | null;
  ended_at: string | null;
}

export class CallSummaryResponseDto {
  id: string;
  callId: string;
  wardId: string;
  summary: string | null;
  mood: string | null;
  moodScore: number;
  tags: string[];
  healthKeywords: Record<string, unknown>;
  analyzedAt: string;
}
