import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as Handlebars from 'handlebars';
import { join } from 'path';

@Injectable()
export class TemplateService implements OnModuleInit {
  private readonly logger = new Logger(TemplateService.name);
  private readonly templatesDir = join(__dirname, 'templates');

  async onModuleInit() {
    await this.registerPartials();
  }

  /**
   * Automatically registers all .hbs files in the partials directory
   */
  private async registerPartials() {
    const partialsDir = join(this.templatesDir, 'partials');
    try {
      const files = await fs.readdir(partialsDir);
      for (const file of files) {
        if (file.endsWith('.hbs')) {
          const partialName = file.replace('.hbs', '');
          const content = await fs.readFile(join(partialsDir, file), 'utf-8');
          Handlebars.registerPartial(partialName, content);
          this.logger.log(`Registered partial: ${partialName}`);
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Could not register partials: ${errorMessage}`);
    }
  }

  /**
   * Renders a template within the main layout
   * @param templateName Path to the template relative to templates/ directory
   * @param data Data to pass to the template
   * @param options Rendering options
   */
  async render(
    templateName: string,
    data: Record<string, unknown> = {},
    options: { layout?: string } = { layout: 'layouts/main' },
  ): Promise<string> {
    try {
      // 1. Render the main content template
      const templatePath = join(this.templatesDir, `${templateName}.hbs`);
      const templateContent = await fs.readFile(templatePath, 'utf-8');
      const compiledTemplate: Handlebars.TemplateDelegate = Handlebars.compile(templateContent);
      const body: string = compiledTemplate(data);

      // 2. If a layout is specified, wrap the content in it
      if (options.layout) {
        const layoutPath = join(this.templatesDir, `${options.layout}.hbs`);
        const layoutContent = await fs.readFile(layoutPath, 'utf-8');
        const compiledLayout: Handlebars.TemplateDelegate = Handlebars.compile(layoutContent);

        // Pass the rendered body to the layout as 'body' variable
        return compiledLayout({ ...data, body });
      }

      return body;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error rendering template ${templateName}: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Registers a custom Handlebars helper
   */
  registerHelper(name: string, fn: Handlebars.HelperDelegate) {
    Handlebars.registerHelper(name, fn);
  }
}
