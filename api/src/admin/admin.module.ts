import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { AdminAuthController } from './auth/admin-auth.controller';
import { AdminAuthService } from './auth/admin-auth.service';
import { DashboardController } from './dashboard/dashboard.controller';
import { WardsManagementController } from './wards-management/wards-management.controller';
import { LocationsController } from './locations/locations.controller';
import { EmergenciesController } from './emergencies/emergencies.controller';
import { AuthService } from '../auth';
import {
  DashboardRepository,
  LocationRepository,
  WardRepository,
  EmergencyRepository,
  AdminRepository,
  UserRepository,
} from '../database/repositories';

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
    AuthService,
    DashboardRepository,
    LocationRepository,
    WardRepository,
    EmergencyRepository,
    AdminRepository,
    UserRepository,
  ],
  exports: [AdminAuthService],
})
export class AdminModule {}
