import { Module } from '@nestjs/common';
import { WardsController } from './wards.controller';
import { WardsService } from './wards.service';
import { WardsRepository } from './wards.repository';
import { AuthModule } from '../auth';

@Module({
  imports: [AuthModule],
  controllers: [WardsController],
  providers: [WardsService, WardsRepository],
  exports: [WardsService, WardsRepository],
})
export class WardsModule {}
