import JSZip from 'jszip';
import { extractText, getDocumentProxy } from 'unpdf';

export const MAX_MATERIAL_BYTES = 25 * 1024 * 1024;
const MAX_TEXT_CHARS = 60_000;

export interface ExtractedMaterialItem {
  title: string;
  kind: 'module' | 'reading' | 'exercise' | 'project' | 'lesson';
  group?: string;
}

export interface MaterialResult {
  readable: boolean;
  kind: 'pdf' | 'docx' | 'text' | 'zip' | 'unsupported';
  text: string;
  /** Lines that look like modules, lessons, chapters, weeks, exercises or files, in order */
  outline: string[];
  structuredItems?: ExtractedMaterialItem[];
  skippedVideoCount?: number;
  note: string;
}

const OUTLINE_RE = /^\s*(?:(?:module|lesson|chapter|section|unit|week|part|day|lab|exercise|project)\s*\d+\b|\d{1,2}(?:\.\d{1,2})*[.)]\s+\S)/i;

const VIDEO_OR_AUDIO_EXT_RE = /\.(mp4|mov|mkv|webm|avi|m4v|wmv|flv|mpeg|mpg|3gp|mp3|wav|ogg|aac|flac)$/i;
const IGNORED_ZIP_PATH_RE = /(^|\/)(node_modules|\.git|__MACOSX|dist|build|\.next|venv|\.venv)\//i;
const TEXT_LIKE_EXT_RE = /\.(md|txt|rst|json|py|js|jsx|ts|tsx|html|css|sql|sh|ipynb)$/i;

function toOutline(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+/g, ' ').trim();
    if (line.length < 3 || line.length > 120) continue;
    const isMarkdownHeading = /^#{1,3}\s+\S/.test(line);
    if (!OUTLINE_RE.test(line) && !isMarkdownHeading) continue;
    const clean = line
      .replace(/^#{1,3}\s+/, '')
      .replace(/\.{2,}\s*\d+\s*$/, '')
      .replace(/\s+\d{1,4}$/, '')
      .trim();
    const key = clean.toLowerCase();
    if (!clean || seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
    if (out.length >= 80) break;
  }
  return out;
}

function classifyZipEntryKind(filePath: string): ExtractedMaterialItem['kind'] {
  const lower = filePath.toLowerCase();
  if (/project|capstone|portfolio/.test(lower)) return 'project';
  if (/exercise|practice|quiz|lab|assignment|challenge|homework/.test(lower)) return 'exercise';
  if (/\.(pdf|md|txt|docx)$/.test(lower)) return 'reading';
  return 'lesson';
}

function cleanEntryTitle(entryPath: string): string {
  const parts = entryPath.split('/').filter(Boolean);
  const fileName = parts[parts.length - 1] || entryPath;
  const parent = parts.length >= 2 ? parts[parts.length - 2] : '';
  const baseName = fileName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
  const cleanParent = parent.replace(/[_-]+/g, ' ').trim();
  if (cleanParent && !/^(src|app|files|materials|course)$/i.test(cleanParent)) {
    return `${cleanParent}: ${baseName}`;
  }
  return baseName;
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

async function extractZipCourseArchive(buf: Buffer): Promise<MaterialResult> {
  const zip = await JSZip.loadAsync(buf);
  const allEntries = Object.values(zip.files).filter((f) => !f.dir && !IGNORED_ZIP_PATH_RE.test(f.name));

  let skippedVideoCount = 0;
  const usableFiles: typeof allEntries = [];

  for (const entry of allEntries) {
    if (VIDEO_OR_AUDIO_EXT_RE.test(entry.name)) {
      skippedVideoCount += 1;
      continue;
    }
    usableFiles.push(entry);
  }

  if (usableFiles.length === 0) {
    return {
      readable: false,
      kind: 'zip',
      text: '',
      outline: [],
      skippedVideoCount,
      note:
        skippedVideoCount > 0
          ? `Skipped ${skippedVideoCount} video/audio file(s) (videos are never uploaded or processed by AI). No text, PDF, Markdown, or code files were found in the archive.`
          : 'No readable study files were found in that .zip archive.',
    };
  }

  usableFiles.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

  const structuredItems: ExtractedMaterialItem[] = [];
  const outline: string[] = [];
  const seenOutline = new Set<string>();
  const textSnippets: string[] = [];

  const addOutline = (title: string, kind: ExtractedMaterialItem['kind'] = 'module', group?: string) => {
    const clean = title.replace(/\s+/g, ' ').trim();
    if (!clean || clean.length < 3 || clean.length > 120) return;
    const key = clean.toLowerCase();
    if (seenOutline.has(key)) return;
    seenOutline.add(key);
    outline.push(clean);
    structuredItems.push({ title: clean, kind, group });
  };

  // First extract syllabus/readme headings from markdown/txt/pdf files inside the archive (capped to keep lightweight)
  let parsedDocs = 0;
  for (const entry of usableFiles) {
    const lower = entry.name.toLowerCase();
    if (parsedDocs < 12 && (/readme|syllabus|outline|curriculum|index/i.test(lower) || /\.(md|txt)$/.test(lower))) {
      try {
        const content = await entry.async('string');
        if (content && content.trim().length >= 20) {
          parsedDocs += 1;
          textSnippets.push(`--- ${entry.name} ---\n${content.slice(0, 3000)}`);
          for (const h of toOutline(content)) {
            addOutline(h, classifyZipEntryKind(entry.name), entry.name.split('/')[0]);
          }
        }
      } catch {}
    } else if (parsedDocs < 8 && lower.endsWith('.pdf')) {
      try {
        const ab = await entry.async('uint8array');
        if (ab.byteLength <= 4 * 1024 * 1024) {
          const pdf = await getDocumentProxy(ab);
          const res = await extractText(pdf, { mergePages: true });
          const pdfTxt = (Array.isArray(res.text) ? res.text.join('\n') : res.text).trim();
          if (pdfTxt.length >= 20) {
            parsedDocs += 1;
            textSnippets.push(`--- ${entry.name} ---\n${pdfTxt.slice(0, 2500)}`);
            for (const h of toOutline(pdfTxt)) {
              addOutline(h, 'reading', entry.name.split('/')[0]);
            }
          }
        }
      } catch {}
    }
    if (outline.length >= 60) break;
  }

  // Also add clean folder/file study items for starter files, notes, exercises, and projects
  if (outline.length < 40) {
    for (const entry of usableFiles.slice(0, 60)) {
      if (TEXT_LIKE_EXT_RE.test(entry.name) || /\.(pdf|docx)$/i.test(entry.name)) {
        const parts = entry.name.split('/').filter(Boolean);
        const topGroup = parts.length > 1 ? parts[0] : 'Course files';
        addOutline(cleanEntryTitle(entry.name), classifyZipEntryKind(entry.name), topGroup);
      }
      if (outline.length >= 60) break;
    }
  }

  const fileListSummary = usableFiles
    .slice(0, 80)
    .map((f) => f.name)
    .join('\n');

  const combinedText = [
    `Archive files (${usableFiles.length} study files${skippedVideoCount ? `, ${skippedVideoCount} video/audio files skipped` : ''}):`,
    fileListSummary,
    ...textSnippets,
  ]
    .join('\n\n')
    .slice(0, MAX_TEXT_CHARS);

  return {
    readable: true,
    kind: 'zip',
    text: combinedText,
    outline: outline.slice(0, 60),
    structuredItems: structuredItems.slice(0, 60),
    skippedVideoCount,
    note: `Scanned ${usableFiles.length} course file(s) from the archive${skippedVideoCount ? ` (${skippedVideoCount} video/audio file(s) skipped — videos are never uploaded or processed)` : ''}. Found ${outline.length} structured study items.`,
  };
}

/** Reads text out of an uploaded course file or .zip archive. Strictly skips video/audio files. */
export async function extractMaterial(filename: string, buf: Buffer): Promise<MaterialResult> {
  if (VIDEO_OR_AUDIO_EXT_RE.test(filename)) {
    return {
      readable: false,
      kind: 'unsupported',
      text: '',
      outline: [],
      skippedVideoCount: 1,
      note: 'Video and audio files are never uploaded or processed. Upload course notes, PDFs, Markdown, starter code, or a .zip without videos instead.',
    };
  }

  const ext = (filename.split('.').pop() || '').toLowerCase();
  let kind: MaterialResult['kind'] = 'unsupported';
  let text = '';

  try {
    if (ext === 'zip') {
      return await extractZipCourseArchive(buf);
    } else if (ext === 'pdf') {
      kind = 'pdf';
      const pdf = await getDocumentProxy(new Uint8Array(buf));
      const res = await extractText(pdf, { mergePages: true });
      text = Array.isArray(res.text) ? res.text.join('\n') : res.text;
    } else if (ext === 'docx') {
      kind = 'docx';
      text = await docxText(buf);
    } else if (['txt', 'md', 'rst', 'py', 'js', 'jsx', 'ts', 'tsx', 'html', 'css', 'json', 'sql'].includes(ext)) {
      kind = 'text';
      text = buf.toString('utf8');
    }
  } catch {
    return {
      readable: false,
      kind,
      text: '',
      outline: [],
      note: 'We could not open that file. It may be damaged or password-protected. You can paste its table of contents instead.',
    };
  }

  if (kind === 'unsupported') {
    return {
      readable: false,
      kind,
      text: '',
      outline: [],
      note: 'We can read .zip course archives, PDF, Word (.docx), Markdown, text, and starter code files. Videos are never accepted.',
    };
  }

  text = text.trim();
  if (text.length < 20) {
    return {
      readable: false,
      kind,
      text: '',
      outline: [],
      note: 'No readable text was found. Scanned or image-only files cannot be read automatically, so paste the table of contents instead.',
    };
  }

  const outline = toOutline(text);
  return {
    readable: true,
    kind,
    text: text.slice(0, MAX_TEXT_CHARS),
    outline,
    note: outline.length
      ? `Found ${outline.length} possible modules/topics. Review them below before saving.`
      : 'We read the file cleanly. Paste or refine your lesson list below.',
  };
}
