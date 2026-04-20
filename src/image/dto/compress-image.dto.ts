import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export class CompressImageDto {
  @ApiProperty({
    description: 'The quality of the compressed image (1-100)',
    default: 80,
    required: false,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  quality?: number = 80;

  @ApiProperty({
    description: 'Output format',
    default: 'webp',
    required: false,
    enum: ['webp', 'jpeg', 'png'],
  })
  @IsOptional()
  @IsIn(['webp', 'jpeg', 'png'])
  format?: 'webp' | 'jpeg' | 'png' = 'webp';
}
