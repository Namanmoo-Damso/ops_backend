import { Module } from '@nestjs/common';
import { DevicesController } from './devices.controller';
import { AppService } from '../app.service';
import { AuthService } from '../auth/auth.service';
import { DbService } from '../db.service';
import { PushService } from '../push.service';

@Module({
  controllers: [DevicesController],
  providers: [AppService, AuthService, DbService, PushService],
})
export class DevicesModule {}
