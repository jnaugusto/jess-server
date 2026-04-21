import { AnalyzeSiteDto } from './dto/analyze-site.dto';
import { AnalyzeSiteService } from './analyze-site.service';
export declare class AnalyzeSiteController {
    private readonly analyzeSiteService;
    constructor(analyzeSiteService: AnalyzeSiteService);
    analyze(dto: AnalyzeSiteDto): Promise<import("./analyze-site.service").AnalyzeSiteResult>;
}
