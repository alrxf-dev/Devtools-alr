import { category } from './helpers';
const t = category('data');

export const DATA_TOOLS = [
  t('json-to-csv', 'JSON to CSV', 'text+file', 'Flatten an array of JSON objects into CSV. Nested objects become dotted column names.', { keywords: ['convert', 'flatten', 'spreadsheet'], featured: true, safety: 'Cells that begin with =, +, - or @ are prefixed so spreadsheets do not run them as formulas.' }),
  t('csv-to-json', 'CSV to JSON', 'text+file', 'Convert CSV with a header row into JSON objects, with optional number and boolean detection.', { keywords: ['convert', 'parse csv'], featured: true }),
  t('json-to-xml', 'JSON to XML', 'text', 'Convert JSON into XML with a root element name you choose. Invalid element names are repaired and reported.', { keywords: ['convert', 'xml'] }),
  t('xml-to-json', 'XML to JSON', 'text', 'Convert XML to JSON, keeping attributes and text. Malformed XML and entity declarations are rejected.', { keywords: ['convert', 'parse xml'] }),
  t('yaml-to-json', 'YAML to JSON', 'text', 'Convert YAML to JSON. Custom tags are rejected rather than run, and alias expansion is limited.', { keywords: ['convert', 'yml'], safety: 'Parsed with a non-executing YAML parser. Unknown tags and alias bombs are rejected.' }),
  t('json-to-yaml', 'JSON to YAML', 'text', 'Convert JSON to readable YAML.', { keywords: ['convert', 'yml'] }),
  t('unix-timestamp-converter', 'Unix Timestamp Converter', 'text', 'Convert Unix seconds or milliseconds to ISO, UTC and local time, and dates back to timestamps.', { keywords: ['epoch', 'time', 'date', 'seconds'] }),
  t('date-format-converter', 'Date Format Converter', 'text', 'Reformat a date into ISO 8601, RFC 2822, YYYY-MM-DD, DD/MM/YYYY, MM/DD/YYYY and Unix time, in UTC or local time.', { keywords: ['iso 8601', 'rfc 2822', 'format date'] }),
  t('binary-converter', 'Binary Converter', 'text', 'Convert text to 8-bit binary and back (UTF-8), and integers to and from binary of any size.', { keywords: ['bits', 'text to binary', 'base 2'] }),
  t('hexadecimal-converter', 'Hexadecimal Converter', 'text', 'Convert text to hex and back (UTF-8), and integers to and from hexadecimal of any size.', { keywords: ['hex', 'text to hex', 'base 16'] }),
  t('decimal-converter', 'Decimal Converter', 'text', 'Convert a decimal integer to binary, octal and hex, and show a decimal number’s IEEE 754 float32 and float64 bit patterns.', { keywords: ['ieee 754', 'float', 'base 10', 'floating point'] }),
  t('url-encoder-decoder', 'URL Encoder and Decoder', 'text', 'Percent-encode or decode text, as a URL component or a whole URL, with a clear error for malformed sequences.', { keywords: ['percent encoding', 'uri', 'query string'], featured: true }),
  t('html-entity-encoder-decoder', 'HTML Entity Encoder and Decoder', 'text', 'Escape or decode HTML entities, including numeric references and an option to escape every non-ASCII character.', { keywords: ['escape', 'entities', 'amp', 'html'] }),
  t('base64-encoder-decoder', 'Base64 Encoder and Decoder', 'text+file', 'Encode text or a file to Base64 (standard or URL-safe) and decode it back, with proper UTF-8 handling.', { keywords: ['b64', 'encode', 'decode', 'base64url'], featured: true }),
  t('unicode-inspector', 'Unicode Inspector', 'text', 'List every code point with its U+ value, UTF-8 and UTF-16 encoding and category. Useful for finding invisible and look-alike characters.', { keywords: ['code points', 'utf-8', 'emoji', 'homoglyph', 'invisible'] }),
];
