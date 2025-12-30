import { Module, Global } from '@nestjs/common';
import { DbService } from './db.service';

/**
 * 데이터베이스 모듈
 *
 * 현재는 DbService를 제공하며, 향후 Phase에서 다음과 같이 분리 예정:
 * - UsersRepository
 * - GuardiansRepository
 * - WardsRepository
 * - CallsRepository
 * - DevicesRepository
 * - 등등...
 *
 * @Global() 데코레이터로 전역 모듈로 등록
 */
@Global()
@Module({
  providers: [DbService],
  exports: [DbService],
})
export class DatabaseModule {}
