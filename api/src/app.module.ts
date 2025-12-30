import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PushService } from './push.service';
import { NotificationScheduler } from './notification.scheduler';
import { AiService } from './ai.service';
import { CommonModule } from './common/common.module';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { GuardiansModule } from './guardians/guardians.module';
import { WardsModule } from './wards/wards.module';
import { CallsModule } from './calls/calls.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    CommonModule,
    DatabaseModule,
    AuthModule,
    UsersModule,
    GuardiansModule,
    WardsModule,
    CallsModule,
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
