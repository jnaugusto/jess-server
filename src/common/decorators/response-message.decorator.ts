import { SetMetadata } from '@nestjs/common';

export const RESPONSE_MESSAGE_KEY = 'response_message';

/**
 * Sets a custom message on the success response for an endpoint.
 * Read by TransformInterceptor to populate the `message` field.
 *
 * Usage:
 *   @ResponseMessage('Tracks retrieved.')
 *   @Get()
 *   getTracks() { ... }
 */
export const ResponseMessage = (message: string) =>
  SetMetadata(RESPONSE_MESSAGE_KEY, message);
