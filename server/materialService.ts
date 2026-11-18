import JSZip from 'jszip';
import { extractText, getDocumentProxy } from 'unpdf';

export const MAX_MATERIAL_BYTES = 15 * 1024 * 1024;
const MAX_TEXT_CHARS = 60_000;

export interface MaterialResult {
  readable: boolean;
  kind: 'pdf' | 'docx' | 'text' | 'unsupported';
  text: string;
  /** Lines that look like modules, lessons, chapters or weeks, in order */
  outline: string[];
  note: string;
}

const OUTLINE_RE = /^\s*(?:(?:module|lesson|chapter|section|unit|week|part|day)\s*\d+\b|\d{1,2}(?:\.\d{1,2})*[.)]\s+\S)/i;

function toOutline(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+/g, ' ').trim();
    if (line.length < 3 || line.length > 120) continue;
    if (!OUTLINE_RE.test(line)) continue;
    // Table-of-contents lines often end in dotted leaders and a page number
    const clean = line.replace(/\.{2,}\s*\d+\s*$/, '').replace(/\s+\d{1,4}$/, '').trim();
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
    if (out.length >= 80) break;
  }
  return out;
}

async function docxText(buf: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file('word/document.xml')?.async('string');
  if (!xml) return '';
  return xml
    .replace(/<\/w:p>/g, '\n')
    .replace(/<w:tab\/>/g, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/** Reads text out of an uploaded course file. Never guesses: if nothing readable is found, it says so. */
export async function extractMaterial(filename: string, buf: Buffer): Promise<MaterialResult> {
  const ext = (filename.split('.').pop() || '').toLowerCase();
  let kind: MaterialResult['kind'] = 'unsupported';
  let text = '';
  try {
    if (ext === 'pdf') {
      kind = 'pdf';
      const pdf = await getDocumentProxy(new Uint8Array(buf));
      const res = await extractText(pdf, { mergePages: true });
      text = Array.isArray(res.text) ? res.text.join('\n') : res.text;
    } else if (ext === 'docx') {
      kind = 'docx';
      text = await docxText(buf);
    } else if (ext === 'txt' || ext === 'md') {
      kind = 'text';
      text = buf.toString('utf8');
    }
  } catch {
    return { readable: false, kind, text: '', outline: [], note: 'We could not open that file. It may be damaged or password-protected. You can paste its table of contents instead.' };
  }

  if (kind === 'unsupported') {
    return { readable: false, kind, text: '', outline: [], note: 'We can read PDF, Word (.docx), text and Markdown files. For other formats, paste the table of contents instead.' };
  }
  text = text.trim();
  if (text.length < 20) {
    return { readable: false, kind, text: '', outline: [], note: 'No readable text was found. Scanned or image-only files can’t be read yet, so paste the table of contents instead.' };
  }
  const outline = toOutline(text);
  return {
    readable: true,
    kind,
    text: text.slice(0, MAX_TEXT_CHARS),
    outline,
    note: outline.length
      ? `Found ${outline.length} possible modules. Check them before using, since automatic detection can miss or misread headings.`
      : 'We read the file but could not pick out a clear list of modules. Paste or type them below.',
  };
}
