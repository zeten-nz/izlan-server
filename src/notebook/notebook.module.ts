import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { LearningModule } from '../learning/learning.module';
import { LessonsModule } from '../lessons/lessons.module';
import { NotebookController } from './notebook.controller';
import { NotebookService } from './notebook.service';

@Module({ imports: [AuthModule, LearningModule, LessonsModule], controllers: [NotebookController], providers: [NotebookService] })
export class NotebookModule {}
