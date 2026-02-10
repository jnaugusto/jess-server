import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { BullBoardModule } from '@bull-board/nestjs';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ImageController } from './image.controller';
import { ImageProcessor } from './image.processor';
import { ImageService } from './image.service';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'image-processing',
    }),
    BullBoardModule.forFeature({
      name: 'image-processing',
      adapter: BullMQAdapter,
    }),
  ],
  providers: [ImageService, ImageProcessor],
  controllers: [ImageController],
})
export class ImageModule {}
