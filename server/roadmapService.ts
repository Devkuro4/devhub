export interface RoadmapStageTopic {
  id: string;
  name: string;
  summary: string;
}

export interface RoadmapStage {
  id: string;
  title: string;
  description: string;
  topics: RoadmapStageTopic[];
}

export interface RoadmapLookupResult {
  found: boolean;
  source: 'roadmap.sh' | 'none';
  liveSynced?: boolean;
  id: string;
  slug: string;
  title: string;
  field: string;
  officialUrl: string;
  summary: string;
  whatYouWillLearn: string[];
  stages: RoadmapStage[];
}

const ROADMAP_SLUGS: Record<string, string> = {
  'frontend development': 'frontend',
  frontend: 'frontend',
  'web development': 'frontend',
  'backend development': 'backend',
  backend: 'backend',
  'full-stack development': 'full-stack',
  'full stack development': 'full-stack',
  fullstack: 'full-stack',
  'full stack': 'full-stack',
  'mobile development': 'react-native',
  mobile: 'react-native',
  'react native': 'react-native',
  'ai engineering': 'ai-engineer',
  'ai engineer': 'ai-engineer',
  'artificial intelligence': 'ai-engineer',
  'ai & machine learning': 'ai-engineer',
  'machine learning': 'ai-data-scientist',
  'data science': 'data-analyst',
  'data analyst': 'data-analyst',
  cybersecurity: 'cyber-security',
  'cyber security': 'cyber-security',
  'cloud computing': 'aws',
  aws: 'aws',
  devops: 'devops',
  'devops & cloud': 'devops',
  'blockchain development': 'blockchain',
  blockchain: 'blockchain',
  'ui/ux design': 'ux-design',
  'ux design': 'ux-design',
  python: 'python',
  react: 'react',
  typescript: 'typescript',
  javascript: 'javascript',
  'node.js': 'nodejs',
  nodejs: 'nodejs',
  sql: 'sql',
  docker: 'docker',
  kubernetes: 'kubernetes',
  java: 'java',
  golang: 'golang',
  go: 'golang',
  rust: 'rust',
  'system design': 'system-design',
};

const VERIFIED_ROADMAPS: Record<string, Omit<RoadmapLookupResult, 'found' | 'source'>> = {
  frontend: {
    id: 'rm-frontend',
    slug: 'frontend',
    title: 'Frontend Developer',
    field: 'Frontend Development',
    officialUrl: 'https://roadmap.sh/frontend',
    summary: 'Step-by-step path for building websites and interactive web apps people use in their browser.',
    whatYouWillLearn: [
      'How websites work and how to structure pages with HTML',
      'Styling layouts with modern CSS, Flexbox, Grid, and mobile design',
      'Making pages interactive with JavaScript and working with APIs',
      'Using Git & GitHub, React components, TypeScript, and basic testing',
    ],
    stages: [
      {
        id: 'fe-s1',
        title: 'Stage 1: Web Foundations',
        description: 'Start here if you are brand new—learn how browsers turn HTML and CSS into clean pages.',
        topics: [
          { id: 'fe-1', name: 'How the Internet & Browsers Work', summary: 'URLs, HTTP requests, and what happens when a page loads.' },
          { id: 'fe-2', name: 'Semantic HTML & Accessibility', summary: 'Buttons, links, forms, headings, and writing pages everyone can navigate.' },
          { id: 'fe-3', name: 'CSS Basics, Flexbox & Responsive Grid', summary: 'Spacing, colors, aligning elements, and making layouts work on phones.' },
        ],
      },
      {
        id: 'fe-s2',
        title: 'Stage 2: JavaScript & Version Control',
        description: 'Add interactivity and save your work safely with Git.',
        topics: [
          { id: 'fe-4', name: 'JavaScript Fundamentals & DOM Manipulation', summary: 'Variables, functions, arrays, events, and updating page content.' },
          { id: 'fe-5', name: 'Async JavaScript, Promises & Fetch API', summary: 'Loading live data cleanly and handling errors gracefully.' },
          { id: 'fe-6', name: 'Git & GitHub Basics', summary: 'Saving snapshots (commits), branching, and opening pull requests.' },
        ],
      },
      {
        id: 'fe-s3',
        title: 'Stage 3: Modern Frontend Apps',
        description: 'Build larger interfaces with reusable components and safer types.',
        topics: [
          { id: 'fe-7', name: 'React Components, State & Hooks', summary: 'Splitting UIs into clean reusable pieces and managing state.' },
          { id: 'fe-8', name: 'TypeScript Basics', summary: 'Catching silly data bugs before your code even runs.' },
          { id: 'fe-9', name: 'Testing & Web Performance', summary: 'Verifying key flows work and keeping pages fast.' },
        ],
      },
    ],
  },
  backend: {
    id: 'rm-backend',
    slug: 'backend',
    title: 'Backend Developer',
    field: 'Backend Development',
    officialUrl: 'https://roadmap.sh/backend',
    summary: 'Learn how servers, databases, APIs, and authentication power applications behind the scenes.',
    whatYouWillLearn: [
      'Picking a server language such as Python, Node.js, or Java',
      'Designing REST APIs and handling requests safely',
      'Storing and querying data with SQL databases like PostgreSQL',
      'User sign-in, caching, basic security, and deploying servers',
    ],
    stages: [
      {
        id: 'be-s1',
        title: 'Stage 1: Programming & HTTP Basics',
        description: 'Understand how servers talk to browsers and handle data.',
        topics: [
          { id: 'be-1', name: 'Server Language Basics (Node.js or Python)', summary: 'Files, functions, error handling, and package managers.' },
          { id: 'be-2', name: 'HTTP, REST APIs & JSON', summary: 'GET, POST, PUT, DELETE, status codes, and clean API routes.' },
          { id: 'be-3', name: 'Git & Command Line Basics', summary: 'Working in the terminal and tracking code history.' },
        ],
      },
      {
        id: 'be-s2',
        title: 'Stage 2: Databases & Authentication',
        description: 'Persist information reliably and protect user accounts.',
        topics: [
          { id: 'be-4', name: 'Relational Databases & SQL', summary: 'Tables, joins, indexes, and writing clean queries.' },
          { id: 'be-5', name: 'Authentication & Sessions', summary: 'Password hashing, sessions, JWTs, and protecting private routes.' },
          { id: 'be-6', name: 'Input Validation & Error Handling', summary: 'Checking incoming data before trusting or saving it.' },
        ],
      },
      {
        id: 'be-s3',
        title: 'Stage 3: Reliability & Deployment',
        description: 'Keep apps tested, fast, and running in production.',
        topics: [
          { id: 'be-7', name: 'API Testing & Automated Checks', summary: 'Testing routes and database logic automatically.' },
          { id: 'be-8', name: 'Caching & Rate Limiting', summary: 'Speeding up repeated reads and preventing abuse.' },
          { id: 'be-9', name: 'Containers & Cloud Deployment', summary: 'Running your backend reliably online.' },
        ],
      },
    ],
  },
  'full-stack': {
    id: 'rm-fullstack',
    slug: 'full-stack',
    title: 'Full Stack Developer',
    field: 'Full-Stack Development',
    officialUrl: 'https://roadmap.sh/full-stack',
    summary: 'Combine user interfaces, backend APIs, and databases to build complete working products.',
    whatYouWillLearn: [
      'HTML, CSS, JavaScript, and React for the browser interface',
      'Node.js or Python backend routes and input validation',
      'PostgreSQL databases, authentication, and hosting apps online',
    ],
    stages: [
      {
        id: 'fs-s1',
        title: 'Stage 1: Frontend Core',
        description: 'Build clear, responsive pages first.',
        topics: [
          { id: 'fs-1', name: 'HTML, CSS & Responsive Design', summary: 'Page structure, layout, and mobile accessibility.' },
          { id: 'fs-2', name: 'JavaScript & DOM', summary: 'Interactive browser logic and working with JSON.' },
          { id: 'fs-3', name: 'React Basics & Tailwind CSS', summary: 'Reusable UI components and clean styling.' },
        ],
      },
      {
        id: 'fs-s2',
        title: 'Stage 2: Backend & Data',
        description: 'Connect your UI to real APIs and databases.',
        topics: [
          { id: 'fs-4', name: 'API Routes with Node.js / Express', summary: 'Handling requests, validation, and responses.' },
          { id: 'fs-5', name: 'PostgreSQL & Schema Design', summary: 'Modeling users, items, and relationships cleanly.' },
          { id: 'fs-6', name: 'Login & Permissions', summary: 'Keeping personal data private to each account.' },
        ],
      },
      {
        id: 'fs-s3',
        title: 'Stage 3: Shipping Together',
        description: 'Collaborate and deploy full apps.',
        topics: [
          { id: 'fs-7', name: 'Git Workflows & Code Reviews', summary: 'Working in branches and reviewing peer changes.' },
          { id: 'fs-8', name: 'End-to-End Testing & Deployment', summary: 'Hosting your frontend, API, and database cleanly.' },
        ],
      },
    ],
  },
  'ai-engineer': {
    id: 'rm-ai',
    slug: 'ai-engineer',
    title: 'AI Engineer',
    field: 'AI Engineering',
    officialUrl: 'https://roadmap.sh/ai-engineer',
    summary: 'Learn how to build real software features powered by language models, embeddings, and safety checks.',
    whatYouWillLearn: [
      'How LLM APIs, tokens, and system prompts work',
      'Structured JSON outputs and calling tools/functions safely',
      'Embeddings, search/RAG, and testing AI outputs for accuracy',
    ],
    stages: [
      {
        id: 'ai-s1',
        title: 'Stage 1: Foundations',
        description: 'Solidify coding and API fundamentals before calling AI models.',
        topics: [
          { id: 'ai-1', name: 'Python or TypeScript APIs', summary: 'Making async HTTP calls, handling errors, and using environment variables.' },
          { id: 'ai-2', name: 'LLM Concepts & Prompt Design', summary: 'Tokens, context windows, and clear structured instructions.' },
        ],
      },
      {
        id: 'ai-s2',
        title: 'Stage 2: Practical AI Apps',
        description: 'Make AI reliable inside real apps.',
        topics: [
          { id: 'ai-3', name: 'Structured JSON Outputs & Schemas', summary: 'Getting predictable data instead of messy paragraphs.' },
          { id: 'ai-4', name: 'Embeddings & RAG Search', summary: 'Letting AI answer from real verified documents.' },
        ],
      },
      {
        id: 'ai-s3',
        title: 'Stage 3: Safety & Evals',
        description: 'Verify quality and protect user data.',
        topics: [
          { id: 'ai-5', name: 'Prompt Safety & Key Security', summary: 'Keeping API keys on the server and handling failures cleanly.' },
          { id: 'ai-6', name: 'Evaluating Output Quality', summary: 'Checking accuracy instead of guessing.' },
        ],
      },
    ],
  },
  python: {
    id: 'rm-python',
    slug: 'python',
    title: 'Python Developer',
    field: 'Python',
    officialUrl: 'https://roadmap.sh/python',
    summary: 'Learn Python fundamentals, data structures, modules, testing, and building web or automation projects.',
    whatYouWillLearn: [
      'Python syntax, functions, lists, and dictionaries',
      'Modules, virtual environments, and package management',
      'Object-oriented Python, error handling, and automated testing',
    ],
    stages: [
      {
        id: 'py-s1',
        title: 'Stage 1: Python Core',
        description: 'Master readable syntax and foundational problem solving.',
        topics: [
          { id: 'py-1', name: 'Learn the Basics', summary: 'Variables, loops, conditionals, functions, and clean string formatting.' },
          { id: 'py-2', name: 'Data Structures (Lists, Dicts, Sets)', summary: 'Choosing the right collection and iterating cleanly.' },
          { id: 'py-3', name: 'Modules & Virtual Environments', summary: 'Organizing files and isolating dependencies with venv and pip.' },
        ],
      },
      {
        id: 'py-s2',
        title: 'Stage 2: Files, APIs & Testing',
        description: 'Connect Python scripts to real files, HTTP APIs, and tests.',
        topics: [
          { id: 'py-4', name: 'Error Handling & File I/O', summary: 'Reading JSON/CSV files safely and catching exceptions clearly.' },
          { id: 'py-5', name: 'Object-Oriented Programming & Dataclasses', summary: 'Modeling domain objects cleanly.' },
          { id: 'py-6', name: 'Testing with pytest & Frameworks', summary: 'Writing repeatable tests and exploring FastAPI / Flask / Django.' },
        ],
      },
    ],
  },
  'react-native': {
    id: 'rm-mobile',
    slug: 'react-native',
    title: 'Mobile Developer (React Native)',
    field: 'Mobile Development',
    officialUrl: 'https://roadmap.sh/react-native',
    summary: 'Build cross-platform iOS and Android apps with React Native, navigation, and device APIs.',
    whatYouWillLearn: ['JavaScript & React essentials', 'Mobile layouts & navigation', 'APIs, offline storage & publishing'],
    stages: [
      {
        id: 'mb-s1',
        title: 'Stage 1: Mobile Foundations',
        description: 'Core JavaScript and React skills for mobile screens.',
        topics: [
          { id: 'mb-1', name: 'JavaScript ES6+ & React Basics', summary: 'Components, props, state, and lists.' },
          { id: 'mb-2', name: 'Core Native Views & Flexbox Layouts', summary: 'Building touch-friendly screens for phones.' },
        ],
      },
      {
        id: 'mb-s2',
        title: 'Stage 2: Navigation & Data',
        description: 'Multi-screen apps with live data.',
        topics: [
          { id: 'mb-3', name: 'Stack & Tab Navigation', summary: 'Moving cleanly between app screens.' },
          { id: 'mb-4', name: 'Fetching APIs & Local Storage', summary: 'Saving data on the device and handling offline states.' },
        ],
      },
    ],
  },
  'cyber-security': {
    id: 'rm-cyber',
    slug: 'cyber-security',
    title: 'Cyber Security',
    field: 'Cybersecurity',
    officialUrl: 'https://roadmap.sh/cyber-security',
    summary: 'Understand networking, operating systems, common vulnerabilities, and how to defend software safely.',
    whatYouWillLearn: ['Networking & Linux fundamentals', 'Web security basics (OWASP)', 'Threat analysis & defensive habits'],
    stages: [
      {
        id: 'cs-s1',
        title: 'Stage 1: IT & Networking Fundamentals',
        description: 'Know how systems talk before trying to secure them.',
        topics: [
          { id: 'cs-1', name: 'Networking Basics (TCP/IP, DNS, HTTP)', summary: 'Ports, packets, TLS encryption, and requests.' },
          { id: 'cs-2', name: 'Linux Command Line & Permissions', summary: 'Users, files, processes, and logs.' },
        ],
      },
      {
        id: 'cs-s2',
        title: 'Stage 2: Application & Web Defense',
        description: 'Spot and prevent everyday security bugs.',
        topics: [
          { id: 'cs-3', name: 'OWASP Top 10 Basics', summary: 'Preventing injection, XSS, broken auth, and leaked secrets.' },
          { id: 'cs-4', name: 'Authentication & Access Control', summary: 'Least privilege and safe session handling.' },
        ],
      },
    ],
  },
  devops: {
    id: 'rm-devops',
    slug: 'devops',
    title: 'DevOps Engineer',
    field: 'DevOps',
    officialUrl: 'https://roadmap.sh/devops',
    summary: 'Learn Linux, scripting, Git, containers, CI/CD automation, and cloud hosting.',
    whatYouWillLearn: ['Linux & shell scripting', 'Docker containers', 'Automated CI/CD pipelines & monitoring'],
    stages: [
      {
        id: 'do-s1',
        title: 'Stage 1: OS & Scripting',
        description: 'Get comfortable automating tasks in Linux.',
        topics: [
          { id: 'do-1', name: 'Linux Terminal & Bash Scripting', summary: 'Managing servers, logs, and permissions.' },
          { id: 'do-2', name: 'Networking & DNS Essentials', summary: 'Ports, reverse proxies, HTTPS certificates.' },
        ],
      },
      {
        id: 'do-s2',
        title: 'Stage 2: Containers & Automation',
        description: 'Package and deploy apps repeatably.',
        topics: [
          { id: 'do-3', name: 'Docker & Containers', summary: 'Writing Dockerfiles and running local stacks.' },
          { id: 'do-4', name: 'CI/CD with GitHub Actions', summary: 'Running tests and builds automatically on every push.' },
        ],
      },
    ],
  },
  'ux-design': {
    id: 'rm-ux',
    slug: 'ux-design',
    title: 'UX Design',
    field: 'UI/UX Design',
    officialUrl: 'https://roadmap.sh/ux-design',
    summary: 'Learn user research, clear information flow, wireframing, accessibility, and design systems.',
    whatYouWillLearn: ['Understanding user problems', 'Wireframes & visual hierarchy', 'Accessibility & usability testing'],
    stages: [
      {
        id: 'ux-s1',
        title: 'Stage 1: Thinking Like a Designer',
        description: 'Start with clarity and real user needs.',
        topics: [
          { id: 'ux-1', name: 'User Flows & Wireframing', summary: 'Sketching simple steps before adding colors.' },
          { id: 'ux-2', name: 'Typography, Spacing & Contrast', summary: 'Making screens effortless to scan and read.' },
          { id: 'ux-3', name: 'Accessibility & Usability Checks', summary: 'Testing with real people and fixing confusion early.' },
        ],
      },
    ],
  },
  'data-analyst': {
    id: 'rm-data',
    slug: 'data-analyst',
    title: 'Data Analyst',
    field: 'Data Science',
    officialUrl: 'https://roadmap.sh/data-analyst',
    summary: 'Analyze real datasets cleanly using SQL, spreadsheets, Python, and clear charts.',
    whatYouWillLearn: ['SQL querying & cleaning data', 'Python / Pandas analysis', 'Clear visual storytelling'],
    stages: [
      {
        id: 'da-s1',
        title: 'Stage 1: Data Core',
        description: 'Work confidently with tables and queries.',
        topics: [
          { id: 'da-1', name: 'SQL Queries & Aggregations', summary: 'SELECT, WHERE, GROUP BY, and JOIN.' },
          { id: 'da-2', name: 'Python & Pandas Basics', summary: 'Cleaning messy rows and exploring patterns.' },
          { id: 'da-3', name: 'Clear Charts & Communicating Findings', summary: 'Choosing honest visuals without clutter.' },
        ],
      },
    ],
  },
  blockchain: {
    id: 'rm-blockchain',
    slug: 'blockchain',
    title: 'Blockchain Developer',
    field: 'Blockchain Development',
    officialUrl: 'https://roadmap.sh/blockchain',
    summary: 'Understand cryptography basics, smart contracts, testing, and decentralized apps.',
    whatYouWillLearn: ['How ledgers & wallets work', 'Writing & testing smart contracts', 'Connecting web frontends safely'],
    stages: [
      {
        id: 'bc-s1',
        title: 'Stage 1: Core Concepts',
        description: 'Start with security-first fundamentals.',
        topics: [
          { id: 'bc-1', name: 'Cryptography, Hashes & Wallets', summary: 'Keys, signatures, and how transactions are verified.' },
          { id: 'bc-2', name: 'Solidity Basics & Contract Testing', summary: 'Writing small contracts and testing edge cases locally.' },
        ],
      },
    ],
  },
};

const LIVE_CACHE = new Map<string, { expiresAt: number; result: RoadmapLookupResult }>();
const CACHE_TTL_MS = 30 * 60 * 1000;

export function resolveRoadmapSlug(fieldOrSlug: string): string | null {
  const key = fieldOrSlug.trim().toLowerCase();
  if (!key) return null;
  if (VERIFIED_ROADMAPS[key]) return key;
  if (ROADMAP_SLUGS[key]) return ROADMAP_SLUGS[key];
  for (const [label, slug] of Object.entries(ROADMAP_SLUGS)) {
    if (key.includes(label) || label.includes(key)) return slug;
  }
  if (/^[a-z0-9-]{2,40}$/.test(key)) return key;
  return null;
}

function parseRoadmapShJson(slug: string, json: any, fallbackField: string): RoadmapLookupResult | null {
  const nodes: any[] = Array.isArray(json?.nodes) ? json.nodes : [];
  const edges: any[] = Array.isArray(json?.edges) ? json.edges : [];
  if (!nodes.length) return null;

  const rawTitle =
    typeof json?.title === 'string'
      ? json.title
      : json?.title?.page || json?.title?.card || fallbackField;
  const rawDesc =
    typeof json?.description === 'string' && json.description.trim()
      ? json.description.replace(/@currentYear@/g, String(new Date().getFullYear()))
      : `Official roadmap.sh progression for ${rawTitle}.`;

  const nodeById = new Map<string, any>();
  for (const n of nodes) {
    if (n?.id) nodeById.set(String(n.id), n);
  }

  // Map topic -> connected subtopics via edges
  const subtopicsByTopic = new Map<string, string[]>();
  for (const edge of edges) {
    const src = nodeById.get(String(edge?.source || ''));
    const tgt = nodeById.get(String(edge?.target || ''));
    if (!src || !tgt) continue;
    const srcLabel = String(tgt?.data?.label || '').trim();
    if ((src.type === 'topic' || src.type === 'todo') && tgt.type === 'subtopic' && srcLabel) {
      const list = subtopicsByTopic.get(src.id) || [];
      if (!list.includes(srcLabel)) list.push(srcLabel);
      subtopicsByTopic.set(src.id, list);
    } else if ((tgt.type === 'topic' || tgt.type === 'todo') && src.type === 'subtopic') {
      const lbl = String(src?.data?.label || '').trim();
      if (lbl) {
        const list = subtopicsByTopic.get(tgt.id) || [];
        if (!list.includes(lbl)) list.push(lbl);
        subtopicsByTopic.set(tgt.id, list);
      }
    }
  }

  const topicNodes = nodes
    .filter((n) => (n?.type === 'topic' || n?.type === 'todo') && String(n?.data?.label || '').trim())
    .sort((a, b) => (Number(a?.position?.y) || 0) - (Number(b?.position?.y) || 0));

  if (topicNodes.length === 0) return null;

  const seenNames = new Set<string>();
  const cleanTopics: { y: number; topic: RoadmapStageTopic }[] = [];
  for (const node of topicNodes) {
    const label = String(node.data.label).replace(/\s+/g, ' ').trim();
    if (!label || label.length > 90) continue;
    const key = label.toLowerCase();
    if (seenNames.has(key)) continue;
    seenNames.add(key);

    const subs = subtopicsByTopic.get(node.id) || [];
    const summary = subs.length
      ? `Includes: ${subs.slice(0, 5).join(', ')}${subs.length > 5 ? ` (+${subs.length - 5} more)` : ''}.`
      : 'Core milestone from the official roadmap.sh path.';

    cleanTopics.push({
      y: Number(node?.position?.y) || 0,
      topic: {
        id: `rmsh-${slug}-${node.id}`,
        name: label,
        summary,
      },
    });
  }

  if (cleanTopics.length === 0) return null;

  // Build balanced progressive stages (3-5 stages of ~4-7 topics each)
  const labelNodes = nodes
    .filter((n) => n?.type === 'label' && String(n?.data?.label || '').trim())
    .sort((a, b) => (Number(a?.position?.y) || 0) - (Number(b?.position?.y) || 0))
    .map((n) => ({
      y: Number(n?.position?.y) || 0,
      title: String(n.data.label).replace(/\s+/g, ' ').trim(),
    }));

  const stages: RoadmapStage[] = [];
  const total = cleanTopics.length;
  const targetStageCount = total <= 6 ? 2 : total <= 14 ? 3 : 4;
  const chunkSize = Math.ceil(total / targetStageCount);

  for (let i = 0; i < total; i += chunkSize) {
    const slice = cleanTopics.slice(i, i + chunkSize);
    const stageNum = stages.length + 1;
    const minY = slice[0].y;
    const maxY = slice[slice.length - 1].y;
    const matchingLabel = labelNodes.find((l) => l.y >= minY - 120 && l.y <= maxY + 40);
    const defaultStageNames = [
      'Core Foundations',
      'Essential Skills & Tooling',
      'Practical Application',
      'Architecture & Specialization',
    ];
    const stageName = matchingLabel?.title || defaultStageNames[stageNum - 1] || `Phase ${stageNum}`;
    stages.push({
      id: `${slug}-stage-${stageNum}`,
      title: `Stage ${stageNum}: ${stageName}`,
      description:
        stageNum === 1
          ? 'Start with these core building blocks in order.'
          : stageNum === targetStageCount
            ? 'Deepen your skills and prepare for production projects.'
            : 'Build momentum with the next layer of practical tools.',
      topics: slice.map((x) => x.topic),
    });
  }

  const base = VERIFIED_ROADMAPS[slug];
  return {
    found: true,
    source: 'roadmap.sh',
    liveSynced: true,
    id: base?.id || `rm-${slug}`,
    slug,
    title: String(rawTitle),
    field: base?.field || fallbackField || String(rawTitle),
    officialUrl: `https://roadmap.sh/${slug}`,
    summary: String(rawDesc),
    whatYouWillLearn:
      base?.whatYouWillLearn ||
      stages.map((s) => `${s.title.replace(/^Stage \d+:\s*/, '')}: ${s.topics.slice(0, 3).map((t) => t.name).join(', ')}`),
    stages,
  };
}

export async function lookupRoadmapSh(fieldOrSlug: string): Promise<RoadmapLookupResult> {
  const slug = resolveRoadmapSlug(fieldOrSlug);
  if (!slug) {
    return {
      found: false,
      source: 'none',
      id: '',
      slug: '',
      title: fieldOrSlug,
      field: fieldOrSlug,
      officialUrl: 'https://roadmap.sh',
      summary: '',
      whatYouWillLearn: [],
      stages: [],
    };
  }

  const cached = LIVE_CACHE.get(slug);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.result;
  }

  const base = VERIFIED_ROADMAPS[slug];

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`https://roadmap.sh/api/v1-official-roadmap/${slug}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    clearTimeout(timer);
    if (res.ok) {
      const json: any = await res.json();
      const parsed = parseRoadmapShJson(slug, json, base?.field || fieldOrSlug);
      if (parsed) {
        LIVE_CACHE.set(slug, { expiresAt: Date.now() + CACHE_TTL_MS, result: parsed });
        return parsed;
      }
    }
  } catch {
    // Gracefully keep verified roadmap.sh catalog entry
  }

  if (base) {
    return {
      found: true,
      source: 'roadmap.sh',
      liveSynced: false,
      ...base,
    };
  }

  return {
    found: false,
    source: 'none',
    id: '',
    slug: '',
    title: fieldOrSlug,
    field: fieldOrSlug,
    officialUrl: 'https://roadmap.sh',
    summary: '',
    whatYouWillLearn: [],
    stages: [],
  };
}

export function listOfficialRoadmaps(): RoadmapLookupResult[] {
  return Object.values(VERIFIED_ROADMAPS).map((r) => {
    const cached = LIVE_CACHE.get(r.slug);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.result;
    }
    return {
      found: true,
      source: 'roadmap.sh',
      liveSynced: false,
      ...r,
    };
  });
}
