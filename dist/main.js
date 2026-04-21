"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const swagger_1 = require("@nestjs/swagger");
require("@total-typescript/ts-reset");
const app_module_1 = require("./app.module");
const all_exceptions_filter_1 = require("./common/filters/all-exceptions.filter");
const transform_interceptor_1 = require("./common/interceptors/transform.interceptor");
const env_1 = require("./env");
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    const config = new swagger_1.DocumentBuilder()
        .setTitle('Jess Server API')
        .setDescription('The Jess Server API description')
        .setVersion('1.0')
        .addTag('jess')
        .addBearerAuth()
        .build();
    const documentFactory = () => swagger_1.SwaggerModule.createDocument(app, config);
    swagger_1.SwaggerModule.setup('docs', app, documentFactory);
    const httpAdapterHost = app.get(core_1.HttpAdapterHost);
    const allowedOrigins = new Set((process.env.CORS_ORIGINS ??
        'http://localhost:5173,http://localhost:5174,http://localhost:4173,http://localhost:3000')
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean));
    app.enableCors({
        origin: (origin, callback) => {
            if (!origin || allowedOrigins.has(origin)) {
                callback(null, true);
            }
            else {
                callback(new Error(`Origin ${origin} not allowed by CORS`));
            }
        },
        credentials: true,
    });
    app.useGlobalPipes(new common_1.ValidationPipe({ transform: true, whitelist: true }));
    app.useGlobalInterceptors(new transform_interceptor_1.TransformInterceptor(app.get(core_1.Reflector)));
    app.useGlobalFilters(new all_exceptions_filter_1.AllExceptionsFilter(httpAdapterHost));
    app.enableShutdownHooks();
    await app.listen(env_1.env.PORT, '0.0.0.0');
}
void bootstrap();
//# sourceMappingURL=main.js.map