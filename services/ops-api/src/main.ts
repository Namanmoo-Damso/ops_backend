/**
 * ops-api용 main.ts 템플릿
 * 멀티 레포 분리 시 ops-api 레포에서 사용
 * 포트: 8080
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';

const getPort = (): number => {
  const port = process.env.PORT;
  if (!port) return 8080;
  const parsed = Number.parseInt(port, 10);
  return Number.isNaN(parsed) ? 8080 : parsed;
};

const getCorsOrigin = (): string => {
  return process.env.CORS_ORIGIN ?? '*';
};

async function bootstrap() {
  const logger = new Logger('OPS-API');
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: getCorsOrigin(),
    credentials: true,
  });

  const port = getPort();
  await app.listen(port, '0.0.0.0');

  logger.log(`ops-api running on port ${port}`);
  logger.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
}

bootstrap();
