"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var TemplateService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TemplateService = void 0;
const common_1 = require("@nestjs/common");
const fs = __importStar(require("fs/promises"));
const Handlebars = __importStar(require("handlebars"));
const path_1 = require("path");
let TemplateService = TemplateService_1 = class TemplateService {
    logger = new common_1.Logger(TemplateService_1.name);
    templatesDir = (0, path_1.join)(__dirname, 'templates');
    async onModuleInit() {
        await this.registerPartials();
    }
    async registerPartials() {
        const partialsDir = (0, path_1.join)(this.templatesDir, 'partials');
        try {
            const files = await fs.readdir(partialsDir);
            for (const file of files) {
                if (file.endsWith('.hbs')) {
                    const partialName = file.replace('.hbs', '');
                    const content = await fs.readFile((0, path_1.join)(partialsDir, file), 'utf-8');
                    Handlebars.registerPartial(partialName, content);
                    this.logger.log(`Registered partial: ${partialName}`);
                }
            }
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.warn(`Could not register partials: ${errorMessage}`);
        }
    }
    async render(templateName, data = {}, options = { layout: 'layouts/main' }) {
        try {
            const templatePath = (0, path_1.join)(this.templatesDir, `${templateName}.hbs`);
            const templateContent = await fs.readFile(templatePath, 'utf-8');
            const compiledTemplate = Handlebars.compile(templateContent);
            const body = compiledTemplate(data);
            if (options.layout) {
                const layoutPath = (0, path_1.join)(this.templatesDir, `${options.layout}.hbs`);
                const layoutContent = await fs.readFile(layoutPath, 'utf-8');
                const compiledLayout = Handlebars.compile(layoutContent);
                return compiledLayout({ ...data, body });
            }
            return body;
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.error(`Error rendering template ${templateName}: ${errorMessage}`);
            throw error;
        }
    }
    registerHelper(name, fn) {
        Handlebars.registerHelper(name, fn);
    }
};
exports.TemplateService = TemplateService;
exports.TemplateService = TemplateService = TemplateService_1 = __decorate([
    (0, common_1.Injectable)()
], TemplateService);
//# sourceMappingURL=template.service.js.map