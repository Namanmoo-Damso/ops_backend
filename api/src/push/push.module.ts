import { Module } from '@nestjs/common';
import { PushController } from './push.controller';
import { AppService } from '../app.service';
import { AuthService } from '../auth/auth.service';
import { DbService } from '../db.service';
import { PushService } from '../push.service';

@Module({
  controllers: [PushController],
  providers: [AppService, AuthService, DbService, PushService],
})
export class PushModule {}
