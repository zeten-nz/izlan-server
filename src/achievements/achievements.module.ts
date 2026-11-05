import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RolesGuard } from '../auth/roles';
import { AchievementsController, AdminAchievementsController } from './achievements.controller';
import { AchievementsService } from './achievements.service';

@Module({
  imports: [AuthModule],
  controllers: [AchievementsController, AdminAchievementsController],
  providers: [AchievementsService, RolesGuard],
  exports: [AchievementsService],
})
export class AchievementsModule {}
