"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var AnalyzeSiteService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnalyzeSiteService = void 0;
const common_1 = require("@nestjs/common");
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
const env_1 = require("../env");
const VALID_CATEGORIES = [
    'ecommerce', 'saas', 'agency', 'restaurant', 'real-estate',
    'healthcare', 'education', 'portfolio', 'nonprofit', 'finance',
    'travel', 'fitness', 'beauty', 'legal', 'construction',
    'automotive', 'media', 'photography', 'pet-services', 'general',
];
const VALID_THEMES = [
    'default', 'mocha-mousse', 'mono', 'modern-minimal', 'amber-minimal', 'clean-slate',
    'catppuccin', 'bubblegum', 'nature', 'ocean-breeze', 'sunset-horizon', 'pastel-dreams',
    'flora', 'perpetuity', 'tangerine', 'solar-dusk', 'candyland', 'northern-lights',
    'claude', 'vercel', 't3-chat', 'twitter', 'bold-tech', 'supabase', 'twitch', 'kick',
    'spotify', 'stripe', 'github', 'cyberpunk', 'neo-brutalism', 'doom-64', 'kodama-grove',
    'quantum-rose', 'elegant-luxury', 'claymorphism', 'retro-arcade', 'vintage-paper',
    'windows-98', 'cosmic-night', 'midnight-bloom', 'graphite', 'caffeine', 'starry-night',
];
let AnalyzeSiteService = AnalyzeSiteService_1 = class AnalyzeSiteService {
    logger = new common_1.Logger(AnalyzeSiteService_1.name);
    client;
    constructor() {
        this.client = new sdk_1.default({ apiKey: env_1.env.ANTHROPIC_API_KEY });
    }
    async analyze(url) {
        let html = '';
        try {
            const res = await fetch(url, {
                headers: { 'User-Agent': 'Mozilla/5.0 (compatible; EmailGenBot/1.0)' },
                signal: AbortSignal.timeout(10_000),
            });
            html = await res.text();
        }
        catch (err) {
            this.logger.warn(`Failed to fetch ${url}: ${err}`);
            throw new common_1.UnprocessableEntityException(`Could not fetch URL: ${url}`);
        }
        const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() ?? '';
        const metaDesc = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1]?.trim() ?? '';
        const ogTitle = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1]?.trim() ?? '';
        const colorMatches = html.match(/#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g) ?? [];
        const detectedColors = [...new Set(colorMatches)].slice(0, 10);
        const siteData = { url, title: ogTitle || title, description: metaDesc, detectedColors };
        const prompt = `You are a brand analyst. Analyze this website data and return a JSON object.

Website data:
${JSON.stringify(siteData, null, 2)}

Return ONLY valid JSON (no markdown, no code blocks) with this exact structure:
{
  "companyName": "detected company name",
  "category": "one of: ${VALID_CATEGORIES.join(' | ')}",
  "toneOfVoice": "one of: Professional | Friendly | Playful | Luxurious | Bold | Minimalist",
  "suggestedTheme": "one of: ${VALID_THEMES.join(' | ')}",
  "brandColors": {
    "primary": "#hex",
    "secondary": "#hex",
    "accent": "#hex",
    "background": "#hex",
    "text": "#hex"
  },
  "description": "one sentence summary of the business"
}`;
        const message = await this.client.messages.create({
            model: 'claude-sonnet-4-6',
            max_tokens: 512,
            messages: [{ role: 'user', content: prompt }],
        });
        const rawText = message.content[0].type === 'text' ? message.content[0].text : '';
        const cleaned = rawText.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();
        const parsed = JSON.parse(cleaned);
        return parsed;
    }
};
exports.AnalyzeSiteService = AnalyzeSiteService;
exports.AnalyzeSiteService = AnalyzeSiteService = AnalyzeSiteService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], AnalyzeSiteService);
//# sourceMappingURL=analyze-site.service.js.map