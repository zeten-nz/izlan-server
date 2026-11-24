import { Controller, Get, Header, Module, ServiceUnavailableException } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Uptime monitoring va deploy smoke-testi uchun: GET /api/health.
 * Hech qanday maxfiy ma'lumot qaytarmaydi (versiya, xost, xato matni yo'q). DB javob bermasa 503.
 */
@Controller('health')
@SkipThrottle()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  async health() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException({ status: 'error', db: 'down' });
    }
    return { status: 'ok', db: 'ok' };
  }
}

@Module({ controllers: [HealthController] })
export class HealthModule {}
