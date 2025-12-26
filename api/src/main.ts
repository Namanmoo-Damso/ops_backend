import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AppService } from './app.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(AppService).getConfig();
  app.enableCors({ origin: config.corsOrigin, credentials: true });
  await app.listen(config.port, '0.0.0.0');
}
bootstrap();
