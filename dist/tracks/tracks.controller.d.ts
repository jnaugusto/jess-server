import { type UserSession } from '@thallesp/nestjs-better-auth';
import { TracksService } from './tracks.service';
export declare class TracksController {
    private readonly tracksService;
    constructor(tracksService: TracksService);
    getTracks(session: UserSession): Promise<{
        id: string;
        userId: string;
        title: string;
        startTime: number;
        endTime: number;
        distance: number;
        avgSpeed: number;
    }[]>;
    getTracksWithPoints(session: UserSession): Promise<{
        points: {
            latitude: number;
            longitude: number;
            timestamp: number;
        }[];
        id: string;
        userId: string;
        title: string;
        startTime: number;
        endTime: number;
        distance: number;
        avgSpeed: number;
    }[]>;
    getTrackWithPoints(session: UserSession, trackId: string): Promise<{
        points: {
            latitude: number;
            longitude: number;
            timestamp: number;
            speed: number | null;
            altitude: number | null;
        }[];
        id: string;
        userId: string;
        title: string;
        startTime: number;
        endTime: number;
        distance: number;
        avgSpeed: number;
    }>;
    getPoints(session: UserSession, trackId: string): Promise<{
        id: string;
        userId: string;
        trackId: string;
        latitude: number;
        longitude: number;
        accuracy: number;
        altitude: number | null;
        speed: number | null;
        heading: number | null;
        timestamp: number;
    }[]>;
}
