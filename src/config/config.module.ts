import { Global, Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { AppConfig } from './app-config';

@Global()
@Module({
  imports: [NestConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' })],
  providers: [AppConfig],
  exports: [AppConfig],
})
export class AppConfigModule {}
