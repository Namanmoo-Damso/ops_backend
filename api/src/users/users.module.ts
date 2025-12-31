import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { UsersRepository } from './users.repository';
import { AuthModule } from '../auth';
import { AppService } from '../app.service';

@Module({
  imports: [AuthModule],
  controllers: [UsersController],
  providers: [UsersService, UsersRepository, AppService],
  exports: [UsersService, UsersRepository],
})
export class UsersModule {}
