import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthService } from './auth.service';
import { DbService } from './db.service';
import { PushService } from './push.service';

@Module({
  imports: [],
  controllers: [AppController],
  providers: [AppService, AuthService, DbService, PushService],
})
export class AppModule {}
