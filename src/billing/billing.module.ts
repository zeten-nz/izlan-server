import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminIncomesController } from './billing.admin.controller';
import { InternalBotController, PublicPricesController, WalletController } from './billing.controller';
import { BillingService } from './billing.service';

@Module({
  imports: [AuthModule],
  controllers: [WalletController, PublicPricesController, InternalBotController, AdminIncomesController],
  providers: [BillingService],
  exports: [BillingService],
})
export class BillingModule {}
