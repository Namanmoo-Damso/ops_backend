import { Module, Global, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';
import { DbService } from './db.service';
import {
  UserRepository,
  DeviceRepository,
  RoomRepository,
  CallRepository,
  GuardianRepository,
  WardRepository,
  AdminRepository,
  EmergencyRepository,
  LocationRepository,
  DashboardRepository,
} from './repositories';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Database Pool Provider
 * 모든 Repository에서 공유하는 PostgreSQL 연결 풀
 */
const DatabasePoolProvider = {
  provide: 'DATABASE_POOL',
  useFactory: async (): Promise<Pool> => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('Missing DATABASE_URL');
    }
    const pool = new Pool({ connectionString: databaseUrl });

    // Wait for DB connection
    let lastError: unknown;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      try {
        await pool.query('select 1');
        return pool;
      } catch (error) {
        lastError = error;
        await sleep(1000 + attempt * 500);
      }
    }
    throw lastError;
  },
};

/**
 * Repository Factory Providers
 * Pool을 주입받아 Repository 인스턴스 생성
 */
const RepositoryProviders = [
  {
    provide: UserRepository,
    useFactory: (pool: Pool) => new UserRepository(pool),
    inject: ['DATABASE_POOL'],
  },
  {
    provide: DeviceRepository,
    useFactory: (pool: Pool) => new DeviceRepository(pool),
    inject: ['DATABASE_POOL'],
  },
  {
    provide: RoomRepository,
    useFactory: (pool: Pool) => new RoomRepository(pool),
    inject: ['DATABASE_POOL'],
  },
  {
    provide: CallRepository,
    useFactory: (pool: Pool) => new CallRepository(pool),
    inject: ['DATABASE_POOL'],
  },
  {
    provide: GuardianRepository,
    useFactory: (pool: Pool) => new GuardianRepository(pool),
    inject: ['DATABASE_POOL'],
  },
  {
    provide: WardRepository,
    useFactory: (pool: Pool) => new WardRepository(pool),
    inject: ['DATABASE_POOL'],
  },
  {
    provide: AdminRepository,
    useFactory: (pool: Pool) => new AdminRepository(pool),
    inject: ['DATABASE_POOL'],
  },
  {
    provide: EmergencyRepository,
    useFactory: (pool: Pool) => new EmergencyRepository(pool),
    inject: ['DATABASE_POOL'],
  },
  {
    provide: LocationRepository,
    useFactory: (pool: Pool) => new LocationRepository(pool),
    inject: ['DATABASE_POOL'],
  },
  {
    provide: DashboardRepository,
    useFactory: (pool: Pool) => new DashboardRepository(pool),
    inject: ['DATABASE_POOL'],
  },
];

/**
 * 데이터베이스 모듈
 *
 * Repository 패턴으로 분리된 데이터베이스 레이어
 * - DbService: Facade (기존 인터페이스 유지)
 * - 10개 Repository: 도메인별 데이터 접근 로직
 *
 * @Global() 데코레이터로 전역 모듈로 등록
 */
@Global()
@Module({
  providers: [
    DatabasePoolProvider,
    ...RepositoryProviders,
    DbService,
  ],
  exports: [
    'DATABASE_POOL',
    DbService,
    UserRepository,
    DeviceRepository,
    RoomRepository,
    CallRepository,
    GuardianRepository,
    WardRepository,
    AdminRepository,
    EmergencyRepository,
    LocationRepository,
    DashboardRepository,
  ],
})
export class DatabaseModule {}
