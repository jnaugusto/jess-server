"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var ImageProcessor_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ImageProcessor = void 0;
const bullmq_1 = require("@nestjs/bullmq");
const common_1 = require("@nestjs/common");
const child_process_1 = require("child_process");
const fs = __importStar(require("fs/promises"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const sharp_1 = __importDefault(require("sharp"));
const util_1 = require("util");
const execPromise = (0, util_1.promisify)(child_process_1.exec);
let ImageProcessor = ImageProcessor_1 = class ImageProcessor extends bullmq_1.WorkerHost {
    logger = new common_1.Logger(ImageProcessor_1.name);
    async process(job) {
        switch (job.name) {
            case 'upscale':
                return await this.handleUpscale(job);
            default:
                this.logger.warn(`Unknown job name: ${job.name}`);
                return undefined;
        }
    }
    async handleUpscale(job) {
        const { data } = job;
        const jobId = job.id ?? Date.now().toString();
        const upscaleFactor = '2';
        const tempDir = os.tmpdir();
        const inputPath = path.join(tempDir, `input_${jobId}.png`);
        const normalizedPath = path.join(tempDir, `normalized_${jobId}.png`);
        const outputPath = path.join(tempDir, `output_${jobId}.png`);
        this.logger.log(`Upscaling image: ${data.fileName} by ${upscaleFactor}x using model ${data.model}`);
        try {
            await job.updateProgress(5);
            let imageBuffer;
            const bufferData = data.buffer;
            if (Buffer.isBuffer(data.buffer)) {
                imageBuffer = data.buffer;
            }
            else if (typeof data.buffer === 'object' &&
                bufferData.type === 'Buffer' &&
                Array.isArray(bufferData.data)) {
                imageBuffer = Buffer.from(bufferData.data);
            }
            else {
                imageBuffer = Buffer.from(data.buffer);
            }
            await fs.writeFile(inputPath, imageBuffer);
            await job.updateProgress(10);
            this.logger.log('Normalizing image...');
            await (0, sharp_1.default)(inputPath)
                .removeAlpha()
                .toColorspace('srgb')
                .png({ compressionLevel: 0 })
                .toFile(normalizedPath);
            await job.updateProgress(20);
            const modelsPath = process.env.NODE_ENV === 'production' ? '/opt/upscayl/models' : 'models';
            try {
                const files = await fs.readdir(modelsPath);
                this.logger.log(`Available models in ${modelsPath}: ${files.join(', ')}`);
            }
            catch (e) {
                this.logger.error(`Could not list models in ${modelsPath}: ${e.message}`);
            }
            const cmd = `realesrgan-ncnn-vulkan -i "${normalizedPath}" -o "${outputPath}" -s ${upscaleFactor} -m "${modelsPath}" -n ${data.model} -t 400 -x -f png -v`;
            this.logger.log(`Executing: ${cmd}`);
            try {
                const { stdout, stderr } = await execPromise(cmd);
                if (stdout)
                    this.logger.log(`stdout: ${stdout}`);
                if (stderr)
                    this.logger.warn(`stderr: ${stderr}`);
            }
            catch (e) {
                const execError = e;
                const stderr = execError.stderr ?? '';
                const stdout = execError.stdout ?? '';
                this.logger.error(`Upscayl failed. Stderr: ${stderr}, Stdout: ${stdout}`);
                if (stderr.includes('not found') || execError.message.includes('ENOENT')) {
                    throw new Error('realesrgan-ncnn-vulkan not found. Please ensure the binary is installed in the Docker container.');
                }
                throw e;
            }
            await job.updateProgress(90);
            const outputBuffer = await fs.readFile(outputPath);
            const base64 = `data:image/png;base64,${outputBuffer.toString('base64')}`;
            await Promise.all([
                fs.unlink(inputPath).catch(() => {
                }),
                fs.unlink(normalizedPath).catch(() => {
                }),
                fs.unlink(outputPath).catch(() => {
                }),
            ]);
            await job.updateProgress(100);
            this.logger.log(`Finished upscaling: ${data.fileName}`);
            return { success: true, base64 };
        }
        catch (error) {
            this.logger.error(`Error during upscale: ${error.message}`);
            await Promise.all([
                fs.unlink(inputPath).catch(() => {
                }),
                fs.unlink(normalizedPath).catch(() => {
                }),
                fs.unlink(outputPath).catch(() => {
                }),
            ]);
            throw error;
        }
    }
};
exports.ImageProcessor = ImageProcessor;
exports.ImageProcessor = ImageProcessor = ImageProcessor_1 = __decorate([
    (0, bullmq_1.Processor)('image-processing')
], ImageProcessor);
//# sourceMappingURL=image.processor.js.map