import JSZip from 'jszip';
import type { SubmittedFile } from '../types';
import { extractCourseMaterial } from './aiClient';

export const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2 MB for documents/text attachments
export const MAX_ZIP_BYTES = 10 * 1024 * 1024; // 10 MB max assignment ZIP upload
export const MAX_UNCOMPRESSED_ZIP_BYTES = 20 * 1024 * 1024;
export const MAX_EXTRACTED_FILES = 15;

const ALLOWED_CODE_EXTS = new Set([
  'js', 'jsx', 'mjs', 'cjs',
  'ts', 'tsx',
  'py',
  'html', 'htm', 'css', 'scss',
  'java', 'c', 'h', 'cpp', 'hpp',
  'php', 'rb', 'go', 'rs', 'sql',
  'json', 'md', 'txt', 'yml', 'yaml', 'xml', 'sh'
]);

const DOCUMENT_EXTS = new Set(['pdf', 'docx']);

const VIDEO_OR_AUDIO_EXT_RE = /\.(mp4|mov|mkv|webm|avi|m4v|wmv|flv|mpeg|mpg|3gp|m4a|mp3|wav|ogg|aac|flac)$/i;
const BLOCKED_EXECUTABLE_RE = /\.(exe|dll|bat|cmd|ps1|msi|vbs|vbe|jar|com|scr|pif|app|dmg|pkg|deb|rpm|so|dylib|elf|bin|wasm|iso|img|sys|drv|cpl|hta|reg)$/i;

function getExt(filename: string): string {
  const parts = filename.toLowerCase().split('.');
  return parts.length > 1 ? parts[parts.length - 1] : '';
}

function isSafeArchiveEntryPath(entryName: string): boolean {
  if (!entryName || entryName.includes('\0') || entryName.includes('\\') || /^[A-Za-z]:/.test(entryName) || entryName.startsWith('/')) {
    return false;
  }
  return !entryName.split('/').some((seg) => seg === '..');
}

export function isAllowedCodeFile(filename: string): boolean {
  const ext = getExt(filename);
  return ALLOWED_CODE_EXTS.has(ext);
}

export function isAllowedAttachmentFile(filename: string): boolean {
  const ext = getExt(filename);
  return ALLOWED_CODE_EXTS.has(ext) || DOCUMENT_EXTS.has(ext);
}

export async function readSubmittedFiles(fileList: FileList | File[], userId?: string): Promise<{
  files: SubmittedFile[];
  warnings: string[];
}> {
  const files: SubmittedFile[] = [];
  const warnings: string[] = [];
  const list = Array.from(fileList);

  for (const file of list) {
    if (VIDEO_OR_AUDIO_EXT_RE.test(file.name)) {
      warnings.push(`Skipped ${file.name} — video and audio files stay on your device and are never uploaded.`);
      continue;
    }
    if (BLOCKED_EXECUTABLE_RE.test(file.name)) {
      warnings.push(`Blocked ${file.name} — executable or binary files are not allowed.`);
      continue;
    }

    const ext = getExt(file.name);
    if (ext === 'zip') {
      if (file.size > MAX_ZIP_BYTES) {
        warnings.push(`${file.name} exceeds the 10 MB ZIP limit. Upload only your own code or assignment documents.`);
        continue;
      }
      try {
        const zip = await JSZip.loadAsync(file);
        const entries = Object.entries(zip.files);
        if (entries.length > 300) {
          warnings.push(`Blocked ${file.name} — archive contains too many entries.`);
          continue;
        }
        let extractedCount = 0;
        let cumulativeBytes = 0;
        for (const [entryName, entry] of entries) {
          if (entry.dir) continue;
          if (!isSafeArchiveEntryPath(entryName)) {
            warnings.push(`Blocked unsafe archive path: ${entryName}`);
            continue;
          }
          if (/node_modules\/|\.git\/|dist\/|__MACOSX\//i.test(entryName)) continue;
          if (VIDEO_OR_AUDIO_EXT_RE.test(entryName)) {
            warnings.push(`Skipped video/audio entry ${entryName} inside ZIP.`);
            continue;
          }
          if (BLOCKED_EXECUTABLE_RE.test(entryName)) {
            warnings.push(`Blocked executable entry ${entryName} inside ZIP.`);
            continue;
          }
          if (!isAllowedCodeFile(entryName)) continue;
          if (extractedCount >= MAX_EXTRACTED_FILES) {
            warnings.push(`Extracted the first ${MAX_EXTRACTED_FILES} code/text files from ${file.name}.`);
            break;
          }
          const text = await entry.async('string');
          cumulativeBytes += text.length;
          if (cumulativeBytes > MAX_UNCOMPRESSED_ZIP_BYTES) {
            warnings.push(`Stopped extracting ${file.name} — uncompressed size exceeded safety limits.`);
            break;
          }
          if (text.length > MAX_FILE_BYTES) {
            warnings.push(`Skipped ${entryName} inside ZIP because it exceeds 2 MB.`);
            continue;
          }
          files.push({ name: entryName, size: text.length, content: text });
          extractedCount += 1;
        }
        if (extractedCount === 0) {
          warnings.push(`No readable code or Markdown files were found inside ${file.name}.`);
        }
      } catch {
        warnings.push(`Could not read ${file.name} as a ZIP archive.`);
      }
      continue;
    }

    if (!isAllowedAttachmentFile(file.name)) {
      warnings.push(`Skipped ${file.name} — attach source code, Markdown, TXT, PDF, DOCX, or a clean ZIP (never binaries or videos).`);
      continue;
    }
    if (file.size > MAX_FILE_BYTES) {
      warnings.push(`Skipped ${file.name} — file exceeds the 2 MB limit.`);
      continue;
    }

    if (DOCUMENT_EXTS.has(ext)) {
      try {
        const extracted = await extractCourseMaterial(file, userId);
        files.push({
          name: file.name,
          size: file.size,
          content: extracted.text || extracted.note || `[Attached ${ext.toUpperCase()} document: ${file.name}]`,
        });
      } catch {
        files.push({
          name: file.name,
          size: file.size,
          content: `[Attached ${ext.toUpperCase()} document: ${file.name}]`,
        });
      }
      continue;
    }

    const content = await file.text();
    files.push({ name: file.name, size: file.size, content });
  }

  return { files, warnings };
}

/**
 * Safely runs simple JavaScript in an isolated Web Worker with a 2-second timeout.
 * Never executes submitted or imported code on the server or with access to DOM / window / localStorage.
 */
export async function runSafeJavaScriptSandbox(code: string): Promise<{
  executed: boolean;
  output: string;
  error?: string;
}> {
  const trimmed = code.trim();
  if (!trimmed) {
    return { executed: false, output: 'No code provided to run.' };
  }

  if (typeof Worker === 'undefined' || typeof Blob === 'undefined') {
    return { executed: false, output: 'Browser sandbox is unavailable here; static code review will be used.' };
  }

  return new Promise((resolve) => {
    const workerSource = `
      self.onmessage = function(ev) {
        const logs = [];
        const fmt = (v) => {
          try {
            if (typeof v === 'string') return v;
            return JSON.stringify(v);
          } catch {
            return String(v);
          }
        };
        const consoleProxy = {
          log: (...args) => logs.push(args.map(fmt).join(' ')),
          warn: (...args) => logs.push('[warn] ' + args.map(fmt).join(' ')),
          error: (...args) => logs.push('[error] ' + args.map(fmt).join(' '))
        };
        try {
          const fn = new Function('console', ev.data.code);
          const result = fn(consoleProxy);
          if (result !== undefined) {
            logs.push('Return value: ' + fmt(result));
          }
          self.postMessage({ ok: true, output: logs.join('\\n') || 'Code ran cleanly with no console output.' });
        } catch (err) {
          self.postMessage({ ok: false, error: err && err.message ? err.message : String(err), output: logs.join('\\n') });
        }
      };
    `;

    const blob = new Blob([workerSource], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    const worker = new Worker(url);

    const cleanup = () => {
      clearTimeout(timer);
      worker.terminate();
      URL.revokeObjectURL(url);
    };

    const timer = setTimeout(() => {
      cleanup();
      resolve({
        executed: true,
        output: 'Stopped after 2 seconds (possible infinite loop or long-running operation).',
        error: 'Execution timed out after 2000ms.',
      });
    }, 2000);

    worker.onmessage = (e) => {
      cleanup();
      if (e.data?.ok) {
        resolve({ executed: true, output: e.data.output });
      } else {
        resolve({
          executed: true,
          output: e.data?.output ? `${e.data.output}\nRuntime error: ${e.data.error}` : `Runtime error: ${e.data?.error}`,
          error: e.data?.error,
        });
      }
    };

    worker.onerror = (e) => {
      cleanup();
      resolve({
        executed: true,
        output: `Syntax or runtime error: ${e.message}`,
        error: e.message,
      });
    };

    worker.postMessage({ code: trimmed });
  });
}
