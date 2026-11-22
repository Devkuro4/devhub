import React, { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Circle,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  FolderArchive,
  Heart,
  Loader2,
  Plus,
  Rocket,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { Badge, EmptyState, Modal, PageHeader, SectionTabs } from './ui';
import { getUrlError } from '../lib/url';
import { requestProjectReview, requestWeeklyProject } from '../lib/aiClient';
import { readSubmittedFiles } from '../lib/sandbox';
import { SDLC_STAGES } from '../data/seedData';
import type {
  CodeSubmission,
  OnboardingProfile,
  QuizAttempt,
  RoadmapItem,
  RoadmapTopicProgress,
  ShowcaseProject,
  SubmittedFile,
  WeeklyProjectItem,
} from '../types';

export type ProjectsSubTab = 'weekly-project' | 'projects' | 'showcase' | 'devtools';

export const ProjectsSection = ({
  subTab,
  setSubTab,
  profile,
  user,
  selectedRoadmap,
  roadmapProgress,
  codeSubmissions,
  quizAttempts,
  weeklyProjects,
  setWeeklyProjects,
  projects,
  setProjects,
  showcaseProjects,
  setShowcaseProjects,
  gitLevels,
  setGitLevels,
  aiLiteracy,
  setAiLiteracy,
  onAskMentor,
  onNotify,
  styles,
}: {
  subTab: ProjectsSubTab;
  setSubTab: (t: ProjectsSubTab) => void;
  profile: OnboardingProfile;
  user: { id?: string; name: string; email: string };
  selectedRoadmap: RoadmapItem;
  roadmapProgress: Record<string, RoadmapTopicProgress>;
  codeSubmissions: CodeSubmission[];
  quizAttempts: QuizAttempt[];
  weeklyProjects: WeeklyProjectItem[];
  setWeeklyProjects: (p: WeeklyProjectItem[]) => void;
  projects: any[];
  setProjects: (p: any[]) => void;
  showcaseProjects: ShowcaseProject[];
  setShowcaseProjects: (s: ShowcaseProject[]) => void;
  gitLevels: any[];
  setGitLevels: (g: any[]) => void;
  aiLiteracy: any[];
  setAiLiteracy: (a: any[]) => void;
  onAskMentor: (prompt: string) => void;
  onNotify: (msg: string, tone?: 'success' | 'error') => void;
  styles: {
    cardClass: string;
    borderClass: string;
    subtleBgClass: string;
    textPrimary: string;
    textSecondary: string;
    inputClass: string;
    btnPrimary: string;
    btnSecondary: string;
    darkMode: boolean;
  };
}) => {
  const { cardClass, borderClass, subtleBgClass, textPrimary, textSecondary, inputClass, btnPrimary, btnSecondary } = styles;

  // Weekly Project Generator & Submission state
  const [selectedWpId, setSelectedWpId] = useState(weeklyProjects[0]?.id || '');
  const activeWp = weeklyProjects.find((p) => p.id === selectedWpId) || weeklyProjects[0] || null;
  const [tierDraft, setTierDraft] = useState('Guided Beginner Project');
  const [langDraft, setLangDraft] = useState(profile.languages[0] || 'JavaScript');
  const [genBusy, setGenBusy] = useState(false);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [showHints, setShowHints] = useState(false);

  const [wpRepo, setWpRepo] = useState('');
  const [wpDemo, setWpDemo] = useState('');
  const [wpShot, setWpShot] = useState('');
  const [wpSnippet, setWpSnippet] = useState('');
  const [wpExplain, setWpExplain] = useState('');
  const [wpFiles, setWpFiles] = useState<SubmittedFile[]>([]);
  const [wpUploadFeedback, setWpUploadFeedback] = useState<{ acceptedCount: number; warnings: string[] } | null>(null);
  const [wpReply, setWpReply] = useState('');

  // Group Projects state
  const [selectedGroupProjId, setSelectedGroupProjId] = useState(projects[0]?.id || '');
  const activeGroupProj = projects.find((p) => p.id === selectedGroupProjId) || projects[0] || null;
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskAssignee, setNewTaskAssignee] = useState(user.name || 'Member');
  const [showProposeModal, setShowProposeModal] = useState(false);
  const [newProjName, setNewProjName] = useState('');
  const [newProjProblem, setNewProjProblem] = useState('');
  const [newProjDesc, setNewProjDesc] = useState('');
  const [newProjTech, setNewProjTech] = useState('HTML, CSS, JavaScript');

  // Showcase state
  const [showAddShowcase, setShowAddShowcase] = useState(false);
  const [scTitle, setScTitle] = useState('');
  const [scSummary, setScSummary] = useState('');
  const [scTech, setScTech] = useState('HTML, CSS, JavaScript');
  const [scRepo, setScRepo] = useState('');
  const [scDemo, setScDemo] = useState('');

  const weakTopics = Array.from(
    new Set([
      ...(quizAttempts[0]?.weakTopics || []),
      ...selectedRoadmap.topics
        .filter((t) => ['Needs Revision', 'Struggling'].includes(roadmapProgress[t.id]?.status || '') || roadmapProgress[t.id]?.struggling)
        .map((t) => t.name),
    ])
  );

  const coveredTopics = selectedRoadmap.topics
    .filter((t) => ['Practised', 'Demonstrated', 'Completed', 'In Progress'].includes(roadmapProgress[t.id]?.status || ''))
    .map((t) => t.name);

  const handleGenerateWeeklyProject = async () => {
    setGenBusy(true);
    try {
      const res = await requestWeeklyProject(
        {
          field: profile.field || selectedRoadmap.field,
          language: langDraft || 'JavaScript',
          skillLevel: profile.skillLevel || 'Beginner',
          topicsCovered: coveredTopics.length ? coveredTopics : selectedRoadmap.topics.slice(0, 3).map((t) => t.name),
          weakTopics,
          recentSubmissionSummary: codeSubmissions.slice(0, 2).map((s) => `${s.topic}: ${s.exerciseTitle}`).join('; '),
          projectTier: tierDraft,
        },
        user.id
      );
      const item: WeeklyProjectItem = {
        id: `wp-${Date.now()}`,
        title: res.data.title,
        shortDescription: res.data.shortDescription,
        whatItShouldDo: res.data.whatItShouldDo,
        requirements: res.data.requirements || [],
        conceptsToUse: res.data.conceptsToUse || [],
        optionalHints: res.data.optionalHints || [],
        milestones: (res.data.milestones || []).map((m, i) => ({ id: `m-${Date.now()}-${i}`, title: m, done: false })),
        deadline: 'Sunday this week',
        submissionInstructions: res.data.submissionInstructions || 'Share your repo, files, or snippet and explain what you built.',
        projectLevel: res.data.projectLevel || tierDraft,
        language: langDraft,
        status: 'In Progress',
        createdAt: 'Today',
        submission: null,
        review: null,
      };
      setWeeklyProjects([item, ...weeklyProjects]);
      setSelectedWpId(item.id);
      setShowHints(false);
      onNotify(`Generated weekly project: ${item.title}`);
    } catch (err: any) {
      onNotify(err?.message || 'Could not generate a weekly project right now.', 'error');
    } finally {
      setGenBusy(false);
    }
  };

  const wpRepoError = getUrlError(wpRepo, 'https://github.com/your-name/project-repo');
  const wpDemoError = getUrlError(wpDemo, 'https://your-project.vercel.app');
  const wpShotError = getUrlError(wpShot, 'https://i.imgur.com/example.png');
  const scRepoError = getUrlError(scRepo, 'https://github.com/your-name/showcase-repo');
  const scDemoError = getUrlError(scDemo, 'https://your-project.vercel.app');

  const handleWpFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    const { files, warnings } = await readSubmittedFiles(e.target.files);
    if (files.length) {
      setWpFiles((prev) => [...prev, ...files]);
      if (!wpSnippet.trim() && files[0]?.content) setWpSnippet(files[0].content);
      onNotify(`Loaded ${files.length} project file(s).`);
    }
    setWpUploadFeedback({ acceptedCount: files.length, warnings });
    if (warnings.length && files.length === 0) onNotify(warnings[0]);
    e.target.value = '';
  };

  const handleSubmitWeeklyProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeWp) return;
    if (wpRepoError || wpDemoError || wpShotError) {
      onNotify(wpRepoError || wpDemoError || wpShotError);
      return;
    }
    if (!wpSnippet.trim() && wpFiles.length === 0 && !wpRepo.trim() && !wpExplain.trim()) {
      onNotify('Add your code, files, repository link, or a short explanation first.');
      return;
    }

    const codeBundle = wpFiles.length
      ? wpFiles.map((f) => `// FILE: ${f.name}\n${f.content}`).join('\n\n').slice(0, 6000)
      : wpSnippet.trim();

    const submissionObj = {
      repoUrl: wpRepo.trim(),
      demoUrl: wpDemo.trim(),
      screenshotUrl: wpShot.trim(),
      explanation: wpExplain.trim() || 'Submitted project work for feedback.',
      codeSnippet: codeBundle,
      files: wpFiles,
      submittedAt: 'Just now',
    };

    const updated = weeklyProjects.map((p) =>
      p.id === activeWp.id ? { ...p, status: 'Submitted' as const, submission: submissionObj } : p
    );
    setWeeklyProjects(updated);
    setReviewBusy(true);

    try {
      const res = await requestProjectReview(
        {
          projectTitle: activeWp.title,
          requirements: activeWp.requirements,
          conceptsToUse: activeWp.conceptsToUse,
          skillLevel: profile.skillLevel || 'Beginner',
          repoUrl: submissionObj.repoUrl,
          demoUrl: submissionObj.demoUrl,
          explanation: submissionObj.explanation,
          codeSnippet: codeBundle,
        },
        user.id
      );
      setWeeklyProjects(
        updated.map((p) =>
          p.id === activeWp.id
            ? {
                ...p,
                status: 'Reviewed' as const,
                review: { ...res.data, learnerResponse: '' },
              }
            : p
        )
      );
      onNotify('Project submitted and reviewed.');
    } catch (err: any) {
      onNotify(err?.message || 'Project saved! AI review could not run right now.');
    } finally {
      setReviewBusy(false);
    }
  };

  const toggleWpMilestone = (wpId: string, milestoneId: string) => {
    setWeeklyProjects(
      weeklyProjects.map((p) =>
        p.id === wpId
          ? { ...p, milestones: p.milestones.map((m) => (m.id === milestoneId ? { ...m, done: !m.done } : m)) }
          : p
      )
    );
  };

  const saveWpUnderstandingReply = (wpId: string) => {
    if (!wpReply.trim()) return;
    setWeeklyProjects(
      weeklyProjects.map((p) =>
        p.id === wpId && p.review ? { ...p, review: { ...p.review, learnerResponse: wpReply.trim() } } : p
      )
    );
    setWpReply('');
    onNotify('Saved your explanation.');
  };

  const handleAddGroupTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeGroupProj || !newTaskTitle.trim()) return;
    const task = {
      id: `pt-${Date.now()}`,
      title: newTaskTitle.trim(),
      assignee: newTaskAssignee.trim() || user.name,
      status: 'To Do',
    };
    setProjects(projects.map((p) => (p.id === activeGroupProj.id ? { ...p, tasks: [...(p.tasks || []), task] } : p)));
    setNewTaskTitle('');
    onNotify('Task added to board.');
  };

  const moveGroupTask = (projId: string, taskId: string, newStatus: string) => {
    setProjects(
      projects.map((p) =>
        p.id === projId
          ? { ...p, tasks: (p.tasks || []).map((t: any) => (t.id === taskId ? { ...t, status: newStatus } : t)) }
          : p
      )
    );
  };

  const deleteGroupTask = (projId: string, taskId: string) => {
    setProjects(
      projects.map((p) => (p.id === projId ? { ...p, tasks: (p.tasks || []).filter((t: any) => t.id !== taskId) } : p))
    );
  };

  const handleProposeGroupProj = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjName.trim()) return;
    const np = {
      id: `proj-${Date.now()}`,
      name: newProjName.trim(),
      status: 'Active',
      sdlcStage: '1. Ideation',
      deadline: 'Flexible',
      repoUrl: '',
      description: newProjDesc.trim() || 'Small beginner-friendly collaborative build.',
      problemStatement: newProjProblem.trim() || 'Practicing teamwork and Git together.',
      technologies: newProjTech.split(',').map((s) => s.trim()).filter(Boolean),
      members: [user.name || 'Member'],
      milestones: [{ id: `pm-${Date.now()}`, title: 'First working prototype', done: false }],
      tasks: [{ id: `pt-${Date.now()}`, title: 'Create starter README and task list', assignee: user.name || 'Member', status: 'To Do' }],
    };
    setProjects([np, ...projects]);
    setSelectedGroupProjId(np.id);
    setNewProjName('');
    setNewProjProblem('');
    setNewProjDesc('');
    setShowProposeModal(false);
    onNotify('Group project proposed!');
  };

  const handleAddShowcase = (e: React.FormEvent) => {
    e.preventDefault();
    if (!scTitle.trim() || !scSummary.trim() || scRepoError || scDemoError) return;
    const item: ShowcaseProject = {
      id: `sc-${Date.now()}`,
      title: scTitle.trim(),
      author: user.name || 'Member',
      field: profile.field || 'General',
      summary: scSummary.trim(),
      technologies: scTech.split(',').map((s) => s.trim()).filter(Boolean),
      repoUrl: scRepo.trim(),
      demoUrl: scDemo.trim(),
      likes: 1,
      createdAt: 'Just now',
    };
    setShowcaseProjects([item, ...showcaseProjects]);
    setScTitle('');
    setScSummary('');
    setScRepo('');
    setScDemo('');
    setShowAddShowcase(false);
    onNotify('Added your project to the Showcase!');
  };

  const projectTabs: { id: ProjectsSubTab; label: string; badge?: number }[] = [
    { id: 'weekly-project', label: 'My Projects', badge: weeklyProjects.length },
    { id: 'projects', label: 'Group Projects', badge: projects.length },
    { id: 'showcase', label: 'Project Showcase', badge: showcaseProjects.length },
    { id: 'devtools', label: 'Git & AI Skills' },
  ];

  const headerAction =
    subTab === 'projects' ? (
      <button type="button" onClick={() => setShowProposeModal(true)} className={btnPrimary}>
        <Plus className="w-3.5 h-3.5" /> Propose Group Project
      </button>
    ) : subTab === 'showcase' ? (
      <button type="button" onClick={() => setShowAddShowcase(true)} className={btnPrimary}>
        <Plus className="w-3.5 h-3.5" /> Share Finished Project
      </button>
    ) : undefined;

  return (
    <div data-tour="projects-section" className="page-stack">
      <PageHeader
        title="Projects"
        description="Turn what you learn into small real apps—practise solo weekly builds, collaborate in small groups, and celebrate finished work."
        action={headerAction}
      />

      <SectionTabs tabs={projectTabs} active={subTab} onChange={setSubTab} />

      {/* 1. PERSONALIZED WEEKLY PROJECT */}
      {subTab === 'weekly-project' && (
        <div className="space-y-6">
          <details open={!activeWp} className={`${cardClass} group`}>
            <summary className="list-none cursor-pointer px-5 py-4 flex items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
              <span>
                <span className={`block text-lg font-display ${textPrimary}`}>Start a new weekly project</span>
                <span className={`block text-xs ${textSecondary}`}>Matched to your level ({profile.skillLevel || 'Beginner'}) and recent lessons.</span>
              </span>
              <ChevronRight className="w-4 h-4 transition-transform group-open:rotate-90 text-[var(--accent-600)]" />
            </summary>
            <div className={`border-t ${borderClass} p-5 flex flex-wrap items-end gap-2.5`}>
            <div className="flex flex-wrap items-end gap-2.5">
              <div>
                <label className={`block text-xs font-medium mb-1 ${textSecondary}`}>Project Style</label>
                <select value={tierDraft} onChange={(e) => setTierDraft(e.target.value)} className={inputClass}>
                  <option>Guided Beginner Project</option>
                  <option>Independent Project</option>
                  <option>Portfolio-Worthy Project</option>
                </select>
              </div>
              <div>
                <label className={`block text-xs font-medium mb-1 ${textSecondary}`}>Language</label>
                <input value={langDraft} onChange={(e) => setLangDraft(e.target.value)} className={`${inputClass} w-36`} placeholder="JavaScript" />
              </div>
              <button type="button" onClick={handleGenerateWeeklyProject} disabled={genBusy} className={btnPrimary}>
                {genBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                {genBusy ? 'Creating…' : 'New Weekly Project'}
              </button>
            </div>
            </div>
          </details>

          {weeklyProjects.length > 1 && (
            <div className="flex flex-wrap gap-2">
              {weeklyProjects.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedWpId(p.id)}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-medium cursor-pointer ${
                    activeWp?.id === p.id
                      ? 'border-[var(--accent-600)] bg-[var(--accent-50)] text-[var(--accent-600)]'
                      : `${borderClass} ${textSecondary}`
                  }`}
                >
                  {p.title} · {p.status}
                </button>
              ))}
            </div>
          )}

          {!activeWp ? (
            <EmptyState
              title="No weekly project yet"
              description="Click 'New Weekly Project' above to generate a beginner-friendly build matched to what you are learning."
              actionLabel="Generate My Weekly Project"
              onAction={handleGenerateWeeklyProject}
            />
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-7 space-y-5">
                <div className={`${cardClass} p-6 space-y-5`}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="space-y-1">
                      <div className={`flex flex-wrap items-center gap-2 text-xs ${textSecondary}`}>
                        <span className="font-semibold text-[var(--accent-600)]">{activeWp.projectLevel}</span>
                        <span>· {activeWp.language}</span>
                        <span>· Due {activeWp.deadline}</span>
                      </div>
                      <h3 className={`font-display text-3xl ${textPrimary}`}>{activeWp.title}</h3>
                    </div>
                    <Badge variant={activeWp.status === 'Reviewed' ? 'success' : activeWp.status === 'Submitted' ? 'info' : 'warning'}>
                      {activeWp.status}
                    </Badge>
                  </div>

                  <p className={`text-sm leading-relaxed ${textSecondary}`}>{activeWp.shortDescription}</p>

                  <div className={`p-4 rounded-lg ${subtleBgClass} space-y-1`}>
                    <div className={`text-xs font-semibold ${textPrimary}`}>What it should do</div>
                    <p className={`text-xs leading-relaxed ${textSecondary}`}>{activeWp.whatItShouldDo}</p>
                  </div>

                  <div className="space-y-3">
                    <div className={`text-xs font-semibold ${textPrimary}`}>Requirements</div>
                    <ul className={`space-y-2 text-xs ${textSecondary}`}>
                      {activeWp.requirements.map((r, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="text-[var(--accent-600)] font-semibold tabular-nums">{i + 1}.</span>
                          <span>{r}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="space-y-2">
                    <div className={`text-xs font-semibold ${textPrimary}`}>Concepts practised</div>
                    <p className={`text-xs ${textSecondary}`}>{activeWp.conceptsToUse.join(' · ')}</p>
                  </div>

                  {activeWp.optionalHints?.length > 0 && (
                    <div className="pt-1">
                      <button
                        type="button"
                        onClick={() => setShowHints((v) => !v)}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--accent-600)] cursor-pointer"
                      >
                        {showHints ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                        {showHints ? 'Hide hints' : 'Need a hint? Reveal optional hints'}
                      </button>
                      {showHints && (
                        <ul className={`mt-2 p-3.5 rounded-lg ${subtleBgClass} space-y-2 text-xs ${textSecondary}`}>
                          {activeWp.optionalHints.map((h, i) => (
                            <li key={i}>• {h}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}

                  <div className={`pt-3 border-t ${borderClass}`}>
                    <button
                      type="button"
                      onClick={() => onAskMentor(`Help me plan the first milestone for my weekly project "${activeWp.title}": ${activeWp.whatItShouldDo}`)}
                      className={btnSecondary}
                    >
                      Ask AI Mentor for Guidance
                    </button>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-5 space-y-5">
                {activeWp.milestones?.length > 0 && (
                  <section className={`${cardClass} p-6 space-y-4`}>
                    <div className="flex items-baseline justify-between">
                      <h3 className={`text-lg ${textPrimary}`}>Build checklist</h3>
                      <span className={`text-xs tabular-nums ${textSecondary}`}>{activeWp.milestones.filter((m) => m.done).length}/{activeWp.milestones.length} done</span>
                    </div>
                    <div className="flex gap-1" aria-hidden="true">
                      {activeWp.milestones.map((m) => (
                        <span key={m.id} className={`h-2 flex-1 rounded-sm ${m.done ? 'bg-[var(--spark)]' : 'bg-[var(--border-hairline)]'}`} />
                      ))}
                    </div>
                    <div className={`divide-y ${borderClass}`}>
                      {activeWp.milestones.map((m) => (
                        <button key={m.id} type="button" onClick={() => toggleWpMilestone(activeWp.id, m.id)} className="w-full text-left flex items-center gap-2.5 py-2.5 cursor-pointer group">
                          {m.done ? <CheckCircle2 className="w-4 h-4 text-[var(--success-ink)] shrink-0" /> : <Circle className="w-4 h-4 text-[var(--ink-secondary)] shrink-0 group-hover:text-[var(--accent-600)]" />}
                          <span className={`text-sm ${m.done ? 'line-through opacity-60' : textPrimary}`}>{m.title}</span>
                        </button>
                      ))}
                    </div>
                  </section>
                )}

                <form onSubmit={handleSubmitWeeklyProject} className={`${cardClass} p-6 space-y-3.5`}>
                  <h3 className={`font-display text-base ${textPrimary}`}>Submit Your Project</h3>
                  <p className={`text-xs ${textSecondary}`}>{activeWp.submissionInstructions}</p>

                  <label className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border border-dashed ${borderClass} ${subtleBgClass} text-xs font-medium ${textSecondary} cursor-pointer hover:border-[var(--accent-500)]`}>
                    <Upload className="w-4 h-4 text-[var(--accent-600)]" />
                    <span>Upload code files or project .zip (max 2 MB)</span>
                    <input type="file" multiple accept=".js,.jsx,.ts,.tsx,.py,.html,.css,.java,.c,.cpp,.php,.rb,.go,.rs,.sql,.json,.md,.txt,.zip" onChange={handleWpFiles} className="hidden" />
                  </label>

                  {wpFiles.length > 0 && (
                    <div className={`text-xs ${textSecondary} flex flex-wrap gap-1.5`}>
                      {wpFiles.map((f, idx) => (
                        <span key={idx} className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded border ${borderClass} ${textPrimary}`}>
                          <FolderArchive className="w-3 h-3 text-[var(--accent-600)]" />
                          <span>{f.name} ({Math.max(1, Math.round(f.size / 1024))} KB)</span>
                          <button
                            type="button"
                            aria-label={`Remove ${f.name}`}
                            onClick={() => setWpFiles((prev) => prev.filter((_, i) => i !== idx))}
                            className="text-[var(--ink-secondary)] hover:text-[var(--danger-ink)] cursor-pointer"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}

                  {wpUploadFeedback && (wpUploadFeedback.acceptedCount > 0 || wpUploadFeedback.warnings.length > 0) && (
                    <div className={`p-3 rounded-lg border ${borderClass} ${subtleBgClass} text-xs space-y-2`}>
                      <div className="flex items-center justify-between gap-2">
                        <span className={`font-semibold ${textPrimary}`}>
                          Upload summary ({wpUploadFeedback.acceptedCount} loaded{wpUploadFeedback.warnings.length ? `, ${wpUploadFeedback.warnings.length} warning` : ''})
                        </span>
                        <button type="button" onClick={() => setWpUploadFeedback(null)} className={`text-xs ${textSecondary} hover:underline cursor-pointer`}>
                          Dismiss
                        </button>
                      </div>
                      {wpUploadFeedback.warnings.map((w, idx) => (
                        <p key={idx} className="text-[var(--warning-ink)] flex items-start gap-1.5">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                          <span>{w}</span>
                        </p>
                      ))}
                    </div>
                  )}

                  <textarea
                    rows={5}
                    value={wpSnippet}
                    onChange={(e) => setWpSnippet(e.target.value)}
                    placeholder="Paste key project code here (or upload files above)..."
                    className={`${inputClass} font-mono text-xs`}
                  />

                  <div>
                    <input value={wpRepo} onChange={(e) => setWpRepo(e.target.value)} placeholder="GitHub repository link (optional)" className={inputClass} />
                    {wpRepoError && <p className="text-xs text-[var(--danger-ink)] mt-1">{wpRepoError}</p>}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <input value={wpDemo} onChange={(e) => setWpDemo(e.target.value)} placeholder="Live demo link (optional)" className={inputClass} />
                      {wpDemoError && <p className="text-xs text-[var(--danger-ink)] mt-1">{wpDemoError}</p>}
                    </div>
                    <div>
                      <input value={wpShot} onChange={(e) => setWpShot(e.target.value)} placeholder="Screenshot URL (optional)" className={inputClass} />
                      {wpShotError && <p className="text-xs text-[var(--danger-ink)] mt-1">{wpShotError}</p>}
                    </div>
                  </div>
                  <textarea
                    rows={2}
                    value={wpExplain}
                    onChange={(e) => setWpExplain(e.target.value)}
                    placeholder="What does your project do, and what did you learn building it?"
                    className={inputClass}
                  />

                  <button type="submit" disabled={reviewBusy} className={`${btnPrimary} w-full`}>
                    {reviewBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Rocket className="w-3.5 h-3.5" />}
                    {reviewBusy ? 'Reviewing your project…' : 'Submit & Get AI Review'}
                  </button>
                </form>

                {activeWp.review && (
                  <div className={`${cardClass} p-6 space-y-4`}>
                    <div className="flex items-center justify-between">
                      <h3 className={`font-display text-base ${textPrimary}`}>AI Project Review</h3>
                      <Badge variant="success">Reviewed</Badge>
                    </div>
                    <p className={`text-xs leading-relaxed ${textSecondary}`}>{activeWp.review.summary}</p>

                    {activeWp.review.requirementsMet?.length > 0 && (
                      <div className="space-y-1">
                        <div className={`text-xs font-semibold ${textPrimary}`}>Requirements Checked</div>
                        <ul className={`space-y-1 text-xs ${textSecondary}`}>
                          {activeWp.review.requirementsMet.map((r, i) => (
                            <li key={i}>✓ {r}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {activeWp.review.improvements?.length > 0 && (
                      <div className="space-y-1">
                        <div className={`text-xs font-semibold ${textPrimary}`}>Suggested Improvements</div>
                        <ul className={`space-y-1 text-xs ${textSecondary}`}>
                          {activeWp.review.improvements.map((r, i) => (
                            <li key={i}>• {r}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {activeWp.review.understandingQuestion && (
                      <div className={`p-3.5 rounded-lg ${subtleBgClass} space-y-3`}>
                        <div className={`text-xs font-semibold ${textPrimary}`}>Understanding Check</div>
                        <p className={`text-xs ${textSecondary}`}>{activeWp.review.understandingQuestion}</p>
                        {activeWp.review.learnerResponse ? (
                          <p className={`text-xs font-medium ${textPrimary}`}>Your answer: {activeWp.review.learnerResponse}</p>
                        ) : (
                          <div className="flex gap-2">
                            <input
                              value={wpReply}
                              onChange={(e) => setWpReply(e.target.value)}
                              placeholder="Write your short answer..."
                              className={inputClass}
                            />
                            <button type="button" onClick={() => saveWpUnderstandingReply(activeWp.id)} className={btnSecondary}>
                              Save
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="text-xs font-medium text-[var(--accent-600)]">
                      Next step: {activeWp.review.nextStep}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 2. GROUP PROJECTS */}
      {subTab === 'projects' && (
        <div className="space-y-6">
          {projects.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {projects.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedGroupProjId(p.id)}
                  className={`px-3.5 py-2 rounded-lg border text-xs font-medium cursor-pointer ${
                    activeGroupProj?.id === p.id
                      ? 'border-[var(--accent-600)] bg-[var(--accent-50)] text-[var(--accent-600)]'
                      : `${borderClass} ${textSecondary}`
                  }`}
                >
                  {p.name}
                </button>
              ))}
            </div>
          )}

          {activeGroupProj ? (
            <div className="space-y-5">
              <div className={`${cardClass} p-6 space-y-4`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1 max-w-2xl">
                    <div className={`text-xs font-medium ${textSecondary}`}>
                      {activeGroupProj.status} · Due {activeGroupProj.deadline}
                    </div>
                    <h2 className={`font-display text-xl ${textPrimary}`}>{activeGroupProj.name}</h2>
                    <p className={`text-xs leading-relaxed ${textSecondary}`}>{activeGroupProj.description}</p>
                  </div>
                  {activeGroupProj.repoUrl && (
                    <a href={activeGroupProj.repoUrl} target="_blank" rel="noreferrer" className={btnSecondary}>
                      Repository <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>

                {profile.showAdvancedTools && (
                  <div className={`pt-3 border-t ${borderClass} space-y-3`}>
                    <div className={`text-xs font-semibold ${textPrimary}`}>Development Stage (SDLC)</div>
                    <div className="flex flex-wrap gap-1.5">
                      {SDLC_STAGES.map((stage) => (
                        <button
                          key={stage}
                          type="button"
                          onClick={() => setProjects(projects.map((p) => (p.id === activeGroupProj.id ? { ...p, sdlcStage: stage } : p)))}
                          className={`px-2.5 py-1 rounded text-xs font-medium border cursor-pointer ${
                            activeGroupProj.sdlcStage === stage
                              ? 'bg-[var(--accent-600)] text-white border-[var(--accent-600)]'
                              : `${borderClass} ${textSecondary}`
                          }`}
                        >
                          {stage}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <form onSubmit={handleAddGroupTask} className={`pt-3 border-t ${borderClass} flex flex-col sm:flex-row gap-2`}>
                  <input value={newTaskTitle} onChange={(e) => setNewTaskTitle(e.target.value)} placeholder="Add a small task to the board..." className={inputClass} />
                  <input value={newTaskAssignee} onChange={(e) => setNewTaskAssignee(e.target.value)} placeholder="Assignee" className={`${inputClass} sm:w-44`} />
                  <button type="submit" className={btnPrimary}>Add Task</button>
                </form>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                {['To Do', 'In Progress', 'In Review', 'Completed'].map((col) => {
                  const colTasks = (activeGroupProj.tasks || []).filter((t: any) => t.status === col);
                  return (
                    <div key={col} className={`rounded-xl bg-[var(--surface-subtle)] p-3 space-y-4 border-t-4 ${col === 'Completed' ? 'border-[var(--success-ink)]' : col === 'In Review' ? 'border-[var(--spark)]' : col === 'In Progress' ? 'border-[var(--accent-500)]' : 'border-[var(--border-strong)]'}`}>
                      <div className="flex items-center justify-between text-sm font-semibold px-1">
                        <span className={textPrimary}>{col}</span>
                        <span className={`tabular-nums ${textSecondary}`}>{colTasks.length}</span>
                      </div>
                      <div className="space-y-3">
                        {colTasks.length === 0 && <p className={`text-xs px-1 py-2 ${textSecondary}`}>Nothing here yet.</p>}
                        {colTasks.map((t: any) => (
                          <div key={t.id} className={`rounded-lg border ${borderClass} bg-[var(--surface-elevated)] p-3 space-y-3`}>
                            <div className={`text-sm font-medium leading-snug ${textPrimary}`}>{t.title}</div>
                            <div className="flex items-center justify-between gap-2 text-xs">
                              <span className={textSecondary}>{t.assignee}</span>
                              <div className="flex items-center gap-1">
                                <select
                                  value={t.status}
                                  onChange={(e) => moveGroupTask(activeGroupProj.id, t.id, e.target.value)}
                                  className={`px-1.5 py-0.5 rounded border ${borderClass} bg-transparent ${textPrimary} text-xs`}
                                >
                                  <option value="To Do">To Do</option>
                                  <option value="In Progress">In Progress</option>
                                  <option value="In Review">In Review</option>
                                  <option value="Completed">Completed</option>
                                </select>
                                <button
                                  type="button"
                                  aria-label="Delete task"
                                  onClick={() => deleteGroupTask(activeGroupProj.id, t.id)}
                                  className="p-1 text-[var(--ink-secondary)] hover:text-[var(--danger-ink)] cursor-pointer"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <EmptyState
              title="No group projects yet"
              description="Propose a small beginner project for a few members to build together."
              actionLabel="Propose Group Project"
              onAction={() => setShowProposeModal(true)}
            />
          )}

          <Modal open={showProposeModal} onClose={() => setShowProposeModal(false)} title="Propose a Small Collaborative Project">
            <form onSubmit={handleProposeGroupProj} className="space-y-3.5">
              <input value={newProjName} onChange={(e) => setNewProjName(e.target.value)} placeholder="Project name (e.g., Study Flashcards App)" className={inputClass} required />
              <input value={newProjProblem} onChange={(e) => setNewProjProblem(e.target.value)} placeholder="What problem does it solve for learners?" className={inputClass} />
              <textarea rows={2} value={newProjDesc} onChange={(e) => setNewProjDesc(e.target.value)} placeholder="Short beginner-friendly description..." className={inputClass} />
              <input value={newProjTech} onChange={(e) => setNewProjTech(e.target.value)} placeholder="Technologies (comma-separated)" className={inputClass} />
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowProposeModal(false)} className={btnSecondary}>Cancel</button>
                <button type="submit" className={btnPrimary}>Create Project</button>
              </div>
            </form>
          </Modal>
        </div>
      )}

      {/* 3. PROJECT SHOWCASE */}
      {subTab === 'showcase' && (
        <div className="space-y-5">
          {showcaseProjects.length === 0 ? (
            <EmptyState
              title="No showcased projects yet"
              description="Share your first finished project to inspire other beginners!"
              actionLabel="Share Finished Project"
              onAction={() => setShowAddShowcase(true)}
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {[...showcaseProjects].sort((x, y) => y.likes - x.likes).map((item, idx) => {
                const covers = ['var(--accent-100)', 'var(--surface-subtle)', 'var(--accent-50)', 'var(--surface-subtle)'];
                return (
                  <article key={item.id} className={`${cardClass} overflow-hidden flex flex-col ${idx === 0 ? 'md:col-span-2 xl:col-span-2' : ''}`}>
                    <div className="h-28 px-5 py-4 flex items-end justify-between gap-3 border-b border-[var(--border-hairline)]" style={{ background: covers[idx % covers.length] }}>
                      <span className="font-display text-4xl leading-none text-[var(--ink-primary)] opacity-80" aria-hidden="true">{item.title.slice(0, 2)}</span>
                      <span className="flex flex-wrap justify-end gap-1">
                        {item.technologies.slice(0, 4).map((t) => (
                          <span key={t} className="px-2 py-0.5 rounded-full bg-[var(--surface-elevated)] border border-[var(--border-hairline)] text-xs font-mono text-[var(--ink-primary)]">{t}</span>
                        ))}
                      </span>
                    </div>
                    <div className="p-5 flex flex-col gap-3 flex-1">
                      <div className="space-y-2 flex-1">
                        <p className={`text-xs ${textSecondary}`}>{item.author} · {item.field} · {item.createdAt}</p>
                        <h2 className={`text-xl ${textPrimary}`}>{item.title}</h2>
                        <p className={`text-sm leading-relaxed ${textSecondary}`}>{item.summary}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {item.repoUrl && (
                          <a href={item.repoUrl} target="_blank" rel="noreferrer" className={btnSecondary}>Code <ExternalLink className="w-3 h-3" /></a>
                        )}
                        {item.demoUrl && (
                          <a href={item.demoUrl} target="_blank" rel="noreferrer" className={btnSecondary}>Live demo <ExternalLink className="w-3 h-3" /></a>
                        )}
                        <button
                          type="button"
                          aria-label={`Like ${item.title}`}
                          onClick={() => setShowcaseProjects(showcaseProjects.map((p) => (p.id === item.id ? { ...p, likes: p.likes + 1 } : p)))}
                          className={`${btnSecondary} ml-auto`}
                        >
                          <Heart className="w-3.5 h-3.5 text-[var(--danger-ink)]" /> {item.likes}
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          <Modal open={showAddShowcase} onClose={() => setShowAddShowcase(false)} title="Share a Finished Project">
            <form onSubmit={handleAddShowcase} className="space-y-3.5">
              <input value={scTitle} onChange={(e) => setScTitle(e.target.value)} placeholder="Project title" className={inputClass} required />
              <textarea rows={3} value={scSummary} onChange={(e) => setScSummary(e.target.value)} placeholder="What does it do, and what did you learn?" className={inputClass} required />
              <input value={scTech} onChange={(e) => setScTech(e.target.value)} placeholder="Tech used (e.g. HTML, CSS, JS)" className={inputClass} />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <input value={scRepo} onChange={(e) => setScRepo(e.target.value)} placeholder="GitHub repo link (optional)" className={inputClass} />
                  {scRepoError && <p className="text-xs text-[var(--danger-ink)] mt-1">{scRepoError}</p>}
                </div>
                <div>
                  <input value={scDemo} onChange={(e) => setScDemo(e.target.value)} placeholder="Live demo URL (optional)" className={inputClass} />
                  {scDemoError && <p className="text-xs text-[var(--danger-ink)] mt-1">{scDemoError}</p>}
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowAddShowcase(false)} className={btnSecondary}>Cancel</button>
                <button type="submit" className={btnPrimary}>Publish to Showcase</button>
              </div>
            </form>
          </Modal>
        </div>
      )}

      {/* 4. GIT & AI SKILLS */}
      {subTab === 'devtools' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          <section aria-labelledby="git-track-title" className={`${cardClass} p-6 sm:p-8 space-y-5`}>
            <div className="space-y-2">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <h2 id="git-track-title" className={`text-xl ${textPrimary}`}>Git and GitHub track</h2>
                <span className={`text-sm tabular-nums ${textSecondary}`}>
                  {gitLevels.filter((g) => g.completed).length}/{gitLevels.length} completed
                </span>
              </div>
              <p className={`text-base leading-relaxed max-w-[52ch] ${textSecondary}`}>Tap a level when you have done it. Tap again to undo.</p>
            </div>
            <div className="flex gap-1" role="img" aria-label={`${gitLevels.filter((g) => g.completed).length} of ${gitLevels.length} Git levels completed`}>
              {gitLevels.map((g) => (
                <span key={g.level} className={`h-2 flex-1 rounded-sm ${g.completed ? 'bg-[var(--spark)]' : 'bg-[var(--border-hairline)]'}`} />
              ))}
            </div>
            <ul className="space-y-3">
              {gitLevels.map((g) => (
                <li key={g.level}>
                  <button
                    type="button"
                    aria-pressed={g.completed}
                    onClick={() =>
                      setGitLevels(gitLevels.map((item) => (item.level === g.level ? { ...item, completed: !item.completed } : item)))
                    }
                    className={`w-full min-h-[64px] text-left px-4 py-3.5 rounded-lg border border-l-4 flex items-start gap-3.5 cursor-pointer group transition-colors ${borderClass} ${
                      g.completed ? '!border-l-[var(--accent-600)] bg-[var(--accent-50)]' : 'border-l-transparent hover:bg-[var(--surface-subtle)]'
                    }`}
                  >
                    {g.completed ? (
                      <CheckCircle2 className="w-6 h-6 text-[var(--success-ink)] mt-0.5 shrink-0" />
                    ) : (
                      <Circle className="w-6 h-6 text-[var(--ink-secondary)] mt-0.5 shrink-0 group-hover:text-[var(--accent-600)]" />
                    )}
                    <span className="min-w-0 space-y-1">
                      <span className={`block text-base font-semibold leading-snug ${textPrimary}`}>Level {g.level}: {g.title}</span>
                      <span className={`block text-base leading-relaxed ${textSecondary}`}>{g.desc}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="ai-habits-title" className={`${cardClass} p-6 sm:p-8 space-y-5`}>
            <div className="space-y-2">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <h2 id="ai-habits-title" className={`text-xl ${textPrimary}`}>Healthy AI learning habits</h2>
                <span className={`text-sm tabular-nums ${textSecondary}`}>
                  {aiLiteracy.filter((a) => a.completed).length}/{aiLiteracy.length} practised
                </span>
              </div>
              <p className={`text-base leading-relaxed max-w-[52ch] ${textSecondary}`}>Tap a habit once you have tried it. Tap again to undo.</p>
            </div>
            <div className="flex gap-1" role="img" aria-label={`${aiLiteracy.filter((a) => a.completed).length} of ${aiLiteracy.length} AI habits practised`}>
              {aiLiteracy.map((a) => (
                <span key={a.id} className={`h-2 flex-1 rounded-sm ${a.completed ? 'bg-[var(--spark)]' : 'bg-[var(--border-hairline)]'}`} />
              ))}
            </div>
            <ul className="space-y-3">
              {aiLiteracy.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    aria-pressed={a.completed}
                    onClick={() =>
                      setAiLiteracy(aiLiteracy.map((item) => (item.id === a.id ? { ...item, completed: !item.completed } : item)))
                    }
                    className={`w-full min-h-[64px] text-left px-4 py-3.5 rounded-lg border border-l-4 flex items-start gap-3.5 cursor-pointer group transition-colors ${borderClass} ${
                      a.completed ? '!border-l-[var(--accent-600)] bg-[var(--accent-50)]' : 'border-l-transparent hover:bg-[var(--surface-subtle)]'
                    }`}
                  >
                    {a.completed ? (
                      <CheckCircle2 className="w-6 h-6 text-[var(--success-ink)] mt-0.5 shrink-0" />
                    ) : (
                      <Circle className="w-6 h-6 text-[var(--ink-secondary)] mt-0.5 shrink-0 group-hover:text-[var(--accent-600)]" />
                    )}
                    <span className="min-w-0 space-y-1">
                      <span className={`block text-base font-semibold leading-snug ${textPrimary}`}>{a.stage}</span>
                      <span className={`block text-base leading-relaxed ${textSecondary}`}>{a.desc}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
};
