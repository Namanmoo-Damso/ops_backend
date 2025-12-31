#!/bin/bash
#
# flatten-admin.sh
# ops-admin-api 레포 생성 시 admin/ 모듈을 루트 레벨로 평탄화
#
# 사용법:
#   ./scripts/flatten-admin.sh <destination-path>
#
# 예시:
#   ./scripts/flatten-admin.sh ../ops-admin-api/src

set -e

if [ -z "$1" ]; then
  echo "Usage: $0 <destination-path>"
  echo "Example: $0 ../ops-admin-api/src"
  exit 1
fi

SRC="api/src/admin"
DST="$1"

echo "Flattening admin modules from $SRC to $DST"

# 대상 디렉토리 생성
mkdir -p "$DST"

# 각 모듈 복사
for dir in auth dashboard emergencies locations wards-management; do
  if [ -d "$SRC/$dir" ]; then
    echo "Copying $dir..."
    cp -r "$SRC/$dir" "$DST/"
  fi
done

# auth 모듈: admin-auth → auth 리네임
if [ -d "$DST/auth" ]; then
  echo "Renaming admin-auth files..."

  # 파일 리네임
  [ -f "$DST/auth/admin-auth.controller.ts" ] && \
    mv "$DST/auth/admin-auth.controller.ts" "$DST/auth/auth.controller.ts"

  [ -f "$DST/auth/admin-auth.service.ts" ] && \
    mv "$DST/auth/admin-auth.service.ts" "$DST/auth/auth.service.ts"

  # 클래스명 변경 (AdminAuth → Auth)
  find "$DST/auth" -name "*.ts" -exec sed -i 's/AdminAuthController/AuthController/g' {} \;
  find "$DST/auth" -name "*.ts" -exec sed -i 's/AdminAuthService/AuthService/g' {} \;

  # auth.module.ts 생성
  cat > "$DST/auth/auth.module.ts" << 'EOF'
import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AdminRepository } from '../database/repositories';

@Module({
  controllers: [AuthController],
  providers: [AuthService, AdminRepository],
  exports: [AuthService],
})
export class AuthModule {}
EOF
fi

# 각 모듈에 module.ts 생성
echo "Creating module files..."

# dashboard.module.ts
if [ -d "$DST/dashboard" ]; then
  cat > "$DST/dashboard/dashboard.module.ts" << 'EOF'
import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardRepository } from '../database/repositories';

@Module({
  controllers: [DashboardController],
  providers: [DashboardRepository],
})
export class DashboardModule {}
EOF
fi

# emergencies.module.ts
if [ -d "$DST/emergencies" ]; then
  cat > "$DST/emergencies/emergencies.module.ts" << 'EOF'
import { Module } from '@nestjs/common';
import { EmergenciesController } from './emergencies.controller';
import { EmergencyRepository, LocationRepository, WardRepository, UserRepository } from '../database/repositories';

@Module({
  controllers: [EmergenciesController],
  providers: [EmergencyRepository, LocationRepository, WardRepository, UserRepository],
})
export class EmergenciesModule {}
EOF
fi

# locations.module.ts
if [ -d "$DST/locations" ]; then
  cat > "$DST/locations/locations.module.ts" << 'EOF'
import { Module } from '@nestjs/common';
import { LocationsController } from './locations.controller';
import { LocationRepository, WardRepository } from '../database/repositories';

@Module({
  controllers: [LocationsController],
  providers: [LocationRepository, WardRepository],
})
export class LocationsModule {}
EOF
fi

# wards-management.module.ts
if [ -d "$DST/wards-management" ]; then
  cat > "$DST/wards-management/wards-management.module.ts" << 'EOF'
import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { WardsManagementController } from './wards-management.controller';
import { WardRepository, AdminRepository } from '../database/repositories';

@Module({
  imports: [
    MulterModule.register({
      storage: memoryStorage(),
    }),
  ],
  controllers: [WardsManagementController],
  providers: [WardRepository, AdminRepository],
})
export class WardsManagementModule {}
EOF
fi

# import 경로 수정
echo "Updating import paths..."
find "$DST" -name "*.ts" -exec sed -i "s|'../../app.service'|'../app.service'|g" {} \;
find "$DST" -name "*.ts" -exec sed -i "s|'../../auth'|'../auth'|g" {} \;
find "$DST" -name "*.ts" -exec sed -i "s|'../../push'|'../push'|g" {} \;
find "$DST" -name "*.ts" -exec sed -i "s|'../../database/repositories'|'../database/repositories'|g" {} \;

echo ""
echo "Done! Admin modules flattened to $DST"
echo ""
echo "Next steps:"
echo "1. Copy common/, prisma/, database/, infrastructure/, internal/ to $DST/../"
echo "2. Use app.module.ops-admin-api.ts as template for app.module.ts"
echo "3. Use main.ops-admin-api.ts as template for main.ts"
echo "4. Update package.json dependencies"
