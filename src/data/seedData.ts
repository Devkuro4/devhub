import type {
  CodeSubmission,
  CommunityEvent,
  CommunityPost,
  CourseItem,
  DailyTarget,
  OnboardingProfile,
  QuizAttempt,
  QuizItem,
  RoadmapItem,
  RoadmapTopicProgress,
  ShowcaseProject,
  WeeklyProjectItem,
} from '../types';

export const STORAGE_KEY = 'dev_growth_hub_state_v2';

export const INITIAL_PROFILE: OnboardingProfile = {
  fullName: 'Amara Okafor',
  username: 'amara-dev',
  bio: 'Learning frontend & full-stack basics step by step through small projects.',
  field: 'Frontend Development',
  skillLevel: 'Beginner',
  knownSkills: 'Basic HTML tags, styling text with CSS, simple JavaScript variables and functions.',
  goal: 'Build my own products',
  studyTime: '45 minutes per day',
  languages: ['JavaScript', 'HTML/CSS', 'TypeScript'],
  frameworks: ['React', 'Tailwind CSS'],
  interests: ['Responsive Layouts', 'Interactive UI', 'JavaScript Fundamentals'],
  githubUrl: 'https://github.com/amara-okafor-dev',
  portfolioUrl: 'https://amaraokafor.dev',
  linkedinUrl: '',
  streakDays: 5,
  showAdvancedTools: false,
  notifications: {
    announcements: true,
    deadlines: true,
    reviewFeedback: true,
    weeklyCheckIn: true,
  },
};

export const INITIAL_COURSES: CourseItem[] = [
  {
    id: 'course-1',
    title: 'Responsive Web Design & Modern JavaScript',
    platform: 'freeCodeCamp',
    url: 'https://www.freecodecamp.org/learn',
    instructor: 'Self-Paced',
    field: 'Frontend Development',
    skillLevel: 'Beginner',
    goals: 'Understand Flexbox, clean DOM events, and fetching live data safely.',
    targetDate: '2026-12-20',
    progress: 50,
    currentTopic: 'JavaScript Events & Fetch Basics',
    weeklyTarget: 'Build a small task list and submit it for review',
    lastStudied: 'Today',
    notes: 'Use `await res.json()` after `await fetch(...)` so data is ready before updating the page.',
    referenceLinks: ['https://developer.mozilla.org/en-US/docs/Learn'],
    modules: [
      { id: 'm-1', title: 'Module 1: Semantic HTML & Forms', completed: true },
      { id: 'm-2', title: 'Module 2: CSS Flexbox & Mobile Layout', completed: true },
      { id: 'm-3', title: 'Module 3: JavaScript Events & Fetch Basics', completed: false },
      { id: 'm-4', title: 'Module 4: React Components & State', completed: false },
    ],
  },
];

export const ROADMAPS_CATALOG: RoadmapItem[] = [
  {
    id: 'rm-frontend',
    slug: 'frontend',
    source: 'roadmap.sh',
    title: 'Frontend Developer',
    field: 'Frontend Development',
    officialUrl: 'https://roadmap.sh/frontend',
    summary: 'Step-by-step path for building clean, interactive websites and web apps.',
    whatYouWillLearn: [
      'How browsers display HTML and CSS pages',
      'Making responsive mobile-friendly layouts with Flexbox and Grid',
      'Adding interactivity with JavaScript, events, and API calls',
      'Collaborating with Git & GitHub and building React apps',
    ],
    stages: [
      {
        id: 'fe-s1',
        title: 'Stage 1: Web Foundations',
        description: 'Start here first—no prior experience needed.',
        topics: [
          { id: 'fe-1', name: 'Semantic HTML & Accessibility', summary: 'Headings, buttons, forms, and clear structure for all users.' },
          { id: 'fe-2', name: 'CSS Layouts (Flexbox & Grid)', summary: 'Spacing, alignment, and adapting pages for phone and desktop.' },
          { id: 'fe-3', name: 'JavaScript Basics (Variables, Functions, Arrays)', summary: 'Writing clear logic and working with data.' },
        ],
      },
      {
        id: 'fe-s2',
        title: 'Stage 2: Interactivity & Git',
        description: 'Connect your pages to real data and save your work safely.',
        topics: [
          { id: 'fe-4', name: 'DOM Manipulation & Events', summary: 'Responding to clicks, form input, and updating the screen.' },
          { id: 'fe-5', name: 'Async JavaScript & Fetch API', summary: 'Loading API data cleanly and handling errors.' },
          { id: 'fe-6', name: 'Git & GitHub Basics', summary: 'Commits, branches, and sharing code with peers.' },
        ],
      },
      {
        id: 'fe-s3',
        title: 'Stage 3: Components & Testing',
        description: 'Unlocked as your foundations click.',
        topics: [
          { id: 'fe-7', name: 'React Components & State', summary: 'Building reusable UI pieces cleanly.' },
          { id: 'fe-8', name: 'TypeScript & Basic Testing', summary: 'Catching bugs early and verifying key flows.' },
        ],
      },
    ],
    topics: [
      { id: 'fe-1', name: 'Semantic HTML & Accessibility', stageTitle: 'Stage 1: Web Foundations' },
      { id: 'fe-2', name: 'CSS Layouts (Flexbox & Grid)', stageTitle: 'Stage 1: Web Foundations' },
      { id: 'fe-3', name: 'JavaScript Basics (Variables, Functions, Arrays)', stageTitle: 'Stage 1: Web Foundations' },
      { id: 'fe-4', name: 'DOM Manipulation & Events', stageTitle: 'Stage 2: Interactivity & Git' },
      { id: 'fe-5', name: 'Async JavaScript & Fetch API', stageTitle: 'Stage 2: Interactivity & Git' },
      { id: 'fe-6', name: 'Git & GitHub Basics', stageTitle: 'Stage 2: Interactivity & Git' },
      { id: 'fe-7', name: 'React Components & State', stageTitle: 'Stage 3: Components & Testing' },
      { id: 'fe-8', name: 'TypeScript & Basic Testing', stageTitle: 'Stage 3: Components & Testing' },
    ],
  },
  {
    id: 'rm-backend',
    slug: 'backend',
    source: 'roadmap.sh',
    title: 'Backend Developer',
    field: 'Backend Development',
    officialUrl: 'https://roadmap.sh/backend',
    summary: 'Learn how servers, APIs, databases, and sign-in systems work behind the scenes.',
    whatYouWillLearn: [
      'Programming logic in Python or Node.js',
      'Designing REST APIs and returning clean JSON',
      'Saving and querying records in SQL databases',
      'Authentication, validation, and safe deployment',
    ],
    stages: [
      {
        id: 'be-s1',
        title: 'Stage 1: Server & HTTP Basics',
        description: 'How requests move between browsers and servers.',
        topics: [
          { id: 'be-1', name: 'Language Foundations (Node.js or Python)', summary: 'Files, functions, packages, and error handling.' },
          { id: 'be-2', name: 'HTTP, REST APIs & Status Codes', summary: 'GET, POST, PUT, DELETE, and clean JSON responses.' },
          { id: 'be-3', name: 'Git & Command Line Basics', summary: 'Running scripts and tracking changes safely.' },
        ],
      },
      {
        id: 'be-s2',
        title: 'Stage 2: Databases & Security',
        description: 'Store data safely and protect user accounts.',
        topics: [
          { id: 'be-4', name: 'Relational Databases & SQL', summary: 'Tables, queries, joins, and indexes.' },
          { id: 'be-5', name: 'Authentication & Sessions', summary: 'Password hashing, sessions, and route protection.' },
          { id: 'be-6', name: 'API Testing & Validation', summary: 'Checking inputs and verifying edge cases.' },
        ],
      },
    ],
    topics: [
      { id: 'be-1', name: 'Language Foundations (Node.js or Python)', stageTitle: 'Stage 1: Server & HTTP Basics' },
      { id: 'be-2', name: 'HTTP, REST APIs & Status Codes', stageTitle: 'Stage 1: Server & HTTP Basics' },
      { id: 'be-3', name: 'Git & Command Line Basics', stageTitle: 'Stage 1: Server & HTTP Basics' },
      { id: 'be-4', name: 'Relational Databases & SQL', stageTitle: 'Stage 2: Databases & Security' },
      { id: 'be-5', name: 'Authentication & Sessions', stageTitle: 'Stage 2: Databases & Security' },
      { id: 'be-6', name: 'API Testing & Validation', stageTitle: 'Stage 2: Databases & Security' },
    ],
  },
  {
    id: 'rm-fullstack',
    slug: 'full-stack',
    source: 'roadmap.sh',
    title: 'Full Stack Developer',
    field: 'Full-Stack Development',
    officialUrl: 'https://roadmap.sh/full-stack',
    summary: 'Combine user interfaces, backend APIs, and databases to ship complete web apps.',
    whatYouWillLearn: [
      'HTML, CSS, JavaScript, and React basics',
      'Writing server APIs and connecting PostgreSQL databases',
      'User accounts, permissions, and deploying live apps',
    ],
    stages: [
      {
        id: 'fs-s1',
        title: 'Stage 1: Frontend Core',
        description: 'Build clear pages that work well on every screen.',
        topics: [
          { id: 'fs-1', name: 'HTML, CSS & Responsive Layouts', summary: 'Accessible structure and Flexbox/Grid.' },
          { id: 'fs-2', name: 'JavaScript & React Basics', summary: 'Interactive components and state.' },
        ],
      },
      {
        id: 'fs-s2',
        title: 'Stage 2: Backend & Database',
        description: 'Connect forms and UI actions to real storage.',
        topics: [
          { id: 'fs-3', name: 'Node.js / Express API Routes', summary: 'Validating requests and returning structured data.' },
          { id: 'fs-4', name: 'PostgreSQL & Auth Rules', summary: 'Tables, foreign keys, and user privacy.' },
          { id: 'fs-5', name: 'Git Collaboration & Deployment', summary: 'Pull requests and hosting your finished app.' },
        ],
      },
    ],
    topics: [
      { id: 'fs-1', name: 'HTML, CSS & Responsive Layouts', stageTitle: 'Stage 1: Frontend Core' },
      { id: 'fs-2', name: 'JavaScript & React Basics', stageTitle: 'Stage 1: Frontend Core' },
      { id: 'fs-3', name: 'Node.js / Express API Routes', stageTitle: 'Stage 2: Backend & Database' },
      { id: 'fs-4', name: 'PostgreSQL & Auth Rules', stageTitle: 'Stage 2: Backend & Database' },
      { id: 'fs-5', name: 'Git Collaboration & Deployment', stageTitle: 'Stage 2: Backend & Database' },
    ],
  },
  {
    id: 'rm-ai',
    slug: 'ai-engineer',
    source: 'roadmap.sh',
    title: 'AI Engineer',
    field: 'AI Engineering',
    officialUrl: 'https://roadmap.sh/ai-engineer',
    summary: 'Learn how to build practical software powered by AI APIs, structured outputs, and safety checks.',
    whatYouWillLearn: [
      'Calling AI APIs safely from a backend server',
      'Prompting and structured JSON outputs',
      'Embeddings, search/RAG, and testing accuracy',
    ],
    stages: [
      {
        id: 'ai-s1',
        title: 'Stage 1: API & Prompt Foundations',
        description: 'Start with clean code and predictable outputs.',
        topics: [
          { id: 'ai-1', name: 'Python / TypeScript & Async HTTP', summary: 'Handling requests, timeouts, and environment variables.' },
          { id: 'ai-2', name: 'Prompt Design & JSON Schemas', summary: 'Getting reliable structured data back from models.' },
        ],
      },
      {
        id: 'ai-s2',
        title: 'Stage 2: Grounding & Safety',
        description: 'Connect real data and keep secrets safe.',
        topics: [
          { id: 'ai-3', name: 'Embeddings & Document Search (RAG)', summary: 'Answering from real verified knowledge.' },
          { id: 'ai-4', name: 'API Key Security & Output Evals', summary: 'Server-side secrets, rate limits, and quality checks.' },
        ],
      },
    ],
    topics: [
      { id: 'ai-1', name: 'Python / TypeScript & Async HTTP', stageTitle: 'Stage 1: API & Prompt Foundations' },
      { id: 'ai-2', name: 'Prompt Design & JSON Schemas', stageTitle: 'Stage 1: API & Prompt Foundations' },
      { id: 'ai-3', name: 'Embeddings & Document Search (RAG)', stageTitle: 'Stage 2: Grounding & Safety' },
      { id: 'ai-4', name: 'API Key Security & Output Evals', stageTitle: 'Stage 2: Grounding & Safety' },
    ],
  },
];

export const INITIAL_ROADMAP_PROGRESS: Record<string, RoadmapTopicProgress> = {
  'fe-1': { status: 'Demonstrated', notes: 'Practiced semantic headings, buttons, and form labels.', struggling: false },
  'fe-2': { status: 'Practised', notes: 'Built a responsive bio card using Flexbox.', struggling: false },
  'fe-3': { status: 'In Progress', notes: 'Practicing array methods like map() and filter().', struggling: false },
  'fe-4': { status: 'Not Started', notes: '', struggling: false },
  'fe-5': { status: 'Needs Revision', notes: 'Want more practice with async/await and error handling.', struggling: true },
  'fe-6': { status: 'Not Started', notes: '', struggling: false },
  'fe-7': { status: 'Not Started', notes: '', struggling: false },
  'fe-8': { status: 'Not Started', notes: '', struggling: false },
};

export const INITIAL_DAILY_TARGET: DailyTarget = {
  id: 'dt-1',
  dayLabel: 'Today',
  courseId: 'course-1',
  courseTitle: 'Responsive Web Design & Modern JavaScript',
  topic: 'JavaScript Array Filtering & Functions',
  objective: 'Write a small, readable function that filters a list of items based on a condition without mutating the original array.',
  recommendedLesson: 'Module 3: JavaScript Events & Fetch Basics',
  whatYouWillUnderstand: 'How `.filter()` returns a new array and how clear variable names make your logic easy to follow.',
  estimatedMinutes: 30,
  exerciseTitle: 'Filter Completed Study Tasks',
  exerciseInstructions: 'Given an array of task objects (`{ title, done }`), write a function `getPendingTasks(tasks)` that returns only the titles of tasks where `done` is `false`. Test it with at least 3 sample tasks and log the result.',
  exerciseRequirements: [
    'Do not modify the original `tasks` array',
    'Return an array of strings (just the task titles)',
    'Handle an empty array cleanly without errors',
  ],
  expectedConcepts: ['Functions', 'Array.filter()', 'Array.map()', 'console.log testing'],
  starterHint: 'First use `.filter(task => !task.done)` to keep unfinished tasks, then `.map(task => task.title)` to extract just their titles.',
  isTheoryOnly: false,
  status: 'In Progress',
};

export const INITIAL_SUBMISSIONS: CodeSubmission[] = [
  {
    id: 'sub-1',
    version: 1,
    createdAt: 'Yesterday',
    courseId: 'course-1',
    courseTitle: 'Responsive Web Design & Modern JavaScript',
    topic: 'CSS Flexbox & Mobile Layout',
    dayLabel: 'Day 4',
    language: 'HTML/CSS',
    exerciseTitle: 'Responsive Profile Card',
    submissionKind: 'code',
    code: `.card {\n  display: flex;\n  flex-direction: column;\n  gap: 12px;\n  max-width: 360px;\n}`,
    files: [{ name: 'styles.css', size: 84, content: `.card {\n  display: flex;\n  flex-direction: column;\n  gap: 12px;\n  max-width: 360px;\n}` }],
    repoUrl: '',
    explanation: 'Used flex-direction: column with gap so the card stacks cleanly on narrow phones.',
    sandboxExecuted: false,
    sandboxOutput: 'Static code review for CSS.',
    review: {
      whatYouDidWell: 'Clean use of `flex-direction: column` and `gap` instead of brittle margins.',
      whatNeedsImprovement: 'Consider adding `padding` inside `.card` and `width: 100%` so it scales gracefully on small screens.',
      understandingChecks: ['Why is `max-width: 360px` better than a fixed `width: 360px` on a 320px phone screen?'],
      suggestions: ['Try adding `padding: 20px` and a subtle border to give the content breathing room.'],
      nextStep: 'Practise verified — move on to JavaScript Events & Array Filtering.',
      recommendedStatus: 'Demonstrated',
      analysisTypeLabel: 'Static Code Analysis (Not Executed)',
    },
  },
];

export const INITIAL_WEEKLY_PROJECT: WeeklyProjectItem = {
  id: 'wp-1',
  title: 'Personal Study Task Tracker',
  shortDescription: 'Build a small, working task list where you can add tasks, mark them done, and filter what is left.',
  whatItShouldDo: 'Let someone type a study task, add it to a list, check it off as completed, and see how many tasks remain.',
  requirements: [
    'An input box and an Add button that creates a new task',
    'Clicking a task toggles whether it is completed',
    'Show a clear count of remaining tasks',
    'Include an empty state message when no tasks exist yet',
  ],
  conceptsToUse: ['Functions', 'Arrays & filter()', 'DOM events or React state', 'Clean layout'],
  optionalHints: [
    'Keep your tasks in a single array of objects: `{ id, title, done }`.',
    'Compute the remaining count with `tasks.filter(t => !t.done).length` during display instead of storing a separate counter.',
  ],
  milestones: [
    { id: 'wpm-1', title: 'Display a starter list of 2 sample tasks', done: true },
    { id: 'wpm-2', title: 'Add new tasks from the input box', done: false },
    { id: 'wpm-3', title: 'Toggle completed status & show remaining count', done: false },
  ],
  deadline: 'Sunday this week',
  submissionInstructions: 'Paste your code, upload your HTML/JS/CSS or ZIP files, or share a GitHub link with a short explanation of what you built.',
  projectLevel: 'Guided Beginner Project',
  language: 'JavaScript',
  status: 'In Progress',
  createdAt: 'This Week',
  submission: null,
  review: null,
};

export const INITIAL_QUIZZES: QuizItem[] = [
  {
    id: 'quiz-0',
    title: 'Everyday Web Basics: HTML, CSS & JavaScript',
    courseId: 'course-1',
    topic: 'Web Fundamentals',
    field: 'Frontend Development',
    difficulty: 'Beginner',
    scope: 'Topic Quiz',
    mandatory: false,
    deadline: 'Self-Paced',
    durationMinutes: 6,
    questions: [
      {
        id: 'q-001',
        type: 'mcq',
        topic: 'Semantic HTML',
        prompt: 'Which HTML element should you use for a clickable action that opens a menu or submits a form?',
        code: '',
        options: ['<button>', '<div> with an onClick', '<span> with bold text', '<p>'],
        answer: '<button>',
        explanation: 'Using a real <button> gives keyboard navigation and screen-reader support automatically.',
      },
      {
        id: 'q-002',
        type: 'true_false',
        topic: 'JavaScript Variables',
        prompt: 'True or False: `const` means you cannot reassign the variable to a brand-new value, though items inside an array or object can still be updated.',
        code: '',
        options: ['True', 'False'],
        answer: 'True',
        explanation: '`const` locks the variable binding itself, which prevents accidental reassignment bugs.',
      },
      {
        id: 'q-003',
        type: 'code_output',
        topic: 'Array Filtering',
        prompt: 'What does `console.log(result)` print?',
        code: `const nums = [1, 2, 3, 4];\nconst result = nums.filter(n => n > 2);\nconsole.log(result.length);`,
        options: ['1', '2', '3', '4'],
        answer: '2',
        explanation: 'Only 3 and 4 are greater than 2, so the filtered array has 2 items.',
      },
    ],
  },
  {
    id: 'quiz-1',
    title: 'JavaScript Async & React State Basics',
    courseId: 'course-1',
    topic: 'Async JavaScript & Fetch API',
    field: 'Frontend Development',
    difficulty: 'Intermediate',
    scope: 'Module Quiz',
    mandatory: false,
    deadline: 'Self-Paced',
    durationMinutes: 8,
    questions: [
      {
        id: 'q-101',
        type: 'find_error',
        topic: 'Fetch & Promises',
        prompt: 'What is the bug in this code?',
        code: `async function loadUsers() {\n  const res = await fetch('/api/users');\n  const data = res.json();\n  return data;\n}`,
        options: [
          '`res.json()` returns a Promise and needs `await` (`await res.json()`)',
          '`fetch` cannot be used inside an `async` function',
          '`const` cannot hold the result of `fetch`',
          'Missing semicolon after `fetch`',
        ],
        answer: '`res.json()` returns a Promise and needs `await` (`await res.json()`)',
        explanation: 'Without `await`, `data` is a pending Promise instead of the parsed JSON array or object.',
      },
      {
        id: 'q-102',
        type: 'short_answer',
        topic: 'Derived State',
        prompt: 'If you already store `tasks` in state, why is it usually better to calculate `remainingTasks` during render instead of storing it in a second state variable?',
        code: '',
        options: [],
        answer: 'Because calculating it during render avoids two states getting out of sync.',
        explanation: 'Computing values directly from existing state keeps a single source of truth and prevents stale counts.',
      },
    ],
  },
];

export const INITIAL_QUIZ_ATTEMPTS: QuizAttempt[] = [
  {
    id: 'att-1',
    quizId: 'quiz-0',
    quizTitle: 'Everyday Web Basics: HTML, CSS & JavaScript',
    date: 'Nov 12, 2026',
    score: 2,
    total: 3,
    percentage: 67,
    weakTopics: ['Array Filtering'],
    strongTopics: ['Semantic HTML', 'JavaScript Variables'],
    missedQuestionIds: ['q-003'],
  },
];

export const INITIAL_WEEKLY_ACTIVITIES = [
  { id: 'wa-mon', day: 'MONDAY', theme: 'SET A SMALL GOAL', title: 'Pick one topic or lesson to focus on this week', deadline: 'Mon', completed: true, description: 'Keep it realistic—even 20–30 minutes a day adds up fast.' },
  { id: 'wa-wed', day: 'WEDNESDAY', theme: 'LEARN TOGETHER', title: 'Share a question, mistake, or study session takeaway', deadline: 'Wed', completed: true, description: 'No question is too basic. Posting what confused you helps other beginners too.' },
  { id: 'wa-fri', day: 'FRIDAY', theme: 'PRACTICE & SHARE', title: 'Try the weekly challenge or submit your weekly project', deadline: 'Fri', completed: false, description: 'Share a tiny repo, snippet, or note—unfinished work is completely welcome.' },
  { id: 'wa-sun', day: 'SUNDAY', theme: 'WEEKLY CHECK-IN', title: 'Quick 3-minute weekly reflection', deadline: 'Sun', completed: false, description: 'Note one thing you learned, anything still unclear, and one small goal for next week.' },
];

export const INITIAL_CHALLENGES = [
  {
    id: 'ch-0',
    title: 'Personal Bio & Links Card (HTML & CSS)',
    category: 'Frontend',
    difficulty: 'Beginner',
    deadline: 'Self-Paced',
    technologies: ['HTML', 'CSS'],
    description: 'Build a clean profile card with your name, a short intro, and 3 links using semantic HTML and Flexbox.',
    objectives: ['Use semantic HTML tags like <main> and <a>', 'Center the card cleanly with Flexbox', 'Test how it looks on a narrow phone screen'],
    status: 'Not Started',
    submission: null,
  },
  {
    id: 'ch-1',
    title: 'Filter & Search a List in JavaScript',
    category: 'Frontend',
    difficulty: 'Beginner',
    deadline: '2026-11-22',
    technologies: ['JavaScript', 'HTML'],
    description: 'Write a clean search input that filters a list of study topics as the user types.',
    objectives: ['Use `.filter()` safely without mutating the original list', 'Handle case-insensitive matching with `.toLowerCase()`', 'Show a friendly message when no topics match'],
    status: 'In Progress',
    submission: null,
  },
  {
    id: 'ch-2',
    title: 'Git First Branch & Pull Request Practice',
    category: 'Git and GitHub',
    difficulty: 'Beginner',
    deadline: 'Self-Paced',
    technologies: ['Git', 'GitHub'],
    description: 'Create a new branch, make two small commits, push to GitHub, and write a clear pull request summary.',
    objectives: ['Create a feature branch instead of committing straight to main', 'Write clear commit messages', 'Explain what changed in your PR description'],
    status: 'Completed',
    submission: {
      repoUrl: 'https://github.com/amara-okafor-dev/git-practice/pull/1',
      explanation: 'Created a feature branch, updated README, and merged cleanly.',
      difficulties: '',
      usedAi: 'No — Written 100% independently',
      aiVerification: 'Checked git log and diff locally.',
      feedback: 'Clear branch name and helpful PR summary!',
    },
  },
];

export const INITIAL_PROJECTS = [
  {
    id: 'proj-1',
    name: 'Community Study Bookmarks — Shared Link Board',
    status: 'Active',
    sdlcStage: '4. Requirements',
    deadline: '2026-12-15',
    repoUrl: 'https://github.com/dev-growth-hub/study-bookmarks',
    description: 'A beginner-friendly shared app where members save helpful tutorials grouped by topic.',
    problemStatement: 'Beginners lose helpful links shared in chat and want one simple place to browse them.',
    technologies: ['HTML', 'CSS', 'JavaScript', 'React'],
    members: ['Amara Okafor', 'Tunde Bakare', 'Chidinma Eze', 'David Mensah'],
    milestones: [
      { id: 'pm-1', title: 'Simple Card Layout for Bookmarks', done: true },
      { id: 'pm-2', title: 'Filter Bookmarks by Topic', done: false },
      { id: 'pm-3', title: 'Add Form for Submitting New Links', done: false },
    ],
    tasks: [
      { id: 'pt-1', title: 'Create responsive card layout for bookmark items', assignee: 'Amara Okafor', status: 'Completed' },
      { id: 'pt-2', title: 'Add topic filter buttons (HTML, CSS, JS)', assignee: 'Chidinma Eze', status: 'In Progress' },
      { id: 'pt-3', title: 'Add empty-state message when a filter has no links', assignee: 'Tunde Bakare', status: 'To Do' },
    ],
  },
];

export const INITIAL_SHOWCASE: ShowcaseProject[] = [
  {
    id: 'sc-1',
    title: 'Beginner Pomodoro Study Timer',
    author: 'Amara Okafor',
    field: 'Frontend Development',
    summary: 'Built a 25-minute focus timer with start, pause, and reset buttons while practicing JavaScript intervals.',
    technologies: ['HTML', 'CSS', 'JavaScript'],
    repoUrl: 'https://github.com/amara-okafor-dev/focus-timer',
    demoUrl: 'https://amaraokafor.dev',
    likes: 8,
    createdAt: '2 days ago',
  },
  {
    id: 'sc-2',
    title: 'CLI Expense Note Script',
    author: 'Tunde Bakare',
    field: 'Backend Development',
    summary: 'A small Python script that saves daily expenses into a JSON file and prints a weekly total.',
    technologies: ['Python', 'JSON'],
    repoUrl: 'https://github.com/tunde-dev/expense-cli',
    demoUrl: '',
    likes: 6,
    createdAt: '4 days ago',
  },
];

export const SDLC_STAGES = [
  '1. Ideation',
  '2. Research',
  '3. Planning',
  '4. Requirements',
  '5. UI/UX Design',
  '6. Architecture',
  '7. Development',
  '8. Testing',
  '9. Deployment',
  '10. Retrospective',
];

export const INITIAL_PRESENTATIONS: CommunityEvent[] = [
  {
    id: 'pres-1',
    title: 'CSS Flexbox Together — Live Beginner Walkthrough',
    presenter: 'Amara Okafor',
    topic: 'HTML & CSS',
    type: 'Study Session',
    dateTime: 'Wednesday, Nov 18 · 17:00',
    description: 'Relaxed screen-share session practicing align-items, justify-content, and wrapping cards for mobile.',
    resourceUrl: 'https://flexboxfroggy.com',
    attendees: ['Amara Okafor', 'Chidinma Eze', 'David Mensah'],
    reminders: ['Amara Okafor'],
  },
  {
    id: 'pres-2',
    title: 'Open Debugging Hour — Bring Any Bug or Error',
    presenter: 'David Mensah',
    topic: 'Debugging & Basics',
    type: 'Debugging Session',
    dateTime: 'Friday, Nov 20 · 16:30',
    description: 'Share your screen or paste an error message and we will read it together step by step.',
    resourceUrl: '',
    attendees: ['Tunde Bakare', 'David Mensah'],
    reminders: [],
  },
];

export const INITIAL_POSTS: CommunityPost[] = [
  {
    id: 'post-1',
    author: 'David Mensah',
    role: 'Community Admin',
    category: 'Announcement',
    pinned: true,
    timestamp: '2 hours ago',
    title: 'Welcome to Dev Hub — No question is too basic here',
    content: 'We are a small group learning and building together. Share small wins, post bugs you ran into, ask beginner questions, or volunteer to walk through a topic you just figured out.',
    likes: 14,
    comments: [
      { id: 'c-1', author: 'Amara Okafor', text: 'Glad to be here! Happy to walk anyone through CSS Flexbox this week if it helps.', isHelpful: true },
    ],
  },
  {
    id: 'post-2',
    author: 'Chidinma Eze',
    role: 'Member',
    category: 'Mistake & Lesson',
    pinned: false,
    timestamp: 'Yesterday',
    title: 'Spent 40 minutes debugging fetch because I forgot `await` on `res.json()`',
    content: 'Sharing my mistake so it saves someone else time: `res.json()` returns a Promise, not the data itself! Logging the variable showed `Promise { <pending> }` and made it click.',
    codeSnippet: `const res = await fetch('/api/tasks');\nconst data = await res.json(); // <- forgot await here!`,
    likes: 11,
    comments: [
      { id: 'c-2', author: 'Tunde Bakare', text: 'I made that exact same mistake last month. Great tip to share!', isHelpful: true },
    ],
  },
  {
    id: 'post-3',
    author: 'Tunde Bakare',
    role: 'Learning Coordinator',
    category: 'Explain a Concept',
    pinned: false,
    timestamp: '2 days ago',
    title: 'Quick tip: Think of `.filter()` like a bouncer checking every item in a list',
    content: 'Your callback returns true (keep it) or false (skip it), and `.filter()` builds a brand-new array without touching the original one.',
    likes: 9,
    comments: [],
  },
];

export const INITIAL_RESOURCES = [
  { id: 'res-1', title: 'MDN: Learn Web Development (Beginner Track)', category: 'Frontend Development', type: 'Documentation', url: 'https://developer.mozilla.org/en-US/docs/Learn', addedBy: 'David Mensah', description: 'Friendly step-by-step articles covering HTML, CSS, and JavaScript from scratch.' },
  { id: 'res-2', title: 'Flexbox Froggy — Interactive CSS Layout Practice', category: 'Frontend Development', type: 'Interactive', url: 'https://flexboxfroggy.com', addedBy: 'Amara Okafor', description: 'Short game that makes justify-content and align-items click visually.' },
  { id: 'res-3', title: 'Pro Git Book — Branching & Commits Made Clear', category: 'Git and GitHub', type: 'Guide', url: 'https://git-scm.com/book/en/v2', addedBy: 'Tunde Bakare', description: 'Helpful diagrams for commits, branches, and pull requests.' },
  { id: 'res-4', title: 'Python Official Beginner Tutorial', category: 'Programming', type: 'Documentation', url: 'https://docs.python.org/3/tutorial/', addedBy: 'Chidinma Eze', description: 'Clear examples for variables, lists, functions, and dictionaries.' },
];

export const INITIAL_GIT_LEVELS = [
  { level: 1, title: 'Create Repositories & Atomic Commits', desc: 'Initialize repos, stage changes carefully, and write clear commit messages.', completed: true, evidence: 'First repo created' },
  { level: 2, title: 'Create Feature Branches & Push Changes', desc: 'Branch cleanly before editing code so `main` stays safe.', completed: true, evidence: 'Completed Git Practice' },
  { level: 3, title: 'Open Clear Pull Requests', desc: 'Explain what you changed and how you tested it.', completed: false, evidence: 'Next milestone' },
  { level: 4, title: 'Review Teammates’ Code Kindly', desc: 'Read a peer’s diff and share helpful, respectful feedback.', completed: false, evidence: 'Unlocks with group builds' },
  { level: 5, title: 'Resolve Merge Conflicts Calmly', desc: 'Compare both versions and keep what works cleanly.', completed: false, evidence: '' },
  { level: 6, title: 'Collaborate on Shared Repositories', desc: 'Keep branches synced and ship releases together.', completed: false, evidence: '' },
];

export const INITIAL_AI_LITERACY = [
  { id: 'ail-1', stage: 'Stage 1: Ask for Simple Explanations & Steps', desc: 'Use AI to break down ideas instead of copying code you cannot explain.', completed: true },
  { id: 'ail-2', stage: 'Stage 2: Share Error Messages & What You Tried', desc: 'Give context so you learn how to isolate root causes.', completed: true },
  { id: 'ail-3', stage: 'Stage 3: Read Every Line Before Using It', desc: 'Make sure you understand what every function and variable does.', completed: false },
  { id: 'ail-4', stage: 'Stage 4: Double-Check Against Official Docs', desc: 'Verify library names and syntax so outdated snippets do not trip you up.', completed: false },
  { id: 'ail-5', stage: 'Stage 5: Never Paste Secrets or API Keys', desc: 'Keep credentials and private user data out of prompts.', completed: false },
  { id: 'ail-6', stage: 'Stage 6: Solve First, Review with AI Second', desc: 'Write your own attempt first so your problem-solving muscles grow.', completed: false },
];

export const INITIAL_HELP_REQUESTS = [
  {
    id: 'help-1',
    author: 'Chidinma Eze',
    field: 'Frontend Development',
    target: 'Community',
    status: 'Being Helped',
    createdAt: '2 hours ago',
    goal: 'Center a card both vertically and horizontally on the screen.',
    attempted: 'Added `text-align: center`, which only centered the text inside the box.',
    errorOrCode: `.container { text-align: center; }`,
    helpNeeded: 'What CSS property centers the whole box itself?',
    responses: [
      {
        id: 'hr-1',
        responder: 'Amara Okafor',
        text: 'Try setting `display: flex; justify-content: center; align-items: center; min-height: 100vh;` on `.container`!',
      },
    ],
  },
];

export const TEAM_ROSTER = [
  { id: 'tm-1', name: 'Amara Okafor', role: 'Member', field: 'Frontend Development', level: 'Beginner', coursePct: 50, quizAvg: 67, gitLevel: 2, status: 'On Track', partner: 'Tunde Bakare', mentor: 'David Mensah', bio: 'Building HTML/CSS/JS confidence and sharing beginner tips.' },
  { id: 'tm-2', name: 'Tunde Bakare', role: 'Learning Coordinator', field: 'Backend Development', level: 'Intermediate', coursePct: 74, quizAvg: 88, gitLevel: 4, status: 'Helping Peers', partner: 'Amara Okafor', mentor: 'David Mensah', bio: 'Practicing Python & SQL and happy to help with backend questions.' },
  { id: 'tm-3', name: 'Chidinma Eze', role: 'Member', field: 'Full-Stack Development', level: 'Complete Beginner', coursePct: 35, quizAvg: 70, gitLevel: 2, status: 'On Track', partner: 'Kwame Boateng', mentor: 'David Mensah', bio: 'Learning how frontend pages talk to simple backend APIs.' },
  { id: 'tm-4', name: 'Kwame Boateng', role: 'Field Lead', field: 'AI Engineering', level: 'Intermediate', coursePct: 68, quizAvg: 85, gitLevel: 3, status: 'On Track', partner: 'Chidinma Eze', mentor: 'David Mensah', bio: 'Exploring Python scripts and practical AI API prompts.' },
  { id: 'tm-5', name: 'David Mensah', role: 'Community Admin', field: 'Full-Stack Development', level: 'Community Admin', coursePct: 100, quizAvg: 95, gitLevel: 6, status: 'Admin', partner: 'Community Support', mentor: '—', bio: 'Helping keep Dev Hub welcoming, clear, and consistent.' },
];

export const ADMIN_SITE = (import.meta as any).env?.VITE_APP_MODE === 'admin';
export const MEMBER_SITE_URL: string | undefined = (import.meta as any).env?.VITE_MEMBER_SITE_URL;
export const ADMIN_CODE: string | undefined = (import.meta as any).env?.VITE_ADMIN_CODE;

export const PERSONAL_KEYS = [
  'profile',
  'courses',
  'selectedRoadmapId',
  'customRoadmaps',
  'roadmapProgress',
  'learningPlans',
  'dailyTarget',
  'codeSubmissions',
  'weeklyProjects',
  'quizAttempts',
  'gitLevels',
  'aiLiteracy',
  'aiHelpLog',
  'mentorChat',
  'dailyLogs',
  'weeklyReports',
  'savedPostIds',
  'diagnosticResult',
  'pairingState',
  'hackathon',
  'onboarded',
];

export const SHARED_KEYS = [
  'quizzes',
  'weeklyActivities',
  'challenges',
  'projects',
  'presentations',
  'posts',
  'resources',
  'helpRequests',
  'showcaseProjects',
  'teamRoster',
];

export function blankPersonal(name = '', hk: any = { checklist: [] }) {
  return {
    profile: {
      ...INITIAL_PROFILE,
      fullName: name,
      username: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
      bio: '',
      field: '',
      skillLevel: 'Complete beginner',
      knownSkills: '',
      goal: '',
      studyTime: '30 minutes per day',
      languages: [],
      frameworks: [],
      interests: [],
      githubUrl: '',
      portfolioUrl: '',
      linkedinUrl: '',
      streakDays: 0,
      showAdvancedTools: false,
    },
    courses: [],
    selectedRoadmapId: 'rm-frontend',
    customRoadmaps: [],
    roadmapProgress: {},
    learningPlans: [],
    dailyTarget: {
      ...INITIAL_DAILY_TARGET,
      id: `dt-${Date.now()}`,
      courseId: '',
      courseTitle: 'Your Learning Path',
      topic: 'Getting Started: Your First Small Exercise',
      objective: 'Write a small, clear program or webpage to practice what you studied today.',
      status: 'Not Started' as const,
    },
    codeSubmissions: [],
    weeklyProjects: [],
    quizAttempts: [],
    dailyLogs: [],
    weeklyReports: [],
    savedPostIds: [],
    gitLevels: INITIAL_GIT_LEVELS.map((g) => ({ ...g, completed: false, evidence: '' })),
    aiLiteracy: INITIAL_AI_LITERACY.map((a) => ({ ...a, completed: false })),
    aiHelpLog: [],
    mentorChat: [],
    diagnosticResult: { completed: false, field: '', recommendedLevel: '', strengths: [], weaknesses: [], planSummary: '' },
    pairingState: { partnerName: '', partnerField: '', assignedMentor: '', joinedGroups: [], pairExercise: '' },
    hackathon: { ...hk, teamName: '', idea: '', repoUrl: '', checklist: (hk.checklist || []).map((c: any) => ({ ...c, done: false })) },
    onboarded: false,
  };
}
