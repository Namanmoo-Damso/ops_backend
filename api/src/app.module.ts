import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DbService } from './db.service';
import { PushService } from './push.service';

@Module({
  imports: [],
  controllers: [AppController],
  providers: [AppService, DbService, PushService],
})
export class AppModule {}
