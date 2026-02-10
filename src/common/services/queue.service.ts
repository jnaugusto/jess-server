import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { interval, map, Observable, switchMap } from 'rxjs';

export interface JobStatus {
  id: string | undefined;
  state: string;
  progress: number;
  position: number | null;
  totalWaiting: number;
  estimatedTimeRemaining: number;
  result: unknown;
}

@Injectable()
export class QueueService {
  async getJobStatus(
    queue: Queue,
    jobId: string,
    avgJobTimeSec: number,
  ): Promise<JobStatus | null> {
    const job = await queue.getJob(jobId);
    if (!job) {
      return null;
    }

    const state = (await job.getState()) as string;
    const progress = job.progress as number;
    const result = job.returnvalue as unknown;

    let position: number | null = null;
    if (state === 'waiting') {
      const waitingJobs = await queue.getWaiting();
      position = waitingJobs.findIndex((j) => j.id === jobId) + 1;
    }

    let estimatedTimeRemaining = 0;
    if (state === 'waiting' && position !== null) {
      estimatedTimeRemaining = position * avgJobTimeSec;
    } else if (state === 'active') {
      estimatedTimeRemaining = Math.max(0, Math.round(((100 - progress) / 100) * avgJobTimeSec));
    }

    return {
      id: job.id,
      state,
      progress,
      position,
      totalWaiting: await queue.getWaitingCount(),
      estimatedTimeRemaining,
      result,
    };
  }

  getJobProgressStream(
    queue: Queue,
    jobId: string,
    avgJobTimeSec: number,
  ): Observable<{ data: JobStatus | { error: string } }> {
    return interval(2000).pipe(
      switchMap(() => this.getJobStatus(queue, jobId, avgJobTimeSec)),
      map((status) => ({ data: status ?? { error: 'Job not found' } })),
    );
  }
}
