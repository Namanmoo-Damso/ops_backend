import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthService } from './auth.service';
import { DbService } from './db.service';
import { PushService } from './push.service';
import { NotificationScheduler } from './notification.scheduler';
import { AiService } from './ai.service';

@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [AppController],
  providers: [AppService, AuthService, DbService, PushService, NotificationScheduler, AiService],
})
export class AppModule {}
