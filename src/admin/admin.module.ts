import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RolesGuard } from '../auth/roles';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';

@Module({
  imports: [AuthModule],
  controllers: [AdminController, CatalogController],
  providers: [AdminService, CatalogService, RolesGuard],
})
export class AdminModule {}
