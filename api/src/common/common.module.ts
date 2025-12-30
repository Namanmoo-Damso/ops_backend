import { Module, Global } from '@nestjs/common';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { AdminAuthGuard } from './guards/admin-auth.guard';
import { AuthService } from '../auth/auth.service';
import { DbService } from '../db.service';

/**
 * 공통 모듈
 * Guards, Decorators, Filters 등 공통 유틸리티 제공
 *
 * @Global() 데코레이터로 전역 모듈로 등록
 * - JwtAuthGuard, AdminAuthGuard를 다른 모듈에서 주입받아 사용 가능
 */
@Global()
@Module({
  providers: [
    JwtAuthGuard,
    AdminAuthGuard,
    AuthService,
    DbService,
  ],
  exports: [
    JwtAuthGuard,
    AdminAuthGuard,
    AuthService,
    DbService,
  ],
})
export class CommonModule {}
