import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AppService } from '../app.service';
import { DbService } from '../db.service';
import { PushService } from '../push.service';

@Module({
  controllers: [AuthController],
  providers: [AuthService, AppService, DbService, PushService],
  exports: [AuthService],
})
export class AuthModule {}
