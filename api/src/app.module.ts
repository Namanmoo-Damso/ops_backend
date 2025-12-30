import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PushService } from './push.service';
import { NotificationScheduler } from './notification.scheduler';
import { AiService } from './ai.service';
import { CommonModule } from './common/common.module';
import { DatabaseModule } from './database/database.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    CommonModule,
    DatabaseModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    PushService,
    NotificationScheduler,
    AiService,
  ],
})
export class AppModule {}
