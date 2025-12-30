import { Module } from '@nestjs/common';
import { CallsController } from './calls.controller';
import { AppService } from '../app.service';
import { AiService } from '../ai.service';
import { NotificationScheduler } from '../notification.scheduler';
import { DbService } from '../db.service';
import { PushService } from '../push.service';

@Module({
  controllers: [CallsController],
  providers: [AppService, AiService, NotificationScheduler, DbService, PushService],
})
export class CallsModule {}
