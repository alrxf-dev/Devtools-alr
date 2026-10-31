/**
 * CPU-heavy jobs that run inside a Web Worker (or inline when workers are unavailable, e.g. in Node tests).
 * Each job takes one structured-clonable argument and may report progress. Keep this file free of DOM access.
 */
import { hashFile, type HashAlgo } from '../lib/hash';
import { createZip, readZipDirectory, extractZipSafely, verifyZipIntegrity, type ZipInputFile } from '../lib/zip';
import { diffLines } from '../lib/text';
import { csvToJson, jsonToCsv, formatCsv, formatJson, xmlToJson, yamlToJson, jsonToYaml, jsonToXml, formatXml, convertCsvDelimiter, csvToXml } from '../lib/data';
import { sriFromBytes } from '../lib/security';

export type Progress = (fraction: number, label?: string) => void;

export const jobs = {
  async hashFiles(a: { files: File[]; algos: HashAlgo[] }, progress: Progress) {
    const out: { name: string; size: number; hashes: Record<string, string> }[] = [];
    const total = a.files.length * a.algos.length;
    let done = 0;
    for (const f of a.files) {
      const hashes: Record<string, string> = {};
      for (const algo of a.algos) {
        hashes[algo] = await hashFile(algo, f, (p) => progress((done + p) / total, `${f.name} (${algo})`));
        done++;
      }
      out.push({ name: f.name, size: f.size, hashes });
    }
    return out;
  },

  async zipCreate(a: { files: { path: string; data: Blob }[]; level: number }, progress: Progress) {
    progress(0.05, 'Compressing');
    const files: ZipInputFile[] = a.files;
    return createZip(files, { level: a.level });
  },

  zipRead(a: { data: Uint8Array }) {
    return readZipDirectory(a.data);
  },

  async zipExtract(a: { data: Uint8Array; only?: string[] }, progress: Progress) {
    const report = readZipDirectory(a.data);
    const res = await extractZipSafely(a.data, report, { ...(a.only ? { only: new Set(a.only) } : {}), onProgress: (d, t) => progress(d / Math.max(1, t), 'Extracting') });
    return { report, ...res };
  },

  zipVerify(a: { data: Uint8Array }) {
    return verifyZipIntegrity(a.data);
  },

  diff(a: { a: string; b: string }) {
    return diffLines(a.a, a.b);
  },

  async sri(a: { data: Uint8Array; algos: ('SHA-256' | 'SHA-384' | 'SHA-512')[] }) {
    return sriFromBytes(a.data, a.algos);
  },

  /** Text conversions. Kept in the worker so that multi-megabyte documents do not freeze the page. */
  convert(a: { op: 'csv-json' | 'json-csv' | 'csv-format' | 'json-format' | 'xml-json' | 'yaml-json' | 'json-yaml' | 'json-xml' | 'xml-format' | 'csv-delimiter' | 'csv-xml'; text: string; opts?: Record<string, string | number | boolean> }) {
    const o = a.opts ?? {};
    const d = typeof o['delimiter'] === 'string' ? o['delimiter'] : ',';
    switch (a.op) {
      case 'csv-json': return csvToJson(a.text, { delimiter: d, inferTypes: o['inferTypes'] === true });
      case 'json-csv': return jsonToCsv(a.text, { delimiter: d });
      case 'csv-format': return formatCsv(a.text, { delimiter: d });
      case 'json-format': return formatJson(a.text, o['indent'] === 'tab' ? 'tab' : Number(o['indent'] ?? 2), o['sortKeys'] === true);
      case 'xml-json': return xmlToJson(a.text);
      case 'yaml-json': return yamlToJson(a.text);
      case 'json-yaml': return jsonToYaml(a.text);
      case 'json-xml': return jsonToXml(a.text, typeof o['root'] === 'string' ? o['root'] : 'root');
      case 'xml-format': return formatXml(a.text);
      case 'csv-delimiter': return convertCsvDelimiter(a.text, d, typeof o['to'] === 'string' ? o['to'] : ',');
      case 'csv-xml': return csvToXml(a.text, { delimiter: d });
    }
  },
};

export type Jobs = typeof jobs;
export type JobName = keyof Jobs;
