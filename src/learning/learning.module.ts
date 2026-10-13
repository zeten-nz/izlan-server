import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { LearningController } from './learning.controller';
import { LearningService } from './learning.service';
import { ProgressService } from './progress.service';

@Module({ imports: [AuthModule], controllers: [LearningController], providers: [LearningService, ProgressService], exports: [LearningService] })
export class LearningModule {}
