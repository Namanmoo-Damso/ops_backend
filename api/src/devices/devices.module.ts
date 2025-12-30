import { Module } from '@nestjs/common';
import { DevicesController } from './devices.controller';
import { AppService } from '../app.service';
import { AuthService } from '../auth';

@Module({
  controllers: [DevicesController],
  providers: [AppService, AuthService],
})
export class DevicesModule {}
