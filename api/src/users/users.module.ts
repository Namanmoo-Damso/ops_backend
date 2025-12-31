import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { AuthService } from '../auth';
import { AppService } from '../app.service';

@Module({
  controllers: [UsersController],
  providers: [UsersService, AuthService, AppService],
  exports: [UsersService],
})
export class UsersModule {}
