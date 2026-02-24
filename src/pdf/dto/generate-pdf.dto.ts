import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class GeneratePdfDto {
  @ApiProperty({
    description: 'The complete address to geocode and generate a report for',
    required: true,
    example: '123 Main St, Sydney, NSW 2000',
  })
  @IsString()
  @IsNotEmpty()
  address!: string;

  @ApiProperty({
    description: 'The number of pages to generate in the report',
    required: false,
    example: 100,
    default: 10,
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  pageCount?: number;
}
