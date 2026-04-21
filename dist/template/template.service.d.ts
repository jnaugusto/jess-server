import { OnModuleInit } from '@nestjs/common';
import * as Handlebars from 'handlebars';
export declare class TemplateService implements OnModuleInit {
    private readonly logger;
    private readonly templatesDir;
    onModuleInit(): Promise<void>;
    private registerPartials;
    render(templateName: string, data?: Record<string, unknown>, options?: {
        layout?: string;
    }): Promise<string>;
    registerHelper(name: string, fn: Handlebars.HelperDelegate): void;
}
