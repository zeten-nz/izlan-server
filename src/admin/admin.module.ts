import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RolesGuard } from '../auth/roles';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { CosmeticsAdminController } from './cosmetics.controller';
import { CosmeticsAdminService } from './cosmetics.service';

@Module({
  imports: [AuthModule],
  controllers: [AdminController, CatalogController, CosmeticsAdminController],
  providers: [AdminService, CatalogService, CosmeticsAdminService, RolesGuard],
})
export class AdminModule {}
