import { type UserSession } from '@thallesp/nestjs-better-auth';
import { GetLocationsDto } from './dto/get-locations.dto';
import { LocationsService } from './locations.service';
export declare class LocationsController {
    private readonly locationsService;
    constructor(locationsService: LocationsService);
    getLocations(session: UserSession, dto: GetLocationsDto): Promise<{
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
    getDevices(session: UserSession): Promise<string[]>;
}
