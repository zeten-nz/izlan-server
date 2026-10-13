import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SessionGuard } from './session.guard';

@Module({
  imports: [MailModule],
  controllers: [AuthController],
  providers: [AuthService, SessionGuard],
  exports: [AuthService, SessionGuard],
})
export class AuthModule {}
