import { Module } from '@nestjs/common';
import { RtcController } from './rtc.controller';
import { RtcService } from './rtc.service';
import { RtcRepository } from './rtc.repository';
import { AuthModule } from '../auth';
import { DevicesModule } from '../devices';

@Module({
  imports: [AuthModule, DevicesModule],
  controllers: [RtcController],
  providers: [RtcService, RtcRepository],
  exports: [RtcService, RtcRepository],
})
export class RtcModule {}
