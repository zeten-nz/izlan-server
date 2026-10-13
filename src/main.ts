import 'reflect-metadata';
import fastifyCookie from '@fastify/cookie';
import fastifyMultipart from '@fastify/multipart';
import { UnprocessableEntityException, ValidationPipe, type ValidationError } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module';
import { AppConfig } from './config/app-config';

/** class-validator xatolarini { message, errors: { maydon: xabar } } ko'rinishiga keltiradi. */
function toFieldErrors(errors: ValidationError[]): UnprocessableEntityException {
  const map: Record<string, string> = {};
  for (const e of errors) {
    const first = e.constraints ? Object.values(e.constraints)[0] : undefined;
    if (first) map[e.property] = first;
  }
  return new UnprocessableEntityException({ message: Object.values(map)[0] ?? "Ma'lumot noto'g'ri", errors: map });
}

async function bootstrap() {
  // Next rewrites orqali kelgani uchun haqiqiy IP X-Forwarded-For'da (rate limit shunga tayanadi).
  // Server tashqi dunyoga to'g'ridan-to'g'ri ochilmasligi kerak.
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ trustProxy: true, bodyLimit: 32 * 1024 }),
  );
  // Dars hujjatlari katta bo'lishi mumkin: 32KB cheklov faqat qoralama saqlash yo'li uchun 1MB gacha ko'tariladi.
  app
    .getHttpAdapter()
    .getInstance()
    .addHook('onRoute', (route) => {
      if (route.method === 'PUT' && route.url.startsWith('/api/staff/lessons/')) route.bodyLimit = 1024 * 1024;
      if (route.method === 'POST' && route.url === '/api/assets') route.bodyLimit = 16 * 1024 * 1024;
    });
  const config = app.get(AppConfig);
  config.authSecret; // yetishmasa darrov xato bersin
  config.mailDriver;

  await app.register(fastifyCookie);
  await app.register(fastifyMultipart);
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
      exceptionFactory: toFieldErrors,
    }),
  );
  app.enableShutdownHooks();
  await app.listen(config.port, '127.0.0.1');
}

void bootstrap();
