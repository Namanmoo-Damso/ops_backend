import { Module } from '@nestjs/common';
import { CallsController } from './calls.controller';
import { AppService } from '../app.service';
import { NotificationScheduler } from '../scheduler';

@Module({
  controllers: [CallsController],
  providers: [AppService, NotificationScheduler],
})
export class CallsModule {}
