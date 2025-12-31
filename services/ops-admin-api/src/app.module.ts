import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

// 공용 모듈
import { CommonModule } from './common';
import { PrismaModule } from './prisma';
import { PushModule } from './push';
import { InfrastructureModule } from './infrastructure';
import { InternalModule } from './internal';

// Admin 도메인 모듈
import { AdminAuthController } from './admin-auth/admin-auth.controller';
import { AdminAuthService } from './admin-auth/admin-auth.service';
import { DashboardController } from './dashboard/dashboard.controller';
import { WardsManagementController } from './wards-management/wards-management.controller';
import { LocationsController } from './locations/locations.controller';
import { EmergenciesController } from './emergencies/emergencies.controller';
import { AuthService } from './auth';
import {
  DashboardRepository,
  LocationRepository,
  WardRepository,
  EmergencyRepository,
  AdminRepository,
  UserRepository,
} from './database/repositories';

@Module({
  imports: [
    MulterModule.register({
      storage: memoryStorage(),
    }),
    CommonModule,
    PrismaModule,
    PushModule,
    InfrastructureModule,
    InternalModule,
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
})
export class AppModule {}
