import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { AdminModule } from './admin/admin.module';
import { LearningModule } from './learning/learning.module';
import { LessonsModule } from './lessons/lessons.module';
import { NotebookModule } from './notebook/notebook.module';
import { ProfileModule } from './profile/profile.module';
import { AppConfigModule } from './config/config.module';
import { PrismaModule } from './prisma/prisma.service';

@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    AuthModule,
    LearningModule,
    AdminModule,
    LessonsModule,
    NotebookModule,
    ProfileModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
