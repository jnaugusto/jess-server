import { Queue } from 'bullmq';
import { Observable } from 'rxjs';
export interface JobStatus {
    id: string | undefined;
    state: string;
    progress: number;
    position: number | null;
    totalWaiting: number;
    estimatedTimeRemaining: number;
    result: unknown;
}
export declare class QueueService {
    getJobStatus(queue: Queue, jobId: string, avgJobTimeSec: number): Promise<JobStatus | null>;
    getJobProgressStream(queue: Queue, jobId: string, avgJobTimeSec: number): Observable<{
        data: JobStatus | {
            error: string;
        };
    }>;
}
