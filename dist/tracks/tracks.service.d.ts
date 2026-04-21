import { DatabaseService } from '../database/database.service';
export declare class TracksService {
    private readonly db;
    constructor(db: DatabaseService);
    getTracks(userId: string): Promise<{
        id: string;
        userId: string;
        title: string;
        startTime: number;
        endTime: number;
        distance: number;
        avgSpeed: number;
    }[]>;
    getTracksWithPoints(userId: string): Promise<{
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
    getTrackWithPoints(userId: string, trackId: string): Promise<{
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
    getPoints(_userId: string, trackId: string): Promise<{
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
