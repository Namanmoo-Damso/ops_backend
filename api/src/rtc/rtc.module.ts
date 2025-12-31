import { Module } from '@nestjs/common';
import { RtcController } from './rtc.controller';
import { RtcRepository } from './rtc.repository';
import { AppService } from '../app.service';
import { AuthModule } from '../auth';

@Module({
  imports: [AuthModule],
  controllers: [RtcController],
  providers: [RtcRepository, AppService],
  exports: [RtcRepository],
})
export class RtcModule {}
