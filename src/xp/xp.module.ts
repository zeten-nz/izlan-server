import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { XpController } from './xp.controller';
import { XpService } from './xp.service';

@Module({ imports: [AuthModule], controllers: [XpController], providers: [XpService], exports: [XpService] })
export class XpModule {}
