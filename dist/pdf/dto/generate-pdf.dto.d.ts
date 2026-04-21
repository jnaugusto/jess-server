export declare enum PdfTemplateType {
    FINANCIAL_REPORT = "financial-report",
    RESUME = "resume",
    INVOICE = "invoice",
    REAL_ESTATE = "real-estate",
    SITE_CAPTURE = "site-capture"
}
export declare class GeneratePdfDto {
    templateType?: PdfTemplateType;
    address?: string;
    pageCount?: number;
    url?: string;
}
