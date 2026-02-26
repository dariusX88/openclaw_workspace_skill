declare module "pdf-parse" {
  interface PDFData {
    numpages: number;
    numrender: number;
    info: Record<string, any>;
    metadata: any;
    text: string;
    version: string;
  }
  function pdfParse(buffer: Buffer, options?: Record<string, any>): Promise<PDFData>;
  export default pdfParse;
}
