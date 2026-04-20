import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNotEmpty, IsNumber, IsString, Min } from 'class-validator';

export class GetLocationsDto {
  @ApiProperty({ description: 'Device ID to fetch locations for' })
  @IsString()
  @IsNotEmpty()
  deviceId!: string;

  @ApiProperty({
    description: 'Start of range as Unix millisecond timestamp',
    example: 1700000000000,
  })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  from!: number;

  @ApiProperty({
    description: 'End of range as Unix millisecond timestamp',
    example: 1700086400000,
  })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  to!: number;
}
