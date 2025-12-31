import { Global, Module } from '@nestjs/common';
import { EVENT_BUS, RedisEventBus } from './event-bus';

/**
 * Infrastructure Module
 * 서버 간 통신 인프라 제공
 * - Event Bus (Redis Pub/Sub)
 */
@Global()
@Module({
  providers: [
    {
      provide: EVENT_BUS,
      useClass: RedisEventBus,
    },
  ],
  exports: [EVENT_BUS],
})
export class InfrastructureModule {}
