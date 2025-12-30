import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { AdminAuthController } from './auth/admin-auth.controller';
import { AdminAuthService } from './auth/admin-auth.service';
import { DashboardController } from './dashboard/dashboard.controller';
import { WardsManagementController } from './wards-management/wards-management.controller';
import { LocationsController } from './locations/locations.controller';
import { EmergenciesController } from './emergencies/emergencies.controller';
import { AppService } from '../app.service';
import { AuthService } from '../auth/auth.service';
import { DbService } from '../db.service';
import { PushService } from '../push.service';

@Module({
  imports: [
    MulterModule.register({
      storage: memoryStorage(),
    }),
  ],
  controllers: [
    AdminAuthController,
    DashboardController,
    WardsManagementController,
    LocationsController,
    EmergenciesController,
  ],
  providers: [
    AdminAuthService,
    AppService,
    AuthService,
    DbService,
    PushService,
  ],
  exports: [AdminAuthService],
})
export class AdminModule {}
