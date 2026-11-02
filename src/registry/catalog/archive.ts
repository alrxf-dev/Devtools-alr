import { category } from './helpers';
const t = category('archive');

export const ARCHIVE_TOOLS = [
  t('zip-creator', 'ZIP Creator', 'files', 'Bundle files into a ZIP with a chosen compression level. Duplicate names are renamed rather than overwritten.', { keywords: ['compress', 'zip files', 'archive'], featured: true }),
  t('zip-extractor', 'ZIP Extractor', 'file', 'List and extract ZIP contents with path-traversal, entry-count, size and ratio limits. Download files one by one or re-packed.', { keywords: ['unzip', 'decompress', 'open zip'], featured: true, safety: 'Unsafe paths, symlinks and encrypted entries are skipped and reported, never written.' }),
  t('archive-content-viewer', 'Archive Content Viewer', 'file', 'List every entry with size, compressed size, method, date and CRC without extracting anything.', { keywords: ['list', 'contents', 'inspect zip'] }),
  t('zip-file-validator', 'ZIP File Validator', 'file', 'Validate the central directory, entry headers and names, and report structural problems and suspicious entries.', { keywords: ['check zip', 'corrupt', 'malformed'] }),
  t('archive-size-inspector', 'Archive Size Inspector', 'file', 'Report compressed vs expanded size, overall ratio, largest entries and which entries trip the safety limits.', { keywords: ['ratio', 'zip bomb', 'expanded size'] }),
  t('batch-file-archiver', 'Batch File Archiver', 'files', 'Pick a whole folder and archive it with relative paths preserved, skipping patterns such as node_modules and .git.', { keywords: ['folder', 'directory', 'exclude', 'backup'], statusNote: 'Folder selection depends on browser support for directory pickers; most desktop browsers have it, some mobile browsers do not.' }),
  t('zip-compression-level-selector', 'ZIP Compression Level Selector', 'files', 'Compress your files at levels 0, 1, 3, 6 and 9, show the resulting sizes and time, and download the one you pick.', { keywords: ['deflate', 'level', 'compare compression'] }),
  t('zip-password-support-inspector', 'ZIP Password Support Inspector', 'file', 'Report which entries are encrypted and whether they use legacy ZipCrypto or AES. It inspects only; it cannot open or crack encrypted entries.', { keywords: ['encrypted zip', 'aes', 'zipcrypto'], safety: 'Inspection only. No password recovery or bypass is provided.' }),
  t('archive-file-list-exporter', 'Archive File List Exporter', 'file', 'Export an archive’s file list as CSV, JSON or plain text.', { keywords: ['export listing', 'csv', 'json', 'manifest'] }),
  t('archive-integrity-checker', 'Archive Integrity Checker', 'file', 'Decompress each entry within safe limits and verify its CRC-32 against the archive records.', { keywords: ['crc', 'test archive', 'verify zip'] }),
  t('zip-metadata-viewer', 'ZIP Metadata Viewer', 'file', 'Show archive comment, ZIP64 use, entry comments, timestamps, flags and the Unix permissions recorded per entry.', { keywords: ['comment', 'zip64', 'permissions', 'flags'] }),
  t('archive-file-search', 'Archive File Search', 'text+file', 'Search entry names and, optionally, the text inside small entries, without extracting to disk.', { keywords: ['find in zip', 'grep zip', 'search archive'] }),
  t('zip-directory-structure-viewer', 'ZIP Directory Structure Viewer', 'file', 'Show the archive as an indented tree with folder totals.', { keywords: ['tree', 'folders', 'structure'] }),
  t('archive-extraction-preview', 'Archive Extraction Preview', 'file', 'Dry-run an extraction: show exactly which entries would be written, under what safe path, and which would be refused and why.', { keywords: ['dry run', 'preview extract', 'safe paths'] }),
  t('zip-manifest-generator', 'ZIP Manifest Generator', 'file', 'Hash every entry inside a ZIP with SHA-256 and produce a manifest, without extracting to disk.', { keywords: ['sha256', 'hash entries', 'checksums'] }),
];
