/**
 * Call Domain Events
 * 통화 관련 이벤트 정의
 */
export interface CallStartedEvent {
  type: 'call.started';
  callId: string;
  roomName: string;
  callerIdentity: string;
  calleeIdentity: string;
  timestamp: Date;
}

export interface CallAnsweredEvent {
  type: 'call.answered';
  callId: string;
  roomName: string;
  callerIdentity: string;
  calleeIdentity: string;
  timestamp: Date;
}

export interface CallEndedEvent {
  type: 'call.ended';
  callId: string;
  roomName: string;
  duration: number;
  endReason: 'completed' | 'missed' | 'cancelled' | 'error';
  timestamp: Date;
}

export interface CallSummaryCreatedEvent {
  type: 'call.summary_created';
  callId: string;
  wardId: string;
  summaryId: string;
  mood: string | null;
  healthKeywords: string[];
  timestamp: Date;
}

export type CallEvent =
  | CallStartedEvent
  | CallAnsweredEvent
  | CallEndedEvent
  | CallSummaryCreatedEvent;

export const CALL_EVENT_CHANNEL = 'ops:events:call';
