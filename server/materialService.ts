import crypto from 'node:crypto';
import JSZip from 'jszip';
import { extractText, getDocumentProxy } from 'unpdf';
import type {
  ImportedMaterialFile,
  ImportedMaterialFileKind,
  ImportedMaterialPack,
} from '../src/types.ts';

export const MAX_MATERIAL_BYTES = 25 * 1024 * 1024;
export const MAX_ZIP_ENTRIES = 400;
export const MAX_UNCOMPRESSED_BYTES = 40 * 1024 * 1024;
export const MAX_SINGLE_ENTRY_BYTES = 3 * 1024 * 1024;
export const MAX_COMPRESSION_RATIO = 100;
const MAX_TEXT_CHARS = 60_000;
const MAX_FILE_PREVIEW_CHARS = 24_000;

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
  skippedBlockedCount?: number;
  note: string;
}

export class UnsafeArchiveError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

const OUTLINE_RE = /^\s*(?:(?:module|lesson|chapter|section|unit|week|part|day|lab|exercise|project)\s*\d+\b|\d{1,2}(?:\.\d{1,2})*[.)]\s+\S)/i;

export const VIDEO_OR_AUDIO_EXT_RE =
  /\.(mp4|mov|mkv|webm|avi|m4v|wmv|flv|mpeg|mpg|3gp|m4a|mp3|wav|ogg|aac|flac)$/i;
export const BLOCKED_EXT_RE =
  /\.(exe|dll|bat|cmd|ps1|msi|vbs|vbe|jar|com|scr|pif|app|dmg|pkg|deb|rpm|so|dylib|elf|bin|wasm|iso|img|sys|drv|cpl|hta|reg)$/i;
const IGNORED_ZIP_PATH_RE = /(^|\/)(node_modules|\.git|__MACOSX|dist|build|\.next|venv|\.venv)\//i;
const TEXT_LIKE_EXT_RE =
  /\.(md|markdown|txt|rst|json|py|js|jsx|mjs|cjs|ts|tsx|html|htm|css|scss|sql|sh|yml|yaml|xml|java|c|h|cpp|hpp|go|rs|rb|php|ipynb|csv)$/i;
const DOC_EXT_RE = /\.(pdf|docx)$/i;

/**
 * Validates archive entry names against path traversal, drive letters, null bytes,
 * backslashes, and unsafe segments. Returns a normalized relative POSIX path or throws.
 */
export function validateSafeArchivePath(rawPath: string): string {
  const pathStr = String(rawPath || '');
  if (!pathStr || pathStr.includes('\0')) {
    throw new UnsafeArchiveError('Archive rejected: invalid or null-byte file path detected.');
  }
  if (pathStr.includes('\\') || /^[A-Za-z]:/.test(pathStr) || pathStr.startsWith('/')) {
    throw new UnsafeArchiveError(`Archive rejected: unsafe extraction path "${pathStr}".`);
  }
  const segments = pathStr.split('/').filter((s) => s.length > 0);
  if (segments.length === 0) {
    throw new UnsafeArchiveError('Archive rejected: empty entry path.');
  }
  for (const seg of segments) {
    if (seg === '.' || seg === '..') {
      throw new UnsafeArchiveError(`Archive rejected: path traversal segment detected in "${pathStr}".`);
    }
  }
  return segments.join('/');
}

/**
 * Inspects raw PKZIP Central Directory & Local File Headers before JSZip normalizes paths,
 * ensuring traversal sequences like `../` or leading `/` are always caught and rejected.
 */
export function assertNoRawZipPathTraversal(buf: Buffer): void {
  const minPos = Math.max(0, buf.length - 65558);
  let eocdPos = -1;
  for (let i = buf.length - 22; i >= minPos; i--) {
    if (buf[i] === 0x50 && buf[i + 1] === 0x4b && buf[i + 2] === 0x05 && buf[i + 3] === 0x06) {
      eocdPos = i;
      break;
    }
  }
  if (eocdPos === -1 || eocdPos + 20 > buf.length) return;

  const cdSize = buf.readUInt32LE(eocdPos + 12);
  const cdOffset = buf.readUInt32LE(eocdPos + 16);
  if (cdOffset === 0xffffffff || cdSize === 0xffffffff) return;
  const cdEnd = Math.min(buf.length, cdOffset + cdSize);
  let pos = cdOffset;
  let count = 0;

  while (pos + 46 <= cdEnd && count < MAX_ZIP_ENTRIES * 4) {
    if (buf.readUInt32LE(pos) !== 0x02014b50) break;
    count += 1;
    const nameLen = buf.readUInt16LE(pos + 28);
    const extraLen = buf.readUInt16LE(pos + 30);
    const commentLen = buf.readUInt16LE(pos + 32);
    const localOffset = buf.readUInt32LE(pos + 42);
    if (pos + 46 + nameLen <= buf.length) {
      const cdName = buf.subarray(pos + 46, pos + 46 + nameLen).toString('utf8');
      if (cdName.startsWith('/') || cdName.startsWith('\\')) {
        throw new UnsafeArchiveError(`Archive rejected: unsafe extraction path "${cdName}".`);
      }
      const trimmed = cdName.endsWith('/') ? cdName.slice(0, -1) : cdName;
      if (trimmed) validateSafeArchivePath(trimmed);
    }
    if (localOffset + 30 <= buf.length && buf.readUInt32LE(localOffset) === 0x04034b50) {
      const lfhNameLen = buf.readUInt16LE(localOffset + 26);
      if (localOffset + 30 + lfhNameLen <= buf.length) {
        const lfhName = buf.subarray(localOffset + 30, localOffset + 30 + lfhNameLen).toString('utf8');
        if (lfhName.startsWith('/') || lfhName.startsWith('\\')) {
          throw new UnsafeArchiveError(`Archive rejected: unsafe extraction path "${lfhName}".`);
        }
        const trimmedLfh = lfhName.endsWith('/') ? lfhName.slice(0, -1) : lfhName;
        if (trimmedLfh) validateSafeArchivePath(trimmedLfh);
      }
    }
    pos += 46 + nameLen + extraLen + commentLen;
  }
}

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
  if (/\.(pdf|md|markdown|txt|docx)$/.test(lower)) return 'reading';
  return 'lesson';
}

function classifyMaterialFileKind(filePath: string, ext: string): ImportedMaterialFileKind {
  const lower = filePath.toLowerCase();
  if (ext === 'pdf') return 'pdf';
  if (ext === 'md' || ext === 'markdown') return 'markdown';
  if (/project|capstone|portfolio/.test(lower)) return 'project';
  if (/exercise|practice|lab|assignment|challenge|homework/.test(lower)) return 'exercise';
  if (['js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx', 'py', 'html', 'htm', 'css', 'scss', 'sql', 'java', 'c', 'h', 'cpp', 'hpp', 'go', 'rs', 'rb', 'php', 'json', 'sh', 'ipynb'].includes(ext)) {
    return 'code';
  }
  if (ext === 'docx') return 'document';
  if (ext === 'txt' || ext === 'rst') return 'notes';
  return 'document';
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

function getFileExtension(pathStr: string): string {
  const base = pathStr.split('/').pop() || '';
  const idx = base.lastIndexOf('.');
  return idx > 0 ? base.slice(idx + 1).toLowerCase() : '';
}

function formatReadablePackTitle(filename: string): string {
  return String(filename || 'Imported Materials')
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || 'Imported Course Materials';
}

function inspectZipMetadataSafety(entry: JSZip.JSZipObject, compressedZipSize: number): number {
  // JSZip exposes _data.uncompressedSize on deflated/stored entries
  const meta = (entry as any)._data;
  const declaredUncompressed = Number(meta?.uncompressedSize || 0);
  const declaredCompressed = Number(meta?.compressedSize || 0);
  if (declaredUncompressed > MAX_SINGLE_ENTRY_BYTES * 3) {
    throw new UnsafeArchiveError(`Archive rejected: entry "${entry.name}" exceeds maximum allowed file size.`);
  }
  if (declaredCompressed > 0 && declaredUncompressed / declaredCompressed > MAX_COMPRESSION_RATIO) {
    throw new UnsafeArchiveError(`Archive rejected: suspicious compression ratio in "${entry.name}" (possible ZIP bomb).`);
  }
  if (compressedZipSize > 0 && declaredUncompressed > MAX_UNCOMPRESSED_BYTES) {
    throw new UnsafeArchiveError('Archive rejected: uncompressed size exceeds safety limit (possible ZIP bomb).');
  }
  return Math.max(0, declaredUncompressed);
}

/**
 * Safely parses an uploaded course ZIP or supported document into an ImportedMaterialPack.
 * Strictly guards against ZIP bombs, path traversal, malicious extensions, and videos.
 */
export async function parseArchiveToMaterialPack(
  ownerId: string,
  filename: string,
  buf: Buffer,
  options?: { title?: string; linkedCourseId?: string; linkedSelfDirectedId?: string }
): Promise<ImportedMaterialPack> {
  if (!buf || buf.length === 0) {
    throw new UnsafeArchiveError('No file data received.');
  }
  if (buf.length > MAX_MATERIAL_BYTES) {
    throw new UnsafeArchiveError('File exceeds the 25 MB maximum upload limit.');
  }

  const safeTopName = filename.split(/[/\\]/).pop() || 'course-material';
  if (VIDEO_OR_AUDIO_EXT_RE.test(safeTopName)) {
    throw new UnsafeArchiveError(
      'Video and audio files must remain on your device and are never uploaded or processed.'
    );
  }
  if (BLOCKED_EXT_RE.test(safeTopName)) {
    throw new UnsafeArchiveError(`Blocked potentially unsafe file extension: ${safeTopName}`);
  }

  const topExt = getFileExtension(safeTopName);
  const importedAt = new Date().toISOString();
  const packId = `pack-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;

  // Single non-ZIP document / code / note
  if (topExt !== 'zip') {
    if (!TEXT_LIKE_EXT_RE.test(safeTopName) && !DOC_EXT_RE.test(safeTopName)) {
      throw new UnsafeArchiveError(
        'Unsupported file type. Upload a .zip archive, PDF, Word (.docx), Markdown, text, or source code file.'
      );
    }
    const single = await extractMaterial(safeTopName, buf);
    const kind = classifyMaterialFileKind(safeTopName, topExt);
    const preview = single.text ? single.text.slice(0, MAX_FILE_PREVIEW_CHARS) : '';
    const fileEntry: ImportedMaterialFile = {
      id: `mf-${crypto.randomBytes(4).toString('hex')}`,
      path: safeTopName,
      name: safeTopName,
      folder: 'Root',
      kind,
      ext: topExt,
      size: buf.length,
      contentPreview: preview || single.note || 'No readable text preview available.',
      truncated: Boolean(single.text && single.text.length > MAX_FILE_PREVIEW_CHARS),
    };
    return {
      id: packId,
      ownerId,
      title: options?.title?.trim() || formatReadablePackTitle(safeTopName),
      archiveName: safeTopName,
      importedAt,
      totalFiles: 1,
      skippedVideoCount: 0,
      skippedVideoNames: [],
      skippedBlockedCount: 0,
      folders: ['Root'],
      files: [fileEntry],
      outline: single.outline.slice(0, 60),
      linkedCourseId: options?.linkedCourseId,
      linkedSelfDirectedId: options?.linkedSelfDirectedId,
    };
  }

  assertNoRawZipPathTraversal(buf);

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buf);
  } catch {
    throw new UnsafeArchiveError('Could not read archive. Ensure it is a valid, unencrypted .zip file.');
  }

  const allEntries = Object.values(zip.files);
  if (allEntries.length > MAX_ZIP_ENTRIES * 2) {
    throw new UnsafeArchiveError(`Archive rejected: too many entries (limit ${MAX_ZIP_ENTRIES} files).`);
  }

  const skippedVideoNames: string[] = [];
  let skippedBlockedCount = 0;
  let declaredTotalBytes = 0;
  let inspectedCount = 0;
  const candidateEntries: { entry: JSZip.JSZipObject; safePath: string; ext: string }[] = [];

  for (const entry of allEntries) {
    if (entry.dir) continue;
    const safePath = validateSafeArchivePath(entry.name);
    if (IGNORED_ZIP_PATH_RE.test(safePath)) continue;

    inspectedCount += 1;
    if (inspectedCount > MAX_ZIP_ENTRIES) {
      throw new UnsafeArchiveError(`Archive rejected: more than ${MAX_ZIP_ENTRIES} files inside archive.`);
    }

    declaredTotalBytes += inspectZipMetadataSafety(entry, buf.length);
    if (declaredTotalBytes > MAX_UNCOMPRESSED_BYTES) {
      throw new UnsafeArchiveError('Archive rejected: uncompressed content exceeds 40 MB safety limit.');
    }

    if (VIDEO_OR_AUDIO_EXT_RE.test(safePath)) {
      skippedVideoNames.push(safePath);
      continue;
    }
    if (BLOCKED_EXT_RE.test(safePath)) {
      skippedBlockedCount += 1;
      continue;
    }
    if (!TEXT_LIKE_EXT_RE.test(safePath) && !DOC_EXT_RE.test(safePath)) {
      // Non-malicious binary assets (e.g. png/jpg) aren't study text; skip safely
      continue;
    }

    candidateEntries.push({
      entry,
      safePath,
      ext: getFileExtension(safePath),
    });
  }

  candidateEntries.sort((a, b) => a.safePath.localeCompare(b.safePath, undefined, { numeric: true }));

  let cumulativeExtractedBytes = 0;
  const importedFiles: ImportedMaterialFile[] = [];
  const folderSet = new Set<string>();
  const outline: string[] = [];
  const seenOutline = new Set<string>();

  const pushOutline = (line: string) => {
    const clean = line.replace(/\s+/g, ' ').trim();
    if (!clean || clean.length < 3 || clean.length > 120) return;
    const key = clean.toLowerCase();
    if (seenOutline.has(key)) return;
    seenOutline.add(key);
    outline.push(clean);
  };

  for (const item of candidateEntries) {
    if (importedFiles.length >= 160) break;

    const rawBytes = await item.entry.async('uint8array');
    if (rawBytes.byteLength > MAX_SINGLE_ENTRY_BYTES) {
      skippedBlockedCount += 1;
      continue;
    }
    cumulativeExtractedBytes += rawBytes.byteLength;
    if (cumulativeExtractedBytes > MAX_UNCOMPRESSED_BYTES) {
      throw new UnsafeArchiveError('Archive rejected: extracted bytes exceeded 40 MB safety limit (ZIP bomb protection).');
    }

    // Double check magic ratio after actual decompression
    const compressedGuess = Number((item.entry as any)._data?.compressedSize || 0);
    if (compressedGuess > 64 && rawBytes.byteLength / compressedGuess > MAX_COMPRESSION_RATIO) {
      throw new UnsafeArchiveError(`Archive rejected: suspicious compression expansion in "${item.safePath}".`);
    }

    let textContent = '';
    try {
      if (item.ext === 'pdf') {
        const pdf = await getDocumentProxy(rawBytes);
        const res = await extractText(pdf, { mergePages: true });
        textContent = (Array.isArray(res.text) ? res.text.join('\n') : res.text).trim();
      } else if (item.ext === 'docx') {
        textContent = (await docxText(Buffer.from(rawBytes))).trim();
      } else {
        textContent = Buffer.from(rawBytes).toString('utf8').replace(/\0/g, '').trim();
      }
    } catch {
      textContent = '';
    }

    const parts = item.safePath.split('/');
    const fileName = parts[parts.length - 1] || item.safePath;
    const folder = parts.length > 1 ? parts.slice(0, -1).join('/') : 'Root';
    folderSet.add(folder);

    const truncated = textContent.length > MAX_FILE_PREVIEW_CHARS;
    const contentPreview = textContent
      ? textContent.slice(0, MAX_FILE_PREVIEW_CHARS)
      : `[${item.ext.toUpperCase()} document — no extractable plain text]`;

    importedFiles.push({
      id: `mf-${crypto.randomBytes(4).toString('hex')}`,
      path: item.safePath,
      name: fileName,
      folder,
      kind: classifyMaterialFileKind(item.safePath, item.ext),
      ext: item.ext,
      size: rawBytes.byteLength,
      contentPreview,
      truncated,
    });

    if (
      outline.length < 50 &&
      (item.ext === 'md' || item.ext === 'markdown' || item.ext === 'txt' || item.ext === 'pdf' || /readme|syllabus|outline/i.test(item.safePath))
    ) {
      for (const h of toOutline(textContent)) {
        pushOutline(h);
      }
    }
  }

  if (outline.length < 25) {
    for (const f of importedFiles) {
      pushOutline(cleanEntryTitle(f.path));
      if (outline.length >= 60) break;
    }
  }

  if (importedFiles.length === 0 && skippedVideoNames.length === 0) {
    throw new UnsafeArchiveError('No supported course materials (PDF, Markdown, notes, or source code) were found in that archive.');
  }

  return {
    id: packId,
    ownerId,
    title: options?.title?.trim() || formatReadablePackTitle(safeTopName),
    archiveName: safeTopName,
    importedAt,
    totalFiles: importedFiles.length,
    skippedVideoCount: skippedVideoNames.length,
    skippedVideoNames: skippedVideoNames.slice(0, 60),
    skippedBlockedCount,
    folders: Array.from(folderSet).sort((a, b) => a.localeCompare(b)),
    files: importedFiles,
    outline: outline.slice(0, 60),
    linkedCourseId: options?.linkedCourseId,
    linkedSelfDirectedId: options?.linkedSelfDirectedId,
  };
}

/**
 * Builds an ImportedMaterialPack from client pre-screened safe text files
 * (used when the browser stripped videos locally before transmitting anything).
 */
export function buildPackFromSanitizedFiles(
  ownerId: string,
  input: {
    archiveName: string;
    title?: string;
    skippedVideoNames?: string[];
    skippedBlockedCount?: number;
    linkedCourseId?: string;
    linkedSelfDirectedId?: string;
    safeFiles: { path: string; size: number; contentPreview: string }[];
  }
): ImportedMaterialPack {
  const archiveName = String(input.archiveName || 'course-archive.zip').split(/[/\\]/).pop() || 'course-archive.zip';
  const rawFiles = Array.isArray(input.safeFiles) ? input.safeFiles : [];
  if (rawFiles.length > MAX_ZIP_ENTRIES) {
    throw new UnsafeArchiveError(`Too many files in import batch (max ${MAX_ZIP_ENTRIES}).`);
  }

  const importedFiles: ImportedMaterialFile[] = [];
  const folderSet = new Set<string>();
  const outline: string[] = [];
  const seenOutline = new Set<string>();
  let skippedBlockedCount = Math.max(0, Number(input.skippedBlockedCount || 0));
  const skippedVideoNames: string[] = Array.isArray(input.skippedVideoNames)
    ? input.skippedVideoNames.map((n) => String(n)).slice(0, 60)
    : [];

  const pushOutline = (line: string) => {
    const clean = line.replace(/\s+/g, ' ').trim();
    if (!clean || clean.length < 3 || clean.length > 120) return;
    const key = clean.toLowerCase();
    if (seenOutline.has(key)) return;
    seenOutline.add(key);
    outline.push(clean);
  };

  for (const item of rawFiles.slice(0, 160)) {
    const safePath = validateSafeArchivePath(item.path);
    if (VIDEO_OR_AUDIO_EXT_RE.test(safePath)) {
      skippedVideoNames.push(safePath);
      continue;
    }
    if (BLOCKED_EXT_RE.test(safePath)) {
      skippedBlockedCount += 1;
      continue;
    }
    const ext = getFileExtension(safePath);
    if (!TEXT_LIKE_EXT_RE.test(safePath) && !DOC_EXT_RE.test(safePath)) continue;

    const parts = safePath.split('/');
    const name = parts[parts.length - 1] || safePath;
    const folder = parts.length > 1 ? parts.slice(0, -1).join('/') : 'Root';
    folderSet.add(folder);

    const text = String(item.contentPreview || '').replace(/\0/g, '').trim();
    const truncated = text.length > MAX_FILE_PREVIEW_CHARS;
    importedFiles.push({
      id: `mf-${crypto.randomBytes(4).toString('hex')}`,
      path: safePath,
      name,
      folder,
      kind: classifyMaterialFileKind(safePath, ext),
      ext,
      size: Math.max(0, Number(item.size || text.length)),
      contentPreview: text.slice(0, MAX_FILE_PREVIEW_CHARS) || `[${ext.toUpperCase()} document]`,
      truncated,
    });

    if (outline.length < 50 && (ext === 'md' || ext === 'markdown' || ext === 'txt' || /readme|syllabus|outline/i.test(safePath))) {
      for (const h of toOutline(text)) pushOutline(h);
    }
  }

  if (outline.length < 25) {
    for (const f of importedFiles) {
      pushOutline(cleanEntryTitle(f.path));
      if (outline.length >= 60) break;
    }
  }

  if (importedFiles.length === 0 && skippedVideoNames.length === 0) {
    throw new UnsafeArchiveError('No supported non-video learning files were found.');
  }

  return {
    id: `pack-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
    ownerId,
    title: input.title?.trim() || formatReadablePackTitle(archiveName),
    archiveName,
    importedAt: new Date().toISOString(),
    totalFiles: importedFiles.length,
    skippedVideoCount: skippedVideoNames.length,
    skippedVideoNames: Array.from(new Set(skippedVideoNames)).slice(0, 60),
    skippedBlockedCount,
    folders: Array.from(folderSet).sort((a, b) => a.localeCompare(b)),
    files: importedFiles,
    outline: outline.slice(0, 60),
    linkedCourseId: input.linkedCourseId,
    linkedSelfDirectedId: input.linkedSelfDirectedId,
  };
}

async function extractZipCourseArchive(buf: Buffer): Promise<MaterialResult> {
  if (buf.length > MAX_MATERIAL_BYTES) {
    throw new UnsafeArchiveError('Archive exceeds the 25 MB upload limit.');
  }
  assertNoRawZipPathTraversal(buf);
  const zip = await JSZip.loadAsync(buf);
  const rawEntries = Object.values(zip.files);
  if (rawEntries.length > MAX_ZIP_ENTRIES * 2) {
    throw new UnsafeArchiveError(`Archive rejected: too many entries (limit ${MAX_ZIP_ENTRIES} files).`);
  }

  let skippedVideoCount = 0;
  let skippedBlockedCount = 0;
  let declaredBytes = 0;
  const usableFiles: JSZip.JSZipObject[] = [];

  for (const entry of rawEntries) {
    if (entry.dir) continue;
    const safePath = validateSafeArchivePath(entry.name);
    if (IGNORED_ZIP_PATH_RE.test(safePath)) continue;
    if (usableFiles.length + skippedVideoCount + skippedBlockedCount >= MAX_ZIP_ENTRIES) {
      throw new UnsafeArchiveError(`Archive rejected: more than ${MAX_ZIP_ENTRIES} entries.`);
    }
    declaredBytes += inspectZipMetadataSafety(entry, buf.length);
    if (declaredBytes > MAX_UNCOMPRESSED_BYTES) {
      throw new UnsafeArchiveError('Archive rejected: uncompressed size exceeds safety limit (possible ZIP bomb).');
    }
    if (VIDEO_OR_AUDIO_EXT_RE.test(safePath)) {
      skippedVideoCount += 1;
      continue;
    }
    if (BLOCKED_EXT_RE.test(safePath)) {
      skippedBlockedCount += 1;
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
      skippedBlockedCount,
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

  let parsedDocs = 0;
  let totalRead = 0;
  for (const entry of usableFiles) {
    const lower = entry.name.toLowerCase();
    if (parsedDocs < 12 && (/readme|syllabus|outline|curriculum|index/i.test(lower) || /\.(md|txt)$/.test(lower))) {
      try {
        const bytes = await entry.async('uint8array');
        totalRead += bytes.byteLength;
        if (totalRead > MAX_UNCOMPRESSED_BYTES) {
          throw new UnsafeArchiveError('Archive rejected: uncompressed content exceeded safety limit.');
        }
        const content = Buffer.from(bytes).toString('utf8');
        if (content && content.trim().length >= 20) {
          parsedDocs += 1;
          textSnippets.push(`--- ${entry.name} ---\n${content.slice(0, 3000)}`);
          for (const h of toOutline(content)) {
            addOutline(h, classifyZipEntryKind(entry.name), entry.name.split('/')[0]);
          }
        }
      } catch (err) {
        if (err instanceof UnsafeArchiveError) throw err;
      }
    } else if (parsedDocs < 8 && lower.endsWith('.pdf')) {
      try {
        const ab = await entry.async('uint8array');
        totalRead += ab.byteLength;
        if (totalRead > MAX_UNCOMPRESSED_BYTES) {
          throw new UnsafeArchiveError('Archive rejected: uncompressed content exceeded safety limit.');
        }
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
      } catch (err) {
        if (err instanceof UnsafeArchiveError) throw err;
      }
    }
    if (outline.length >= 60) break;
  }

  if (outline.length < 40) {
    for (const entry of usableFiles.slice(0, 60)) {
      if (TEXT_LIKE_EXT_RE.test(entry.name) || DOC_EXT_RE.test(entry.name)) {
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
    skippedBlockedCount,
    note: `Scanned ${usableFiles.length} course file(s) from the archive${skippedVideoCount ? ` (${skippedVideoCount} video/audio file(s) skipped — videos are never uploaded or processed)` : ''}${skippedBlockedCount ? ` · ${skippedBlockedCount} blocked executable file(s)` : ''}. Found ${outline.length} structured study items.`,
  };
}

/** Reads text out of an uploaded course file or .zip archive. Strictly skips video/audio files & blocks unsafe archives. */
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
  if (BLOCKED_EXT_RE.test(filename)) {
    throw new UnsafeArchiveError(`Blocked executable or unsafe file extension: ${filename}`);
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
    } else if (['txt', 'md', 'markdown', 'rst', 'py', 'js', 'jsx', 'ts', 'tsx', 'html', 'htm', 'css', 'json', 'sql', 'sh', 'yml', 'yaml', 'java', 'c', 'cpp', 'go', 'rs'].includes(ext)) {
      kind = 'text';
      text = buf.toString('utf8').replace(/\0/g, '');
    }
  } catch (err) {
    if (err instanceof UnsafeArchiveError) throw err;
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
