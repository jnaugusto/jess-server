import { ApiProperty } from '@nestjs/swagger';
import { IsUrl } from 'class-validator';

export class AnalyzeSiteDto {
  @ApiProperty({ example: 'https://stripe.com', description: 'URL of the website to analyze' })
  @IsUrl({}, { message: 'url must be a valid URL' })
  url!: string;
}
