import { Test, TestingModule } from '@nestjs/testing';
import { vi } from 'vitest';
import { ImageController } from './image.controller';
import { ImageService } from './image.service';

describe('ImageController', () => {
  let controller: ImageController;

  const mockImageService = {
    compressImage: vi.fn(),
    upscaleImage: vi.fn(),
    getJobStatus: vi.fn(),
    getJobProgressStream: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ImageController],
      providers: [
        {
          provide: ImageService,
          useValue: mockImageService,
        },
      ],
    }).compile();

    controller = module.get<ImageController>(ImageController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
