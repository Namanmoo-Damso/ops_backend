/**
 * User Domain Events
 * 사용자 관련 이벤트 정의
 */
export interface UserCreatedEvent {
  type: 'user.created';
  userId: string;
  identity: string;
  userType: 'guardian' | 'ward' | null;
  timestamp: Date;
}

export interface UserUpdatedEvent {
  type: 'user.updated';
  userId: string;
  identity: string;
  changes: {
    displayName?: string;
    email?: string;
    nickname?: string;
  };
  timestamp: Date;
}

export interface UserDeletedEvent {
  type: 'user.deleted';
  userId: string;
  identity: string;
  reason: 'unlink' | 'withdrawal' | 'admin';
  timestamp: Date;
}

export interface UserLoginEvent {
  type: 'user.login';
  userId: string;
  identity: string;
  provider: 'kakao' | 'anonymous' | 'admin';
  timestamp: Date;
}

export interface UserLogoutEvent {
  type: 'user.logout';
  userId: string;
  identity: string;
  timestamp: Date;
}

export type UserEvent =
  | UserCreatedEvent
  | UserUpdatedEvent
  | UserDeletedEvent
  | UserLoginEvent
  | UserLogoutEvent;

export const USER_EVENT_CHANNEL = 'ops:events:user';
