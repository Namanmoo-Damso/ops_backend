/**
 * ops-admin-api용 AppModule 템플릿
 * 멀티 레포 분리 시 ops-admin-api 레포에서 사용
 * Admin 모듈만 포함 (평탄화 후)
 *
 * Note: 분리 후에는 admin/ 서브폴더 구조가 루트 레벨로 평탄화됨
 * - admin/auth → auth
 * - admin/dashboard → dashboard
 * - admin/emergencies → emergencies
 * - admin/locations → locations
 * - admin/wards-management → wards-management
 */
import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

// 공용 모듈
import { CommonModule } from './common';
import { PrismaModule } from './prisma';

// Admin 도메인 모듈 (평탄화 후 경로)
// import { AdminAuthModule } from './auth';
// import { DashboardModule } from './dashboard';
// import { EmergenciesModule } from './emergencies';
// import { LocationsModule } from './locations';
// import { WardsManagementModule } from './wards-management';

// 인프라
import { InfrastructureModule } from './infrastructure';
import { InternalModule } from './internal';

// 현재는 admin/ 구조 유지
import { AdminAuthController } from './admin/auth/admin-auth.controller';
import { AdminAuthService } from './admin/auth/admin-auth.service';
import { DashboardController } from './admin/dashboard/dashboard.controller';
import { WardsManagementController } from './admin/wards-management/wards-management.controller';
import { LocationsController } from './admin/locations/locations.controller';
import { EmergenciesController } from './admin/emergencies/emergencies.controller';
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
    // 공용 모듈
    CommonModule,
    PrismaModule,
    InfrastructureModule,
    // 서버 간 통신
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
