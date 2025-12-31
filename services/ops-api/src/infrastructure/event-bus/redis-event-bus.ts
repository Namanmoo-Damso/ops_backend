import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { EventBus } from './event-bus.interface';

/**
 * Redis Pub/Sub 기반 Event Bus 구현
 */
@Injectable()
export class RedisEventBus implements EventBus, OnModuleDestroy {
  private readonly logger = new Logger(RedisEventBus.name);
  private readonly publisher: Redis;
  private readonly subscriber: Redis;
  private readonly handlers = new Map<string, (event: unknown) => void>();

  constructor() {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

    this.publisher = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => Math.min(times * 50, 2000),
    });

    this.subscriber = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => Math.min(times * 50, 2000),
    });

    this.subscriber.on('message', (channel, message) => {
      const handler = this.handlers.get(channel);
      if (handler) {
        try {
          const event = JSON.parse(message);
          handler(event);
        } catch (error) {
          this.logger.error(
            `Failed to parse event channel=${channel} error=${(error as Error).message}`,
          );
        }
      }
    });

    this.subscriber.on('error', (error) => {
      this.logger.error(`Redis subscriber error: ${error.message}`);
    });

    this.publisher.on('error', (error) => {
      this.logger.error(`Redis publisher error: ${error.message}`);
    });
  }

  async publish<T>(channel: string, event: T): Promise<void> {
    try {
      const message = JSON.stringify(event);
      await this.publisher.publish(channel, message);
      this.logger.debug(`Published event channel=${channel}`);
    } catch (error) {
      this.logger.error(
        `Failed to publish event channel=${channel} error=${(error as Error).message}`,
      );
      throw error;
    }
  }

  subscribe<T>(channel: string, handler: (event: T) => void): void {
    if (this.handlers.has(channel)) {
      this.logger.warn(`Already subscribed to channel=${channel}`);
      return;
    }

    this.handlers.set(channel, handler as (event: unknown) => void);
    this.subscriber.subscribe(channel, (err) => {
      if (err) {
        this.logger.error(
          `Failed to subscribe channel=${channel} error=${err.message}`,
        );
        this.handlers.delete(channel);
      } else {
        this.logger.log(`Subscribed to channel=${channel}`);
      }
    });
  }

  unsubscribe(channel: string): void {
    this.handlers.delete(channel);
    this.subscriber.unsubscribe(channel, (err) => {
      if (err) {
        this.logger.error(
          `Failed to unsubscribe channel=${channel} error=${err.message}`,
        );
      } else {
        this.logger.log(`Unsubscribed from channel=${channel}`);
      }
    });
  }

  async onModuleDestroy() {
    this.logger.log('Closing Redis connections');
    await this.publisher.quit();
    await this.subscriber.quit();
  }
}
