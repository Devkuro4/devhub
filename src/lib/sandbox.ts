import JSZip from 'jszip';
import type { SubmittedFile } from '../types';

export const MAX_FILE_BYTES = 512 * 1024; // 512 KB per individual text/code file
export const MAX_ZIP_BYTES = 2 * 1024 * 1024; // 2 MB max ZIP upload
export const MAX_EXTRACTED_FILES = 10;

const ALLOWED_CODE_EXTS = new Set([
  'js', 'jsx', 'mjs', 'cjs',
  'ts', 'tsx',
  'py',
  'html', 'htm', 'css', 'scss',
  'java', 'c', 'h', 'cpp', 'hpp',
  'php', 'rb', 'go', 'rs', 'sql',
  'json', 'md', 'txt', 'yml', 'yaml', 'xml', 'sh'
]);

function getExt(filename: string): string {
  const parts = filename.toLowerCase().split('.');
  return parts.length > 1 ? parts[parts.length - 1] : '';
}

export function isAllowedCodeFile(filename: string): boolean {
  const ext = getExt(filename);
  return ALLOWED_CODE_EXTS.has(ext);
}

export async function readSubmittedFiles(fileList: FileList | File[]): Promise<{
  files: SubmittedFile[];
  warnings: string[];
}> {
  const files: SubmittedFile[] = [];
  const warnings: string[] = [];
  const list = Array.from(fileList);

  for (const file of list) {
    const ext = getExt(file.name);
    if (ext === 'zip') {
      if (file.size > MAX_ZIP_BYTES) {
        warnings.push(`${file.name} exceeds the 2 MB ZIP limit. Upload only your own code files (not node_modules or course videos).`);
        continue;
      }
      try {
        const zip = await JSZip.loadAsync(file);
        let extractedCount = 0;
        for (const [entryName, entry] of Object.entries(zip.files)) {
          if (entry.dir) continue;
          if (/node_modules\/|\.git\/|dist\/|__MACOSX\//i.test(entryName)) continue;
          if (!isAllowedCodeFile(entryName)) continue;
          if (extractedCount >= MAX_EXTRACTED_FILES) {
            warnings.push(`Extracted the first ${MAX_EXTRACTED_FILES} code files from ${file.name}.`);
            break;
          }
          const text = await entry.async('string');
          if (text.length > MAX_FILE_BYTES) {
            warnings.push(`Skipped ${entryName} inside ZIP because it is larger than 512 KB.`);
            continue;
          }
          files.push({ name: entryName, size: text.length, content: text });
          extractedCount += 1;
        }
        if (extractedCount === 0) {
          warnings.push(`No readable code files were found inside ${file.name}.`);
        }
      } catch {
        warnings.push(`Could not read ${file.name} as a ZIP archive.`);
      }
      continue;
    }

    if (!isAllowedCodeFile(file.name)) {
      warnings.push(`Skipped ${file.name} — only code, markup, JSON, SQL, and text files are supported (no binaries or videos).`);
      continue;
    }
    if (file.size > MAX_FILE_BYTES) {
      warnings.push(`Skipped ${file.name} — file exceeds the 512 KB limit.`);
      continue;
    }
    const content = await file.text();
    files.push({ name: file.name, size: file.size, content });
  }

  return { files, warnings };
}

/**
 * Safely runs simple JavaScript in an isolated Web Worker with a 2-second timeout.
 * Never executes submitted code on the server or with access to DOM / window / localStorage.
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
