export declare class ChatHistoryItemDto {
    role: 'user' | 'assistant';
    content: string;
}
export declare class ChatMessageDto {
    message: string;
    history?: ChatHistoryItemDto[];
}
