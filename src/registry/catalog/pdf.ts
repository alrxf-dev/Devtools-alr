import { category } from './helpers';
const t = category('pdf');

export const PDF_TOOLS = [
  t('pdf-merger', 'PDF Merger', 'files', 'Combine several PDFs into one, in the order you set.', { keywords: ['combine', 'join', 'concatenate'], featured: true }),
  t('pdf-splitter', 'PDF Splitter', 'file', 'Split a PDF into single pages, fixed-size chunks, or custom page ranges, delivered as a ZIP.', { keywords: ['separate', 'divide', 'ranges'] }),
  t('pdf-page-extractor', 'PDF Page Extractor', 'file', 'Pull selected pages (for example 1-3, 7, 10-12) out into a new PDF.', { keywords: ['select pages', 'subset'] }),
  t('pdf-page-reorderer', 'PDF Page Reorderer', 'file', 'Rearrange, repeat or drop pages by listing the new order, or reverse the whole document.', { keywords: ['reorder', 'sort pages', 'reverse'] }),
  t('pdf-rotator', 'PDF Rotator', 'file', 'Rotate all pages or chosen pages by 90, 180 or 270 degrees.', { keywords: ['turn pages', 'landscape', 'portrait'] }),
  t('pdf-metadata-viewer', 'PDF Metadata Viewer', 'file', 'Show title, author, creator, producer, dates, PDF version and page count from the document information.', { keywords: ['properties', 'info', 'author'] }),
  t('pdf-page-counter', 'PDF Page Counter', 'files', 'Count pages in one or many PDFs at once and total them.', { keywords: ['pages', 'count'] }),
  t('pdf-to-image', 'PDF to Image', 'file', 'Render pages to PNG or JPEG at a chosen resolution and download them as a ZIP.', { keywords: ['render', 'rasterize', 'png', 'jpg'], featured: true }),
  t('image-to-pdf', 'Image to PDF', 'files', 'Place PNG or JPEG images on pages, one per page, with a choice of page size and margin.', { keywords: ['jpg to pdf', 'png to pdf', 'photos'] }),
  t('pdf-compressor', 'PDF Compressor', 'file', 'Rewrite the PDF with a compact object structure and strip document metadata, then compare sizes.', { status: 'partial', statusNote: 'Structural optimisation only: embedded images are not downsampled, so image-heavy PDFs may not shrink much. If the result is not smaller, you are told so.', keywords: ['reduce size', 'optimize', 'shrink'] }),
  t('pdf-password-status-checker', 'PDF Password Status Checker', 'file', 'Detect whether a PDF is encrypted and report the encryption handler and revision, without trying to bypass anything.', { keywords: ['encrypted', 'protected', 'locked'], safety: 'This tool only reports status. It does not remove or crack passwords.' }),
  t('pdf-text-extractor', 'PDF Text Extractor', 'file', 'Extract the text layer of each page. Scanned pages without a text layer produce no text (there is no OCR).', { keywords: ['copy text', 'read', 'ocr'], featured: true }),
  t('pdf-page-size-inspector', 'PDF Page Size Inspector', 'file', 'List every page’s width, height, orientation and rotation in points, millimetres and inches, and match standard paper sizes.', { keywords: ['paper size', 'a4', 'letter', 'dimensions'] }),
  t('pdf-watermark-tool', 'PDF Watermark Tool', 'file', 'Stamp diagonal or horizontal text on every page with adjustable size, colour and opacity.', { keywords: ['stamp', 'confidential', 'draft'] }),
  t('pdf-document-validator', 'PDF Document Validator', 'file', 'Run structural sanity checks: header, end-of-file marker, cross-reference table, page tree and whether two independent parsers can open it.', { status: 'partial', statusNote: 'Reports structural problems it can detect. It is not a full PDF/A or ISO 32000 conformance validator.', keywords: ['check', 'corrupt', 'repair', 'valid'] }),
];
