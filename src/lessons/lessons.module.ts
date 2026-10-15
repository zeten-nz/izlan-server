import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RolesGuard } from '../auth/roles';
import { LearningModule } from '../learning/learning.module';
import { XpModule } from '../xp/xp.module';
import { AchievementsModule } from '../achievements/achievements.module';
import { AssetsController } from './assets.controller';
import { AssetsService } from './assets.service';
import { StaffLessonsController } from './staff-lessons.controller';
import { StaffLessonsService } from './staff-lessons.service';
import { StudentLessonsController } from './student-lessons.controller';
import { StudentLessonsService } from './student-lessons.service';

@Module({
  imports: [AuthModule, LearningModule, XpModule, AchievementsModule],
  controllers: [StaffLessonsController, StudentLessonsController, AssetsController],
  providers: [StaffLessonsService, StudentLessonsService, AssetsService, RolesGuard],
  exports: [StudentLessonsService],
})
export class LessonsModule {}
