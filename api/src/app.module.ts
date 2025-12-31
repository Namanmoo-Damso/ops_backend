import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CommonModule } from './common';
import { DatabaseModule } from './database';
import { AuthModule } from './auth';
import { UsersModule } from './users';
import { GuardiansModule } from './guardians';
import { WardsModule } from './wards';
import { CallsModule } from './calls';
import { RtcModule } from './rtc';
import { DevicesModule } from './devices';
import { PushModule, PushController } from './push';
import { AdminModule } from './admin';
import { AiModule } from './ai';
import { SchedulerModule } from './scheduler';
import { PrismaModule } from './prisma';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    // 전역 모듈 (순서 중요)
    CommonModule,
    DatabaseModule,
    PrismaModule,
    PushModule,
    AiModule,
    // 기능 모듈
    AuthModule,
    UsersModule,
    GuardiansModule,
    WardsModule,
    CallsModule,
    RtcModule,
    DevicesModule,
    AdminModule,
    SchedulerModule,
  ],
  controllers: [AppController, PushController],
  providers: [AppService],
})
export class AppModule {}
