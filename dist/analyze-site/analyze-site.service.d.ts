export interface BrandColors {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    text: string;
}
export interface AnalyzeSiteResult {
    companyName: string;
    category: string;
    toneOfVoice: string;
    suggestedTheme: string;
    brandColors: BrandColors;
    description: string;
}
export declare class AnalyzeSiteService {
    private readonly logger;
    private readonly client;
    constructor();
    analyze(url: string): Promise<AnalyzeSiteResult>;
}
