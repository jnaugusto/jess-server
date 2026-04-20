import { Injectable, Logger, UnprocessableEntityException } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { env } from '../env';

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

@Injectable()
export class AnalyzeSiteService {
  private readonly logger = new Logger(AnalyzeSiteService.name);
  private readonly client: Anthropic;

  constructor() {
    this.client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  }

  async analyze(url: string): Promise<AnalyzeSiteResult> {
    // Fetch website HTML
    let html = '';
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; EmailGenBot/1.0)' },
        signal: AbortSignal.timeout(10_000),
      });
      html = await res.text();
    } catch (err) {
      this.logger.warn(`Failed to fetch ${url}: ${err}`);
      throw new UnprocessableEntityException(`Could not fetch URL: ${url}`);
    }

    // Extract basic metadata via regex (no DOM dependency)
    const title =
      html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() ?? '';
    const metaDesc =
      html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1]?.trim() ?? '';
    const ogTitle =
      html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1]?.trim() ?? '';

    // Collect first 10 unique hex colors from the page
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

    const parsed = JSON.parse(cleaned) as AnalyzeSiteResult;
    return parsed;
  }
}
