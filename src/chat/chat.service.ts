import Anthropic from '@anthropic-ai/sdk';
import { Injectable, Logger } from '@nestjs/common';
import { env } from '../env';
import { ChatHistoryItemDto } from './dto/chat-message.dto';

const RESUME_CONTEXT = `
Name: Jess Noel Augusto
Title: Senior Full Stack Developer
Location: Mactan, Lapu-Lapu City, Cebu, Philippines
Email: jessnoelaugusto@gmail.com
Years of Experience: 11+
Availability: Open to Senior / Lead Engineer opportunities

SUMMARY:
Senior Full Stack Developer with 11+ years of experience specializing in the design and scaling of high-performance web and real-time applications. Expert in migrating legacy monoliths to modern API-first architectures with a proven track record in GCP and Kubernetes deployment.

EXPERIENCE:

1. Senior Software Engineer — Logmaster Australia (June 2021 – Present, Full-time)
   - Led architectural migration from legacy WordPress monolith to modern API-first architecture
   - Directed "Version 2" platform rebuild with NestJS, Vue.js, and Tailwind CSS
   - Engineered high-performance PDF report generation system using Playwright (multi-page, at scale)
   - Boosted application responsiveness via MongoDB indexing and Redis caching
   - Deployed and managed containerized applications on GCP (Cloud Run & GKE) using Docker
   Tech: NestJS, Vue.js, Tailwind CSS, MongoDB, Redis, GCP, Docker, Playwright

2. Full Stack Developer — DigitalFaktur (January 2021 – December 2021, Full-time)
   - Built cross-platform mobile apps using Quasar Framework and Ionic
   - Engineered proprietary WordPress plugins in PHP
   - Architected backend services using NestJS and Laravel across MySQL & MongoDB
   - Managed end-to-end Linux deployment with security hardening
   Tech: NestJS, Laravel, Vue.js, Quasar, Ionic, WordPress, MySQL, MongoDB, Linux

3. Full Stack Developer — Corebridge (April 2017 – February 2020, Full-time)
   - Built dual-sided eCommerce ecosystem using .NET Core and Angular
   - Optimized CRM using ASP.NET MVC
   - Designed SQL Server schemas and integrated Elasticsearch for search
   Tech: C#, .NET Core, ASP.NET MVC, Angular, MS SQL Server, Elasticsearch

4. Software Engineer — Cleverlearn English Language Institute (January 2015 – March 2017, Full-time)
   - Architected "ESLflex" virtual classroom — migrated from C# desktop to WebRTC web app
   - Engineered real-time sync via Socket.io for collaborative whiteboards (sub-second latency)
   - Developed integrated ERP portal (Hotel Management, HR, Finance, Academic)
   Tech: C#, WebRTC, Node.js, Socket.io, Vue.js, Laravel, MySQL

SKILLS:
- Backend: NestJS, Node.js, Laravel, .NET Core, ASP.NET MVC, C#, PHP, REST APIs, Microservices
- Frontend: Vue.js, React, Angular, Quasar, Ionic, Tailwind CSS, TypeScript
- Database: MongoDB, MySQL, MS SQL Server, Redis, Elasticsearch
- DevOps / Cloud: GCP, Cloud Run, GKE, Docker, Kubernetes, Linux, CI/CD, GitHub Actions
- Mapping & Location: Mapbox GL JS, Geolocation API, GeoJSON, Real-Time Tracking
- Tools: Playwright, Socket.io, WebRTC, Swagger, Git, Jira, Nginx

SELF-BUILT PROJECTS:
1. Location Tracking App & Dashboard — Real-time GPS tracking via WebSockets, Mapbox GL JS map with live trails, NestJS REST API, GeoJSON geofencing
2. Multi-Page PDF Generator — Playwright-based headless Chromium renderer, Redis job queue, handles 50+ page reports; powers Logmaster Australia compliance reports
3. AI Image Restoration — AI super-resolution, 2x/4x upscaling, React drag-and-drop UI
4. Image Compression Tool — Bulk compress/convert images to WebP/JPG/PNG, quality slider, batch download; served via NestJS + Sharp API
5. Image to Text (OCR) — OCR pipeline with image pre-processing, multi-language support, handles JPG/PNG/scanned PDFs
6. CSV to JSON Converter — Custom field mapping, type coercion, nested JSON from dot-notation headers, REST API for pipeline automation
`;

const SYSTEM_PROMPT = `You are Jess's personal AI assistant embedded on his developer portfolio at jess.dev.

Your job is to answer questions from potential employers, recruiters, and collaborators about Jess Noel Augusto — his experience, skills, projects, and availability.

Guidelines:
- Refer to Jess in the third person (e.g. "Jess has..." not "I have...")
- Be concise, confident, and professional — but friendly
- Only answer questions about Jess — his experience, skills, projects, and availability
- If asked anything unrelated to Jess (e.g. general coding questions, other people, world events, opinions), respond with: "I can only discuss Jess's work and experience. What would you like to know about him?"
- If asked something about Jess that you don't have data for, say so honestly and suggest they contact Jess directly at jessnoelaugusto@gmail.com
- Use light markdown formatting where it helps clarity: **bold** for names/titles, bullet points for lists of 3+ items, inline code for tech names
- Keep responses short and conversational — max 4 sentences or a short bullet list. Never write walls of text
- No headers (##), no horizontal rules, no nested lists, no links
- Do not make up or embellish anything beyond the data provided

${RESUME_CONTEXT}`;

@Injectable()
export class ChatService {
  private readonly client: Anthropic;
  private readonly logger = new Logger(ChatService.name);

  constructor() {
    this.client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    this.logger.log('Anthropic client initialised');
  }

  async *streamMessage(message: string, history: ChatHistoryItemDto[] = []): AsyncIterable<string> {
    const messages: Anthropic.MessageParam[] = [
      ...history.map((h) => ({ role: h.role, content: h.content })),
      { role: 'user', content: message },
    ];

    const stream = this.client.messages.stream({
      model: 'claude-haiku-4-5',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages,
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        yield event.delta.text;
      }
    }
  }
}
