import { category } from './helpers';
const t = category('text');

export const TEXT_TOOLS = [
  t('text-editor', 'Text Editor', 'text+file', 'Edit text in the browser with live statistics, find and replace, line numbers, and open or save files. Nothing is stored unless you download it.', { keywords: ['notepad', 'edit', 'write'], featured: true }),
  t('text-diff-checker', 'Text Diff Checker', 'text', 'Compare two texts line by line and see added, removed and unchanged lines, with a unified-diff export.', { keywords: ['compare', 'difference', 'changes'], featured: true }),
  t('word-counter', 'Word Counter', 'text', 'Count words, unique words and sentences, estimate reading time and list the most frequent words.', { keywords: ['words', 'reading time', 'frequency'] }),
  t('character-counter', 'Character Counter', 'text', 'Count characters with and without spaces, Unicode graphemes, UTF-8 and UTF-16 bytes, and character classes.', { keywords: ['length', 'bytes', 'graphemes', 'limit'] }),
  t('line-counter', 'Line Counter', 'text', 'Count lines, blank lines and the longest line, with a distribution of line lengths.', { keywords: ['lines', 'rows', 'longest line'] }),
  t('whitespace-cleaner', 'Whitespace Cleaner', 'text', 'Trim lines, collapse spaces, remove blank lines and strip zero-width characters.', { keywords: ['trim', 'clean', 'spaces', 'invisible characters'] }),
  t('text-case-converter', 'Text Case Converter', 'text', 'Convert to UPPER, lower, Title, Sentence, camelCase, PascalCase, snake_case, kebab-case or CONSTANT_CASE.', { keywords: ['uppercase', 'lowercase', 'camel', 'snake', 'kebab'] }),
  t('markdown-previewer', 'Markdown Previewer', 'text', 'Write Markdown and see a sanitised live preview. Scripts, event handlers and remote images are removed.', { keywords: ['md', 'preview', 'render'], safety: 'Rendered HTML is passed through an allow-list sanitiser; remote images and unsafe link schemes are stripped.' }),
  t('markdown-to-html-converter', 'Markdown to HTML Converter', 'text', 'Convert Markdown to HTML source you can copy, with the output sanitised by default.', { keywords: ['md to html', 'convert markdown'], safety: 'Sanitisation is on by default. Turning it off is possible, but the output is only shown as text, never rendered.' }),
  t('html-to-plain-text-converter', 'HTML to Plain Text Converter', 'text', 'Extract readable text from HTML, keeping paragraph breaks, list bullets and link targets.', { keywords: ['strip tags', 'html to text', 'extract text'], safety: 'The HTML is parsed into an inert document; no script runs and nothing is loaded.' }),
  t('csv-viewer', 'CSV Viewer', 'text+file', 'View CSV as a table with a chosen delimiter, row numbers and column counts. Cell content is always displayed as text.', { keywords: ['table', 'spreadsheet', 'open csv'] }),
  t('csv-formatter', 'CSV Formatter', 'text', 'Normalise CSV: consistent quoting, equal column counts, delimiter and line endings of your choice.', { keywords: ['clean csv', 'normalize', 'quote', 'delimiter'] }),
  t('json-viewer', 'JSON Viewer', 'text+file', 'Explore JSON as a collapsible tree with types, array lengths and the path of each value.', { keywords: ['tree', 'explore', 'inspect json'] }),
  t('json-formatter', 'JSON Formatter', 'text', 'Pretty-print or minify JSON with sorted keys as an option. Errors show line and column.', { keywords: ['beautify', 'minify', 'pretty print', 'indent'], featured: true }),
  t('xml-formatter', 'XML Formatter', 'text', 'Indent well-formed XML. Malformed XML and DTD entity declarations are rejected with a reason.', { keywords: ['pretty print xml', 'indent', 'beautify'] }),
];
