import type { ReactNode } from 'react';
import { TOOLS, countByStatus, CATEGORIES } from '../registry';
import { href } from '../app/router';

function Page({ title, lead, children }: { title: string; lead?: string; children: ReactNode }) {
  return (
    <div className="container page">
      <div className="page-head"><h1>{title}</h1>{lead ? <p>{lead}</p> : null}</div>
      <div className="prose">{children}</div>
    </div>
  );
}

export function About() {
  const s = countByStatus();
  return (
    <Page title="About ALRECT" lead="Small Pixels. Powerful Tools.">
      <p>ALRECT FILE TOOLS is a static web app: {TOOLS.length} small utilities in {CATEGORIES.length} categories, with no account, no server and no upload step. Open a tool, choose a file or paste text, get a result, download it.</p>
      <h2>What is real</h2>
      <p>Each tool carries a status. At the time of this build, {s.working} are <strong>Working</strong>, {s.partial} are <strong>Partial</strong> (they do the job but have a documented limit), {s.backend} need a backend and {s.unsupported} are not possible in a browser. The status is part of the tool’s page, not marketing copy.</p>
      <h2>What it is not</h2>
      <ul>
        <li>It is not a malware scanner, a password vault or a legal or forensic tool.</li>
        <li>It does not rename, move or delete files on your disk. Browsers do not allow that. Tools that “rename” or “organise” produce downloads.</li>
        <li>It does not convert video or audio between codecs. It inspects them, previews them and exports WAV.</li>
      </ul>
      <h2>Credits</h2>
      <p>Created by Alrect and AI. Questions or bug reports: <a href="mailto:mycontant.gokil@alzvyn.web.id">mycontant.gokil@alzvyn.web.id</a>.</p>
      <p>Open-source libraries in use are listed with their licences in <code>THIRD_PARTY_LICENSES.md</code> in the source archive.</p>
    </Page>
  );
}

export function Privacy() {
  return (
    <Page title="Privacy" lead="Short version: your files and text stay in your browser tab.">
      <h2>What the app does with your data</h2>
      <ul>
        <li>Files you choose are read with the browser’s File API and processed in memory, in this tab or a worker started by it.</li>
        <li>Results are created as downloads on your device. The app does not upload them anywhere.</li>
        <li>There is no analytics, advertising, tracking pixel, or third-party script. The page’s Content-Security-Policy only allows connections to its own origin.</li>
      </ul>
      <h2>What is stored in your browser</h2>
      <p>Three small items in <code>localStorage</code>: your favourite tool IDs, your last 12 used tool IDs with timestamps, and your “effects on/off” choice. File names, file contents and text you type are never stored. You can clear favourites and history from their pages, or clear site data in your browser.</p>
      <h2>What the host can see</h2>
      <p>Whoever serves this app (for example, a web host) sees ordinary request logs for the app’s own files, as with any website. They do not see what you do inside the tools. If you run it locally, nothing leaves your machine.</p>
      <h2>Metadata in files you share</h2>
      <p>Image and PDF files often carry hidden metadata such as GPS position or author. The <a href={href.tool('image-metadata-viewer')}>image metadata viewer</a> shows what a file contains, and the metadata removal tools write a cleaned copy.</p>
    </Page>
  );
}

export function SecurityPage() {
  return (
    <Page title="Security" lead="How the app protects you, and where its limits are.">
      <h2>Design</h2>
      <ul>
        <li><strong>No eval.</strong> The app never executes pasted or loaded code. Formatters and validators parse text; they do not run it.</li>
        <li><strong>Sanitised previews.</strong> Markdown and HTML previews pass through DOMPurify; scripts, event handlers, forms, styles, frames and remote images are removed. Everything else is rendered as plain text.</li>
        <li><strong>Strict CSP.</strong> No inline scripts, no inline styles, no remote scripts, connections only to the app’s own origin.</li>
        <li><strong>Archive limits.</strong> ZIP entries are checked for absolute paths, <code>..</code> segments, drive letters, symlinks, duplicates, encrypted entries, entry count, expanded size and compression ratio before and during extraction. Extraction output is capped while inflating, so a lying header cannot cause a bomb.</li>
        <li><strong>Regular expressions run in a worker</strong> that is terminated after two seconds, so a catastrophic pattern cannot freeze the page.</li>
        <li><strong>CSV export neutralises formulas</strong> (cells starting with = + - @) to prevent spreadsheet formula injection.</li>
        <li><strong>Randomness</strong> for tokens, passwords and UUIDs comes from <code>crypto.getRandomValues</code> with rejection sampling.</li>
      </ul>
      <h2>Limits</h2>
      <ul>
        <li>The password strength estimator is a heuristic, not a guarantee.</li>
        <li>MD5 and SHA-1 are shown for checksums and compatibility only; do not use them for security.</li>
        <li>The JWT decoder never verifies a signature. A decoded token is not a trusted token.</li>
        <li>This is not an antivirus. “File type” checks look at signatures and extensions, and can be fooled.</li>
      </ul>
      <h2>Reporting a problem</h2>
      <p>Email <a href="mailto:mycontant.gokil@alzvyn.web.id">mycontant.gokil@alzvyn.web.id</a> with steps to reproduce. Please do not include real personal data in sample files.</p>
    </Page>
  );
}

export function Help() {
  return (
    <Page title="Help and troubleshooting">
      <h2>A tool says my file is too large</h2>
      <p>Files are read into memory. The limit is 256 MiB per file, and less on phones with little RAM. Close other tabs and try a smaller file.</p>
      <h2>Audio or video will not load</h2>
      <p>Decoding uses your browser’s own codecs. Chromium builds without proprietary codecs cannot play H.264 or AAC. Try Chrome, Edge, Safari or Firefox, or a WebM/Ogg/WAV file.</p>
      <h2>The background animation is missing</h2>
      <p>It needs WebGL 2. Without it, or with “reduce motion” enabled in your system, the app shows a still background. You can also switch effects off in the header.</p>
      <h2>Downloads do not start</h2>
      <p>Check that your browser is not blocking downloads for this site. Each download button builds the file when you click it.</p>
      <h2>Keyboard use</h2>
      <p>Every control is reachable with Tab. In search, use the arrow keys and Enter. Press Escape to close the results list.</p>
    </Page>
  );
}
