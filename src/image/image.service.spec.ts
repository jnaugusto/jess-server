import { getQueueToken } from '@nestjs/bullmq';
import { Test, TestingModule } from '@nestjs/testing';
import { vi } from 'vitest';
import { QueueService } from '../common/services/queue.service';
import { ImageService } from './image.service';

describe('ImageService', () => {
  let service: ImageService;

  const mockQueue = {
    add: vi.fn(),
  };

  const mockQueueService = {
    getJobStatus: vi.fn(),
    getJobProgressStream: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ImageService,
        {
          provide: getQueueToken('image-processing'),
          useValue: mockQueue,
        },
        {
          provide: QueueService,
          useValue: mockQueueService,
        },
      ],
    }).compile();

    service = module.get<ImageService>(ImageService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
