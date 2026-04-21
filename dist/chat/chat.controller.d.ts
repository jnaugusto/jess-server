import type { Response } from 'express';
import { ChatMessageDto } from './dto/chat-message.dto';
import { ChatService } from './chat.service';
export declare class ChatController {
    private readonly chatService;
    private readonly logger;
    constructor(chatService: ChatService);
    streamChat(dto: ChatMessageDto, res: Response): Promise<void>;
}
