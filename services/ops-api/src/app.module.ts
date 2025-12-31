/**
 * ops-api용 AppModule 템플릿
 * 멀티 레포 분리 시 ops-api 레포에서 사용
 * Admin 모듈 제외
 */
import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { CommonModule } from './common';
import { DatabaseModule } from './database';
import { AuthModule } from './auth';
import { UsersModule } from './users';
import { GuardiansModule } from './guardians';
import { WardsModule } from './wards';
import { CallsModule } from './calls';
import { RoomsModule } from './rooms';
import { RtcModule } from './rtc';
import { DevicesModule } from './devices';
import { PushModule } from './push';
import { AiModule } from './ai';
import { SchedulerModule } from './scheduler';
import { PrismaModule } from './prisma';
import { EventsModule } from './events';
import { InfrastructureModule } from './infrastructure';
import { InternalModule } from './internal';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    // 전역 모듈 (순서 중요)
    CommonModule,
    DatabaseModule,
    PrismaModule,
    PushModule,
    AiModule,
    EventsModule,
    InfrastructureModule,
    // 기능 모듈 (Admin 제외)
    AuthModule,
    UsersModule,
    GuardiansModule,
    WardsModule,
    CallsModule,
    RoomsModule,
    RtcModule,
    DevicesModule,
    SchedulerModule,
    // 서버 간 통신
    InternalModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
