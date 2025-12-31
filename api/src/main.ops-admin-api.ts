/**
 * ops-admin-api용 main.ts 템플릿
 * 멀티 레포 분리 시 ops-admin-api 레포에서 사용
 * 포트: 8081
 * Global Prefix: /admin (선택적)
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';

const getPort = (): number => {
  const port = process.env.PORT;
  if (!port) return 8081;
  const parsed = Number.parseInt(port, 10);
  return Number.isNaN(parsed) ? 8081 : parsed;
};

const getCorsOrigin = (): string => {
  return process.env.CORS_ORIGIN ?? '*';
};

async function bootstrap() {
  const logger = new Logger('OPS-ADMIN-API');
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: getCorsOrigin(),
    credentials: true,
  });

  // 선택: 모든 엔드포인트에 /admin prefix 추가
  // 현재 admin 컨트롤러들이 이미 v1/admin prefix를 가지므로 필요 없음
  // app.setGlobalPrefix('admin');

  const port = getPort();
  await app.listen(port, '0.0.0.0');

  logger.log(`ops-admin-api running on port ${port}`);
  logger.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
}

bootstrap();
