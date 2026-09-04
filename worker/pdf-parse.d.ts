declare module 'pdf-parse' {
  interface PDFData {
    numpages?: number;
    [key: string]: unknown;
  }
  function pdfParse(dataBuffer: Buffer): Promise<PDFData>;
  export default pdfParse;
}
