import { DatabaseService } from '../database/database.service';
import { GetLocationsDto } from './dto/get-locations.dto';
export declare class LocationsService {
    private readonly db;
    constructor(db: DatabaseService);
    getLocations(userId: string, dto: GetLocationsDto): Promise<{
        id: string;
        userId: string;
        deviceId: string;
        latitude: string;
        longitude: string;
        accuracy: string;
        speed: string;
        timestamp: string;
        createdAt: Date;
    }[]>;
    getDevices(userId: string): Promise<string[]>;
}
