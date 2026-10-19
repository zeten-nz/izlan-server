import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RolesGuard } from '../auth/roles';
import { GrammarContentService } from './content.service';
import { AdminGrammarController, InternalGrammarController, InternalTokenGuard, StaffGrammarContentController } from './grammar.controllers';
import { GrammarService } from './grammar.service';
import { GrammarReleaseService } from './release.service';
import { StaffGrammarController } from './staff-grammar.controller';

@Module({
  imports: [AuthModule],
  controllers: [StaffGrammarController, StaffGrammarContentController, AdminGrammarController, InternalGrammarController],
  providers: [GrammarService, GrammarContentService, GrammarReleaseService, InternalTokenGuard, RolesGuard],
  exports: [GrammarService, GrammarContentService, GrammarReleaseService],
})
export class GrammarModule {}
