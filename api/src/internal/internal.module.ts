import { Module } from '@nestjs/common';
import { InternalController } from './internal.controller';
import { InternalAuthGuard } from './internal-auth.guard';
import { InternalApiClient } from './internal-api.client';
import { UsersModule } from '../users';
import { WardsModule } from '../wards';
import { DevicesModule } from '../devices';

/**
 * Internal Module
 * 서버 간 동기 통신 인프라 제공
 * - InternalController: 내부 API 엔드포인트
 * - InternalAuthGuard: 내부 API 인증
 * - InternalApiClient: 다른 서버로 요청 보내기
 */
@Module({
  imports: [UsersModule, WardsModule, DevicesModule],
  controllers: [InternalController],
  providers: [InternalAuthGuard, InternalApiClient],
  exports: [InternalAuthGuard, InternalApiClient],
})
export class InternalModule {}
