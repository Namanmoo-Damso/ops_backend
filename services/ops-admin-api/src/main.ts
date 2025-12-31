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

  const port = getPort();
  await app.listen(port, '0.0.0.0');

  logger.log(`ops-admin-api running on port ${port}`);
}

bootstrap();
