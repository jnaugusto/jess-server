import { ChatHistoryItemDto } from './dto/chat-message.dto';
export declare class ChatService {
    private readonly client;
    private readonly logger;
    constructor();
    streamMessage(message: string, history?: ChatHistoryItemDto[]): AsyncIterable<string>;
}
