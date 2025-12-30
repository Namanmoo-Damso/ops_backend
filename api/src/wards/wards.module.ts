import { Module } from '@nestjs/common';
import { WardsController } from './wards.controller';
import { WardsService } from './wards.service';
import { AuthService } from '../auth/auth.service';
import { DbService } from '../db.service';

@Module({
  controllers: [WardsController],
  providers: [WardsService, AuthService, DbService],
  exports: [WardsService],
})
export class WardsModule {}
