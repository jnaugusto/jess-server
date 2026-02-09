import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.httpAdapterHost;
    const ctx = host.switchToHttp();

    const httpStatus =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? exception.message
        : (exception as Error).message || 'Internal server error';

    const responseBody = {
      success: false,
      statusCode: httpStatus,
      message,
      error: exception instanceof HttpException ? exception.name : 'InternalServerError',
      path: httpAdapter.getRequestUrl(ctx.getRequest()) as string,
      timestamp: new Date().toISOString(),
    };

    httpAdapter.reply(ctx.getResponse(), responseBody, httpStatus);
  }
}
