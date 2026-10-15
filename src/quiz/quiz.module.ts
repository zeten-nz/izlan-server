import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RolesGuard } from '../auth/roles';
import { LearningModule } from '../learning/learning.module';
import { XpModule } from '../xp/xp.module';
import { AchievementsModule } from '../achievements/achievements.module';
import { StaffQuizController, StudentQuizController } from './quiz.controller';
import { QuizService } from './quiz.service';

@Module({
  imports: [AuthModule, LearningModule, XpModule, AchievementsModule],
  controllers: [StudentQuizController, StaffQuizController],
  providers: [QuizService, RolesGuard],
})
export class QuizModule {}
