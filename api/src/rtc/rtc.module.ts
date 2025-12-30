import { Module } from '@nestjs/common';
import { RtcController } from './rtc.controller';
import { AppService } from '../app.service';
import { AuthService } from '../auth';

@Module({
  controllers: [RtcController],
  providers: [AppService, AuthService],
})
export class RtcModule {}
