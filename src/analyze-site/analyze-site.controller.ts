import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { AnalyzeSiteDto } from './dto/analyze-site.dto';
import { AnalyzeSiteService } from './analyze-site.service';

@AllowAnonymous()
@ApiTags('analyze-site')
@Controller('analyze-site')
export class AnalyzeSiteController {
  constructor(private readonly analyzeSiteService: AnalyzeSiteService) {}

  @Post()
  @ApiOperation({ summary: 'Analyze a website URL and extract brand information' })
  analyze(@Body() dto: AnalyzeSiteDto) {
    return this.analyzeSiteService.analyze(dto.url);
  }
}
