import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { AuthService } from '../auth/auth.service';
import { DbService } from '../db.service';

@Module({
  controllers: [UsersController],
  providers: [UsersService, AuthService, DbService],
  exports: [UsersService],
})
export class UsersModule {}
