import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { XpModule } from '../xp/xp.module';
import { ShopController } from './shop.controller';
import { ShopService } from './shop.service';

@Module({ imports: [AuthModule, XpModule], controllers: [ShopController], providers: [ShopService] })
export class ShopModule {}
