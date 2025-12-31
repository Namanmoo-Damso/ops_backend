import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

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
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: getCorsOrigin(), credentials: true });
  await app.listen(getPort(), '0.0.0.0');
}
bootstrap();
