import { Module } from '@nestjs/common';
import { GuardiansController } from './guardians.controller';
import { GuardiansService } from './guardians.service';
import { AuthService } from '../auth/auth.service';
import { DbService } from '../db.service';

@Module({
  controllers: [GuardiansController],
  providers: [GuardiansService, AuthService, DbService],
  exports: [GuardiansService],
})
export class GuardiansModule {}
