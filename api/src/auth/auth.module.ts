import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthRepository } from './auth.repository';
import { AppService } from '../app.service';

@Module({
  controllers: [AuthController],
  providers: [AuthService, AuthRepository, AppService],
  exports: [AuthService, AuthRepository],
})
export class AuthModule {}
