import JSZip from 'jszip';
import { supabase } from './supabase';
import type {
  CodeSubmission,
  CourseItem,
  DailyTarget,
  ImportedMaterialPack,
  LearningPlan,
  SelfDirectedTopic,
  StudySessionLog,
} from '../types';

const API_BASE = String((import.meta as any).env?.VITE_API_URL || '')
  .trim()
  .replace(/^['"]|['"]$/g, '')
  .replace(/\/+$/, '');

export const MAX_CLIENT_MATERIAL_BYTES = 25 * 1024 * 1024;
export const MAX_CLIENT_ZIP_ENTRIES = 400;
export const MAX_CLIENT_UNCOMPRESSED_BYTES = 40 * 1024 * 1024;

const VIDEO_OR_AUDIO_EXT_RE =
  /\.(mp4|mov|mkv|webm|avi|m4v|wmv|flv|mpeg|mpg|3gp|m4a|mp3|wav|ogg|aac|flac)$/i;
const BLOCKED_EXT_RE =
  /\.(exe|dll|bat|cmd|ps1|msi|vbs|vbe|jar|com|scr|pif|app|dmg|pkg|deb|rpm|so|dylib|elf|bin|wasm|iso|img|sys|drv|cpl|hta|reg)$/i;
const IGNORED_ZIP_PATH_RE = /(^|\/)(node_modules|\.git|__MACOSX|dist|build|\.next|venv|\.venv)\//i;
const SUPPORTED_ENTRY_RE =
  /\.(pdf|docx|md|markdown|txt|rst|json|py|js|jsx|mjs|cjs|ts|tsx|html|htm|css|scss|sql|sh|yml|yaml|xml|java|c|h|cpp|hpp|go|rs|rb|php|ipynb|csv)$/i;

async function authHeaders(userId?: string): Promise<Record<string, string>> {
  const base: Record<string, string> = {};
  if (userId) base['X-Devhub-User'] = userId;
  if (!supabase) return base;
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (token) base.Authorization = `Bearer ${token}`;
  return base;
}

function validateSafeClientPath(entryName: string) {
  if (
    !entryName ||
    entryName.includes('\0') ||
    entryName.includes('\\') ||
    /^[A-Za-z]:/.test(entryName) ||
    entryName.startsWith('/') ||
    entryName.split('/').some((seg) => seg === '.' || seg === '..')
  ) {
    throw new Error(`Archive rejected: unsafe extraction path "${entryName}".`);
  }
}

/**
 * Inspects a ZIP or document file on the user's device first.
 * Guarantees that zero video/audio files are ever transmitted over HTTP to the server.
 */
export async function preScreenAndImportMaterial(
  file: File,
  userId?: string,
  options?: { title?: string; linkedCourseId?: string; linkedSelfDirectedId?: string }
): Promise<{ pack: ImportedMaterialPack }> {
  if (!file) throw new Error('Choose a file to import.');
  if (file.size === 0) throw new Error('That file is empty.');
  if (file.size > MAX_CLIENT_MATERIAL_BYTES) {
    throw new Error('File exceeds the 25 MB maximum archive size.');
  }
  if (VIDEO_OR_AUDIO_EXT_RE.test(file.name)) {
    throw new Error(
      'Video and audio files must remain on your device and are never uploaded. Track video lessons by link/bookmark inside your course instead.'
    );
  }
  if (BLOCKED_EXT_RE.test(file.name)) {
    throw new Error(`Blocked potentially unsafe file extension: ${file.name}`);
  }

  let uploadBlob: Blob = file;
  let skippedVideoNames: string[] = [];
  let skippedBlockedCount = 0;

  if (/\.zip$/i.test(file.name)) {
    let zip: JSZip;
    try {
      zip = await JSZip.loadAsync(file);
    } catch {
      throw new Error('Could not open that ZIP archive. Make sure it is a valid, unencrypted .zip file.');
    }

    const cleanZip = new JSZip();
    const entries = Object.entries(zip.files);
    if (entries.length > MAX_CLIENT_ZIP_ENTRIES * 2) {
      throw new Error(`Archive rejected: too many entries (limit ${MAX_CLIENT_ZIP_ENTRIES} files).`);
    }

    let keptCount = 0;
    let totalEntries = 0;
    let declaredUncompressed = 0;

    for (const [entryName, entry] of entries) {
      if (entry.dir) continue;
      validateSafeClientPath(entryName);
      if (IGNORED_ZIP_PATH_RE.test(entryName)) continue;

      totalEntries += 1;
      if (totalEntries > MAX_CLIENT_ZIP_ENTRIES) {
        throw new Error(`Archive rejected: more than ${MAX_CLIENT_ZIP_ENTRIES} files in archive.`);
      }

      const meta = (entry as any)._data;
      const uncompressedSize = Number(meta?.uncompressedSize || 0);
      const compressedSize = Number(meta?.compressedSize || 0);
      if (compressedSize > 0 && uncompressedSize / compressedSize > 100) {
        throw new Error(`Archive rejected: suspicious compression ratio in "${entryName}" (ZIP bomb protection).`);
      }
      declaredUncompressed += uncompressedSize;
      if (declaredUncompressed > MAX_CLIENT_UNCOMPRESSED_BYTES) {
        throw new Error('Archive rejected: uncompressed size exceeds 40 MB safety limit.');
      }

      if (VIDEO_OR_AUDIO_EXT_RE.test(entryName)) {
        // Never even decompress or read video bytes!
        skippedVideoNames.push(entryName);
        continue;
      }
      if (BLOCKED_EXT_RE.test(entryName)) {
        skippedBlockedCount += 1;
        continue;
      }
      if (!SUPPORTED_ENTRY_RE.test(entryName)) {
        continue;
      }

      const bytes = await entry.async('uint8array');
      if (bytes.byteLength > 3 * 1024 * 1024) {
        skippedBlockedCount += 1;
        continue;
      }
      cleanZip.file(entryName, bytes);
      keptCount += 1;
    }

    if (keptCount === 0) {
      throw new Error(
        skippedVideoNames.length > 0
          ? `Skipped ${skippedVideoNames.length} video file(s) (videos stay on your device). No PDFs, Markdown, notes, or code files were found to import.`
          : 'No supported PDF, Markdown, notes, or source code files were found inside that archive.'
      );
    }

    // Re-pack cleanly so ZERO video bytes ever touch the network
    uploadBlob = await cleanZip.generateAsync({ type: 'blob' });
  } else if (!SUPPORTED_ENTRY_RE.test(file.name)) {
    throw new Error('Unsupported file format. Import a .zip archive, PDF, Word (.docx), Markdown, text, or code file.');
  }

  const headers: Record<string, string> = {
    ...(await authHeaders(userId)),
    'Content-Type': 'application/octet-stream',
    'X-Filename': encodeURIComponent(file.name),
  };
  if (options?.title?.trim()) headers['X-Material-Title'] = encodeURIComponent(options.title.trim());
  if (options?.linkedCourseId) headers['X-Course-Id'] = encodeURIComponent(options.linkedCourseId);
  if (skippedVideoNames.length > 0) {
    headers['X-Skipped-Videos'] = encodeURIComponent(JSON.stringify(skippedVideoNames.slice(0, 60)));
  }
  if (skippedBlockedCount > 0) {
    headers['X-Skipped-Blocked'] = String(skippedBlockedCount);
  }

  const res = await fetch(`${API_BASE}/api/learning/materials/import`, {
    method: 'POST',
    headers,
    body: uploadBlob,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Import failed (${res.status})`);
  return data as { pack: ImportedMaterialPack };
}

export async function fetchLearningState(userId?: string): Promise<{
  courses: CourseItem[];
  importedMaterials: ImportedMaterialPack[];
  selfDirectedTopics: SelfDirectedTopic[];
  learningPlans: LearningPlan[];
  dailyTarget: DailyTarget | null;
  codeSubmissions: CodeSubmission[];
  dailyLogs: any[];
  studySessions: StudySessionLog[];
}> {
  const res = await fetch(`${API_BASE}/api/learning/state`, {
    headers: await authHeaders(userId),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Could not load learning workspace (${res.status})`);
  return data;
}

export async function saveLearningState(
  userId: string | undefined,
  patch: {
    courses?: CourseItem[];
    importedMaterials?: ImportedMaterialPack[];
    selfDirectedTopics?: SelfDirectedTopic[];
    learningPlans?: LearningPlan[];
    dailyTarget?: DailyTarget | null;
    codeSubmissions?: CodeSubmission[];
    dailyLogs?: any[];
    studySessions?: StudySessionLog[];
  }
) {
  const res = await fetch(`${API_BASE}/api/learning/state`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaders(userId)),
    },
    body: JSON.stringify(patch),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Could not save learning state (${res.status})`);
  return data;
}

export async function fetchMaterialPack(packId: string, userId?: string): Promise<{ pack: ImportedMaterialPack }> {
  const res = await fetch(`${API_BASE}/api/learning/materials/${encodeURIComponent(packId)}`, {
    headers: await authHeaders(userId),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Could not load material pack (${res.status})`);
  return data;
}

export async function updateMaterialPack(
  packId: string,
  patch: { title?: string; linkedCourseId?: string; linkedSelfDirectedId?: string; notes?: string },
  userId?: string
): Promise<{ pack: ImportedMaterialPack }> {
  const res = await fetch(`${API_BASE}/api/learning/materials/${encodeURIComponent(packId)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaders(userId)),
    },
    body: JSON.stringify(patch),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Could not update material pack (${res.status})`);
  return data;
}

export async function deleteMaterialPack(packId: string, userId?: string) {
  const res = await fetch(`${API_BASE}/api/learning/materials/${encodeURIComponent(packId)}`, {
    method: 'DELETE',
    headers: await authHeaders(userId),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Could not delete material pack (${res.status})`);
  return data;
}

export async function saveLearningSubmission(
  submission: CodeSubmission,
  userId?: string
): Promise<{ submission: CodeSubmission; submissions: CodeSubmission[] }> {
  const res = await fetch(`${API_BASE}/api/learning/submissions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaders(userId)),
    },
    body: JSON.stringify({ submission }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Could not save submission (${res.status})`);
  return data;
}

export async function fetchSubmissionById(
  submissionId: string,
  userId?: string
): Promise<{ submission: CodeSubmission }> {
  const res = await fetch(`${API_BASE}/api/learning/submissions/${encodeURIComponent(submissionId)}`, {
    headers: await authHeaders(userId),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Could not load submission (${res.status})`);
  return data;
}
