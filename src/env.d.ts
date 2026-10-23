declare module '*.css';
declare module 'pdfjs-dist/legacy/build/pdf.min.mjs' { export * from 'pdfjs-dist'; }
declare module 'pdfjs-dist/legacy/build/pdf.worker.min.mjs' { const src: string; export default src; }
