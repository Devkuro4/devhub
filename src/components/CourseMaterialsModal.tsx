import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  FileCode2,
  FileText,
  FolderArchive,
  FolderOpen,
  Link2,
  Loader2,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import { Modal } from './ui';
import { requestExplainExcerpt } from '../lib/aiClient';
import {
  deleteMaterialPack,
  preScreenAndImportMaterial,
  updateMaterialPack,
} from '../lib/learningClient';
import type {
  CourseItem,
  ImportedMaterialFile,
  ImportedMaterialPack,
  OnboardingProfile,
  SelfDirectedTopic,
} from '../types';

export interface CourseMaterialsStyles {
  cardClass: string;
  borderClass: string;
  subtleBgClass: string;
  textPrimary: string;
  textSecondary: string;
  inputClass: string;
  btnPrimary: string;
  btnSecondary: string;
  darkMode: boolean;
}

function fileIconForKind(kind: ImportedMaterialFile['kind']) {
  if (kind === 'code' || kind === 'exercise' || kind === 'project') {
    return <FileCode2 className="w-4 h-4 text-[var(--accent-600)] shrink-0" aria-hidden="true" />;
  }
  return <FileText className="w-4 h-4 text-[var(--accent-600)] shrink-0" aria-hidden="true" />;
}

export const CourseMaterialsModal = ({
  open,
  onClose,
  mode,
  initialPackId,
  initialCourseId,
  userId,
  profile,
  courses,
  selfDirectedTopics,
  importedMaterials,
  setImportedMaterials,
  onConnectToCourse,
  onCreateCourseFromPack,
  onStartDailyTaskFromFile,
  onNotify,
  styles,
}: {
  open: boolean;
  onClose: () => void;
  mode: 'import' | 'browse';
  initialPackId?: string | null;
  initialCourseId?: string | null;
  userId?: string;
  profile: OnboardingProfile;
  courses: CourseItem[];
  selfDirectedTopics: SelfDirectedTopic[];
  importedMaterials: ImportedMaterialPack[];
  setImportedMaterials: React.Dispatch<React.SetStateAction<ImportedMaterialPack[]>>;
  onConnectToCourse: (packId: string, courseId: string) => void;
  onCreateCourseFromPack: (pack: ImportedMaterialPack) => void;
  onStartDailyTaskFromFile: (pack: ImportedMaterialPack, file: ImportedMaterialFile) => void;
  onNotify: (msg: string, tone?: 'success' | 'error') => void;
  styles: CourseMaterialsStyles;
}) => {
  const { borderClass, subtleBgClass, textPrimary, textSecondary, inputClass, btnPrimary, btnSecondary } = styles;

  const [activePackId, setActivePackId] = useState<string>(initialPackId || importedMaterials[0]?.id || '');
  const [selectedFolder, setSelectedFolder] = useState<string>('ALL');
  const [fileSearch, setFileSearch] = useState('');
  const [selectedFileId, setSelectedFileId] = useState<string>('');
  const [confirmDeletePackId, setConfirmDeletePackId] = useState<string | null>(null);

  // Import state
  const [importTitle, setImportTitle] = useState('');
  const [importCourseId, setImportCourseId] = useState(initialCourseId || '');
  const [importBusy, setImportBusy] = useState(false);
  const [importError, setImportError] = useState('');
  const [lastImportedPack, setLastImportedPack] = useState<ImportedMaterialPack | null>(null);

  // Explicit single-file AI explanation (never runs automatically, never sees full ZIP)
  const [explainQuestion, setExplainQuestion] = useState('');
  const [explainBusy, setExplainBusy] = useState(false);
  const [explainResult, setExplainResult] = useState<{
    fileId: string;
    summary: string;
    keyConcepts: string[];
    practicePrompt: string;
  } | null>(null);

  useEffect(() => {
    if (!open) return;
    if (initialPackId) setActivePackId(initialPackId);
    else if (!activePackId && importedMaterials[0]?.id) setActivePackId(importedMaterials[0].id);
    if (initialCourseId !== undefined && initialCourseId !== null) setImportCourseId(initialCourseId);
    setImportError('');
    setConfirmDeletePackId(null);
  }, [open, initialPackId, initialCourseId, importedMaterials]);

  const activePack = useMemo(
    () => importedMaterials.find((p) => p.id === activePackId) || lastImportedPack || importedMaterials[0] || null,
    [importedMaterials, activePackId, lastImportedPack]
  );

  const visibleFiles = useMemo(() => {
    if (!activePack) return [];
    const q = fileSearch.trim().toLowerCase();
    return activePack.files.filter((f) => {
      if (selectedFolder !== 'ALL' && f.folder !== selectedFolder) return false;
      if (q && !f.path.toLowerCase().includes(q) && !f.contentPreview.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [activePack, selectedFolder, fileSearch]);

  const activeFile = useMemo(() => {
    if (!visibleFiles.length) return activePack?.files[0] || null;
    return visibleFiles.find((f) => f.id === selectedFileId) || visibleFiles[0];
  }, [visibleFiles, activePack, selectedFileId]);

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImportBusy(true);
    setImportError('');
    try {
      const { pack } = await preScreenAndImportMaterial(file, userId, {
        title: importTitle.trim() || undefined,
        linkedCourseId: importCourseId || undefined,
      });
      setImportedMaterials((prev) => [pack, ...prev.filter((p) => p.id !== pack.id)]);
      setLastImportedPack(pack);
      setActivePackId(pack.id);
      setSelectedFolder('ALL');
      setSelectedFileId(pack.files[0]?.id || '');
      if (pack.linkedCourseId) {
        onConnectToCourse(pack.id, pack.linkedCourseId);
      }
      setImportTitle('');
      onNotify(
        pack.skippedVideoCount > 0
          ? `Imported ${pack.totalFiles} study file(s). ${pack.skippedVideoCount} video(s) stayed on your device.`
          : `Imported ${pack.totalFiles} course file(s) safely.`
      );
    } catch (err: any) {
      setImportError(err?.message || 'Could not import that course archive.');
    } finally {
      setImportBusy(false);
    }
  };

  const handleLinkPack = async (packId: string, courseId: string, selfId: string) => {
    try {
      const { pack } = await updateMaterialPack(
        packId,
        { linkedCourseId: courseId, linkedSelfDirectedId: selfId },
        userId
      );
      setImportedMaterials((prev) => prev.map((p) => (p.id === packId ? pack : p)));
      if (courseId) onConnectToCourse(packId, courseId);
      onNotify('Updated material connection.');
    } catch {
      // Fall back cleanly if offline/local
      setImportedMaterials((prev) =>
        prev.map((p) =>
          p.id === packId ? { ...p, linkedCourseId: courseId || undefined, linkedSelfDirectedId: selfId || undefined } : p
        )
      );
      if (courseId) onConnectToCourse(packId, courseId);
    }
  };

  const handleDeletePack = async (packId: string) => {
    try {
      await deleteMaterialPack(packId, userId);
    } catch {
      // ignore if local-only pack
    }
    setImportedMaterials((prev) => prev.filter((p) => p.id !== packId));
    setConfirmDeletePackId(null);
    if (activePackId === packId) {
      const remaining = importedMaterials.filter((p) => p.id !== packId);
      setActivePackId(remaining[0]?.id || '');
    }
    onNotify('Removed imported material pack.');
  };

  const handleExplainActiveFile = async () => {
    if (!activeFile) return;
    setExplainBusy(true);
    try {
      const res = await requestExplainExcerpt(
        {
          fileName: activeFile.name,
          fileKind: activeFile.kind,
          excerpt: activeFile.contentPreview.slice(0, 6000),
          question: explainQuestion.trim() || undefined,
          skillLevel: profile.skillLevel || 'Beginner',
          field: profile.field || 'Software Development',
        },
        userId
      );
      setExplainResult({
        fileId: activeFile.id,
        summary: res.data.summary,
        keyConcepts: res.data.keyConcepts || [],
        practicePrompt: res.data.practicePrompt || '',
      });
    } catch (err: any) {
      onNotify(err?.message || 'Could not explain this excerpt right now.', 'error');
    } finally {
      setExplainBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={mode === 'import' && !activePack ? 'Import Course Materials (.zip or Document)' : 'Downloaded Course Materials'}
    >
      <div className="space-y-5">
        {/* Compact Upload / Import Box */}
        <div className={`p-4 rounded-xl border ${borderClass} ${subtleBgClass} space-y-3`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <ShieldCheck className="w-4 h-4 text-[var(--success-ink)]" aria-hidden="true" />
              <span className={textPrimary}>Safe Course Import (Videos Never Leave Your Device)</span>
            </div>
            <span className={`text-xs ${textSecondary}`}>Max 25 MB · ZIP / PDF / MD / Code</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <input
              type="text"
              value={importTitle}
              onChange={(e) => setImportTitle(e.target.value)}
              placeholder="Pack label (optional, e.g. React Hooks Notes)"
              className={inputClass}
            />
            <select
              value={importCourseId}
              onChange={(e) => setImportCourseId(e.target.value)}
              className={inputClass}
              aria-label="Connect to course"
            >
              <option value="">Connect later (or create new course)</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  Link to: {c.title}
                </option>
              ))}
            </select>
          </div>

          <label
            className={`flex items-center gap-3 p-3.5 rounded-xl border-2 border-dashed ${borderClass} bg-[var(--surface-elevated)] cursor-pointer hover:border-[var(--accent-600)] transition-colors`}
          >
            {importBusy ? (
              <Loader2 className="w-5 h-5 text-[var(--accent-600)] animate-spin shrink-0" />
            ) : (
              <Upload className="w-5 h-5 text-[var(--accent-600)] shrink-0" />
            )}
            <div className="min-w-0 flex-1">
              <div className={`text-sm font-medium ${textPrimary}`}>
                {importBusy ? 'Scanning archive safety & extracting study files…' : 'Choose a .zip archive, PDF, Markdown, DOCX, or starter code file'}
              </div>
              <div className={`text-xs ${textSecondary}`}>
                Protects against path traversal, ZIP bombs & executables. Skips videos locally before upload.
              </div>
            </div>
            <input
              type="file"
              disabled={importBusy}
              accept=".zip,.pdf,.docx,.md,.markdown,.txt,.rst,.js,.jsx,.ts,.tsx,.py,.html,.css,.sql,.json,.java,.c,.cpp,.go,.rs"
              onChange={handleImportFile}
              className="sr-only"
            />
          </label>

          {importError && (
            <p role="alert" className="text-xs text-[var(--danger-ink)] flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
              <span>{importError}</span>
            </p>
          )}
        </div>

        {/* Pack Switcher + Browser */}
        {importedMaterials.length > 0 && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <FolderArchive className="w-4 h-4 text-[var(--accent-600)] shrink-0" />
                <select
                  aria-label="Select imported material pack"
                  value={activePack?.id || ''}
                  onChange={(e) => {
                    setActivePackId(e.target.value);
                    setSelectedFolder('ALL');
                    setSelectedFileId('');
                    setExplainResult(null);
                  }}
                  className={`${inputClass} !py-2`}
                >
                  {importedMaterials.map((pack) => (
                    <option key={pack.id} value={pack.id}>
                      {pack.title} ({pack.totalFiles} files)
                    </option>
                  ))}
                </select>
              </div>
              {activePack && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onCreateCourseFromPack(activePack)}
                    className={`${btnSecondary} !px-3 !py-2 text-xs`}
                  >
                    <Plus className="w-3.5 h-3.5" /> Create Course
                  </button>
                  {confirmDeletePackId === activePack.id ? (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleDeletePack(activePack.id)}
                        className="px-3 py-2 rounded-lg text-xs font-semibold bg-[var(--danger-ink)] text-white cursor-pointer"
                      >
                        Confirm Remove
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeletePackId(null)}
                        className={`${btnSecondary} !px-2.5 !py-2 text-xs`}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      aria-label="Delete pack"
                      onClick={() => setConfirmDeletePackId(activePack.id)}
                      className={`p-2 rounded-lg border ${borderClass} ${textSecondary} hover:text-[var(--danger-ink)] cursor-pointer`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              )}
            </div>

            {activePack && (
              <>
                <div className={`p-3.5 rounded-xl border ${borderClass} space-y-2.5`}>
                  <div className={`text-xs flex flex-wrap items-center gap-x-2 gap-y-1 ${textSecondary}`}>
                    <span><strong className={textPrimary}>{activePack.totalFiles}</strong> extracted files</span>
                    <span>·</span>
                    <span>{activePack.folders.length} folder{activePack.folders.length === 1 ? '' : 's'}</span>
                    {activePack.skippedVideoCount > 0 && (
                      <>
                        <span>·</span>
                        <span className="text-[var(--success-ink)] font-medium">
                          {activePack.skippedVideoCount} video file{activePack.skippedVideoCount === 1 ? '' : 's'} kept on device
                        </span>
                      </>
                    )}
                    {activePack.skippedBlockedCount > 0 && (
                      <>
                        <span>·</span>
                        <span className="text-[var(--warning-ink)]">
                          {activePack.skippedBlockedCount} unsafe file(s) blocked
                        </span>
                      </>
                    )}
                  </div>

                  {/* Link pack to Course or Self-Directed Topic */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    <label className="flex items-center gap-2">
                      <Link2 className="w-3.5 h-3.5 text-[var(--accent-600)] shrink-0" />
                      <select
                        value={activePack.linkedCourseId || ''}
                        onChange={(e) => handleLinkPack(activePack.id, e.target.value, activePack.linkedSelfDirectedId || '')}
                        className={`${inputClass} !py-1.5 text-xs`}
                      >
                        <option value="">Not linked to a course</option>
                        {courses.map((c) => (
                          <option key={c.id} value={c.id}>Course: {c.title}</option>
                        ))}
                      </select>
                    </label>
                    <label className="flex items-center gap-2">
                      <BookOpen className="w-3.5 h-3.5 text-[var(--accent-600)] shrink-0" />
                      <select
                        value={activePack.linkedSelfDirectedId || ''}
                        onChange={(e) => handleLinkPack(activePack.id, activePack.linkedCourseId || '', e.target.value)}
                        className={`${inputClass} !py-1.5 text-xs`}
                      >
                        <option value="">Not linked to self-directed topic</option>
                        {selfDirectedTopics.map((sd) => (
                          <option key={sd.id} value={sd.id}>Topic: {sd.title}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>

                {/* Folder Filter + File Search */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="flex items-center gap-2">
                    <FolderOpen className="w-4 h-4 text-[var(--accent-600)] shrink-0" />
                    <select
                      aria-label="Filter by folder"
                      value={selectedFolder}
                      onChange={(e) => setSelectedFolder(e.target.value)}
                      className={`${inputClass} !py-2 text-xs`}
                    >
                      <option value="ALL">All folders ({activePack.files.length} files)</option>
                      {activePack.folders.map((folder) => (
                        <option key={folder} value={folder}>{folder}</option>
                      ))}
                    </select>
                  </div>
                  <div className="relative">
                    <Search className={`w-4 h-4 absolute left-3 top-2.5 ${textSecondary}`} />
                    <input
                      type="text"
                      value={fileSearch}
                      onChange={(e) => setFileSearch(e.target.value)}
                      placeholder="Search extracted files..."
                      className={`${inputClass} !pl-9 !py-2 text-xs`}
                    />
                  </div>
                </div>

                {/* Split Browser: File List + Read-Only Preview */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
                  <div className={`md:col-span-5 max-h-72 overflow-y-auto rounded-xl border ${borderClass} divide-y ${borderClass}`}>
                    {visibleFiles.length === 0 ? (
                      <p className={`p-4 text-xs ${textSecondary}`}>No matching files in this folder.</p>
                    ) : (
                      visibleFiles.map((f) => {
                        const selected = activeFile?.id === f.id;
                        return (
                          <button
                            key={f.id}
                            type="button"
                            onClick={() => {
                              setSelectedFileId(f.id);
                              setExplainResult(null);
                            }}
                            className={`w-full text-left px-3 py-2.5 flex items-start gap-2.5 cursor-pointer transition-colors ${
                              selected ? 'bg-[var(--accent-50)]' : 'hover:bg-[var(--surface-subtle)]'
                            }`}
                          >
                            {fileIconForKind(f.kind)}
                            <span className="min-w-0 flex-1">
                              <span className={`block text-xs font-medium truncate ${selected ? 'text-[var(--accent-700)] font-semibold' : textPrimary}`}>
                                {f.name}
                              </span>
                              <span className={`block text-[11px] truncate ${textSecondary}`}>
                                {f.folder} · {f.kind} · {Math.max(1, Math.round(f.size / 1024))} KB
                              </span>
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>

                  <div className={`md:col-span-7 rounded-xl border ${borderClass} p-4 space-y-3 min-w-0`}>
                    {activeFile ? (
                      <>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className={`text-sm font-semibold truncate ${textPrimary}`}>{activeFile.path}</div>
                            <div className={`text-xs ${textSecondary}`}>
                              Read-only preview · never executed · {Math.max(1, Math.round(activeFile.size / 1024))} KB
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              onStartDailyTaskFromFile(activePack, activeFile);
                              onClose();
                            }}
                            className={`${btnSecondary} !px-3 !py-1.5 text-xs`}
                          >
                            Study Today →
                          </button>
                        </div>

                        <pre className={`p-3 rounded-lg border ${borderClass} ${subtleBgClass} font-mono text-xs overflow-x-auto max-h-56 whitespace-pre-wrap break-words ${textPrimary}`}>
                          <code>{activeFile.contentPreview}</code>
                        </pre>

                        {/* Explicit on-demand AI explanation for THIS single file excerpt only */}
                        <div className={`pt-3 border-t ${borderClass} space-y-2.5`}>
                          <div className="flex flex-col sm:flex-row gap-2">
                            <input
                              type="text"
                              value={explainQuestion}
                              onChange={(e) => setExplainQuestion(e.target.value)}
                              placeholder="Optional question about this file..."
                              className={`${inputClass} !py-2 text-xs flex-1`}
                            />
                            <button
                              type="button"
                              disabled={explainBusy}
                              onClick={handleExplainActiveFile}
                              className={`${btnPrimary} !px-3.5 !py-2 text-xs`}
                            >
                              {explainBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                              Explain Excerpt
                            </button>
                          </div>

                          {explainResult && explainResult.fileId === activeFile.id && (
                            <div className={`p-3 rounded-lg ${subtleBgClass} border-l-4 border-[var(--accent-600)] space-y-2 text-xs`}>
                              <p className={textPrimary}>{explainResult.summary}</p>
                              {explainResult.keyConcepts.length > 0 && (
                                <ul className={`space-y-1 ${textSecondary}`}>
                                  {explainResult.keyConcepts.map((kc, idx) => (
                                    <li key={idx} className="flex items-start gap-1.5">
                                      <CheckCircle2 className="w-3.5 h-3.5 text-[var(--success-ink)] shrink-0 mt-0.5" />
                                      <span>{kc}</span>
                                    </li>
                                  ))}
                                </ul>
                              )}
                              {explainResult.practicePrompt && (
                                <p className={`font-medium ${textPrimary}`}>
                                  Try next: <span className={textSecondary}>{explainResult.practicePrompt}</span>
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      </>
                    ) : (
                      <p className={`text-xs ${textSecondary}`}>Select a file on the left to inspect its notes or starter code.</p>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
};
