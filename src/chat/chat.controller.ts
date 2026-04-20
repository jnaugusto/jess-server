import { Body, Controller, Logger, Post, Res, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Public } from '@thallesp/nestjs-better-auth';
import type { Response } from 'express';
import { ChatMessageDto } from './dto/chat-message.dto';
import { ChatService } from './chat.service';

@ApiTags('chat')
@Controller('chat')
@UseGuards(ThrottlerGuard)
export class ChatController {
  private readonly logger = new Logger(ChatController.name);
  constructor(private readonly chatService: ChatService) {}

  @Post('stream')
  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } }) // 20 requests per minute per IP
  @ApiOperation({ summary: 'Stream a chat response about Jess from Claude' })
  async streamChat(
    @Body() dto: ChatMessageDto,
    @Res() res: Response,
  ): Promise<void> {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    try {
      for await (const token of this.chatService.streamMessage(
        dto.message,
        dto.history,
      )) {
        res.write(`data: ${JSON.stringify({ token })}\n\n`);
      }
      res.write('data: [DONE]\n\n');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error('Chat stream error', err instanceof Error ? err.stack : message);
      res.write(`data: ${JSON.stringify({ error: message })}\n\n`);
    } finally {
      res.end();
    }
  }
}
