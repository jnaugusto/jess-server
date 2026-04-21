"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.QueueService = void 0;
const common_1 = require("@nestjs/common");
const rxjs_1 = require("rxjs");
let QueueService = class QueueService {
    async getJobStatus(queue, jobId, avgJobTimeSec) {
        const job = await queue.getJob(jobId);
        if (!job) {
            return null;
        }
        const state = (await job.getState());
        const progress = job.progress;
        const result = job.returnvalue;
        let position = null;
        if (state === 'waiting') {
            const waitingJobs = await queue.getWaiting();
            position = waitingJobs.findIndex((j) => j.id === jobId) + 1;
        }
        let estimatedTimeRemaining = 0;
        if (state === 'waiting' && position !== null) {
            estimatedTimeRemaining = position * avgJobTimeSec;
        }
        else if (state === 'active') {
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
    getJobProgressStream(queue, jobId, avgJobTimeSec) {
        return (0, rxjs_1.interval)(2000).pipe((0, rxjs_1.switchMap)(() => this.getJobStatus(queue, jobId, avgJobTimeSec)), (0, rxjs_1.map)((status) => ({ data: status ?? { error: 'Job not found' } })));
    }
};
exports.QueueService = QueueService;
exports.QueueService = QueueService = __decorate([
    (0, common_1.Injectable)()
], QueueService);
//# sourceMappingURL=queue.service.js.map