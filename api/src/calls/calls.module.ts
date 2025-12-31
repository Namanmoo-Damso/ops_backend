import { Module } from '@nestjs/common';
import { CallsController } from './calls.controller';
import { CallsService } from './calls.service';
import { CallsRepository } from './calls.repository';
import { SchedulerModule } from '../scheduler';

@Module({
  imports: [SchedulerModule],
  controllers: [CallsController],
  providers: [CallsService, CallsRepository],
  exports: [CallsService, CallsRepository],
})
export class CallsModule {}
