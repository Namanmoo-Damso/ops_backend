/**
 * Event Bus Interface
 * 서버 간 비동기 이벤트 통신을 위한 인터페이스
 */
export interface EventBus {
  /**
   * 이벤트 발행
   * @param channel 채널명 (예: 'call.started', 'user.created')
   * @param event 이벤트 데이터
   */
  publish<T>(channel: string, event: T): Promise<void>;

  /**
   * 이벤트 구독
   * @param channel 채널명
   * @param handler 이벤트 핸들러
   */
  subscribe<T>(channel: string, handler: (event: T) => void): void;

  /**
   * 구독 해제
   * @param channel 채널명
   */
  unsubscribe(channel: string): void;
}

export const EVENT_BUS = Symbol('EVENT_BUS');
