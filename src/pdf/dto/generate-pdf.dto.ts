import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, IsString, IsUrl } from 'class-validator';

export enum PdfTemplateType {
  FINANCIAL_REPORT = 'financial-report',
  RESUME = 'resume',
  INVOICE = 'invoice',
  REAL_ESTATE = 'real-estate',
  SITE_CAPTURE = 'site-capture',
}

export class GeneratePdfDto {
  @ApiProperty({
    description: 'The template to generate.',
    enum: PdfTemplateType,
    default: PdfTemplateType.FINANCIAL_REPORT,
    required: false,
  })
  @IsOptional()
  @IsEnum(PdfTemplateType)
  templateType?: PdfTemplateType;

  @ApiProperty({
    description:
      'Used by financial-report, real-estate, and invoice. ' +
      'For real-estate: the property address. For invoice: the billing address.',
    required: false,
    example: '42 Ocean Drive, Bondi Beach NSW 2026',
  })
  @IsString()
  @IsOptional()
  address?: string;

  @ApiProperty({
    description: 'financial-report only: number of pages to generate.',
    required: false,
    example: 5,
    default: 1,
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  pageCount?: number;

  @ApiProperty({
    description: 'site-capture only: the public URL to screenshot and convert to PDF.',
    required: false,
    example: 'https://example.com',
  })
  @IsOptional()
  @IsUrl({ require_tld: false })
  url?: string;
}
