import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class UpscaleImageDto {
  @ApiProperty({
    description: 'The factor by which to upscale the image (2-4)',
    default: 2,
    required: false,
    minimum: 2,
    maximum: 4,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2)
  @Max(4)
  factor?: number = 2;

  @ApiProperty({
    description:
      'The name of the model to use (e.g., realesrgan-x4plus, or your custom model name)',
    default: 'remacri',
    required: false,
  })
  @IsOptional()
  model?: string = 'remacri';
}
