import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.httpAdapterHost;
    const ctx = host.switchToHttp();

    const httpStatus =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    // HttpException.getResponse() returns whatever was passed to the
    // constructor — for our ZodValidationPipe it's the flattened
    // fieldErrors map. Extract it so the client can render field-level
    // validation errors instead of a generic "Bad Request" string.
    const exceptionPayload =
      exception instanceof HttpException ? exception.getResponse() : null;

    let message: string;
    let details: unknown = undefined;
    if (typeof exceptionPayload === 'string') {
      message = exceptionPayload;
    } else if (exceptionPayload && typeof exceptionPayload === 'object') {
      const payload = exceptionPayload as Record<string, unknown>;
      // Nest's default HttpException response shape is { statusCode, message, error }.
      // Anything else (e.g. our Zod fieldErrors map) ends up under `details`.
      if (typeof payload.message === 'string') {
        message = payload.message;
        if (Object.keys(payload).some((k) => !['statusCode', 'message', 'error'].includes(k))) {
          details = payload;
        }
      } else {
        message =
          exception instanceof HttpException
            ? exception.message
            : 'Validation failed';
        details = payload;
      }
    } else {
      message = (exception as Error).message || 'Internal server error';
    }

    if (httpStatus >= 500) {
      this.logger.error(
        message,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.warn(`${message} ${details ? JSON.stringify(details) : ''}`);
    }

    const responseBody = {
      success: false,
      statusCode: httpStatus,
      message,
      error: exception instanceof HttpException ? exception.name : 'InternalServerError',
      ...(details ? { details } : {}),
      path: httpAdapter.getRequestUrl(ctx.getRequest()) as string,
      timestamp: new Date().toISOString(),
    };

    httpAdapter.reply(ctx.getResponse(), responseBody, httpStatus);
  }
}
