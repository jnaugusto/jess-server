import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class DebugEmitDto {
  @ApiPropertyOptional({
    description:
      'Driver to emit for. If omitted, the first driver in the workspace is used.',
  })
  @IsOptional()
  @IsString()
  driverId?: string;

  @ApiProperty({ example: 14.5995 })
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat!: number;

  @ApiProperty({ example: 120.9842 })
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng!: number;

  @ApiPropertyOptional({ description: 'Speed in km/h', example: 42 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(300)
  speed?: number;

  @ApiPropertyOptional({ description: 'Heading in degrees (0–360)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(360)
  heading?: number;

  @ApiPropertyOptional({
    enum: ['driving', 'stopped', 'speeding', 'standby'],
  })
  @IsOptional()
  @IsIn(['driving', 'stopped', 'speeding', 'standby'])
  status?: 'driving' | 'stopped' | 'speeding' | 'standby';
}
