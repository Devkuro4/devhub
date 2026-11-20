/**
 * Emotional awareness for the AI mentor.
 *
 * Pure functions with no I/O, shared by the server (prompt building and the safety reply) and the
 * browser (private chat titles and the offline fallback message).
 *
 * Privacy: nothing here stores, logs or sends anything anywhere. The result of an assessment lives
 * only for the one request that asked for it.
 *
 * This is a first-pass classifier over plain English phrases. It is deliberately simple and it errs
 * on the side of safety for self-harm wording. The mentor's system prompt carries the same rules, so
 * the model still handles paraphrases and other languages that these patterns do not catch.
 */

export type EmotionLevel =
  | 'crisis_immediate' // says they may act on self-harm now, or names a plan or means
  | 'crisis' // thoughts of suicide or self-harm
  | 'distress' // serious low mood that is not about code (hopelessness, worthlessness)
  | 'giving_up' // wants to quit learning
  | 'struggling' // frustration, overwhelm, self-doubt, discouragement, disappointment
  | 'confused' // plain confusion, no real distress
  | 'neutral';

export type EmotionSignal =
  | 'frustration'
  | 'confusion'
  | 'overwhelm'
  | 'self_doubt'
  | 'low_motivation'
  | 'giving_up'
  | 'disappointment'
  | 'exhaustion';

export interface EmotionAssessment {
  level: EmotionLevel;
  signals: EmotionSignal[];
  /** The message is a technical question with no emotional content: answer it, do not add reassurance. */
  technicalOnly: boolean;
  /** The learner has hit the same wall more than once in this chat. */
  repeatedDifficulty: boolean;
  /** The learner says the last explanation did not help, so the next one should be different. */
  explanationNotLanding: boolean;
  /** A self-harm concern was raised earlier in this chat (so stay in a caring mode for follow-ups). */
  recentSafetyConcern: boolean;
}

export interface HistoryItem {
  sender: string;
  text: string;
}

// Code and error output can contain words like "kill" or "can't" without any feeling behind them.
function stripCode(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`\n]*`/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const norm = (s: string) =>
  stripCode(String(s || ''))
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/\bcan not\b/g, 'cannot');

// ---- Self-harm and danger ---------------------------------------------------------------------

const IMMEDIATE_PATTERNS: RegExp[] = [
  /\b(going to|gonna|about to|am going to|i'?m going to|i will|i'?ll|ready to|plan(ning)? to|planning on|trying to) (kill myself|end my life|end it all|take my (own )?life|commit suicide|hurt myself|harm myself|overdose)\b/,
  /\b(kill myself|end my life|end it all|take my (own )?life|commit suicide|suicide)\b.{0,40}\b(tonight|right now|today|this (evening|morning|afternoon)|now)\b/,
  /\b(tonight|right now|today)\b.{0,40}\b(kill myself|end my life|end it all|take my (own )?life|commit suicide)\b/,
  /\bi (have|got|made|'?ve made|'?ve got) (a plan|the pills|pills|a knife|a gun|a rope|the means)\b.{0,60}\b(die|kill|suicide|end|hurt)/,
  /\b(taken|swallowed|took) (too many|a lot of|all (my|the)) (pills|tablets|medication|meds)\b/,
  /\bi('?m| am) (in danger|not safe|unsafe)\b/,
  /\bsomeone (is )?(hurting|threatening|going to hurt) me\b/,
  /\bi('?ve| have) (already )?(cut|hurt|harmed|injured) myself\b/,
];

const CRISIS_PATTERNS: RegExp[] = [
  /\b(kill myself|killing myself|end my life|ending my life|take my (own )?life|commit suicide|committing suicide|suicidal|suicide)\b/,
  /\b(want|wanna|wish|wished|wishing|need|ready) to (die(?! (laughing|of (laughter|embarrassment|shame|cringe)|from (laughter|embarrassment)|inside a little))|be dead|disappear forever|not (be here|exist|wake up))\b/,
  /\bwant(ed)? (to )?(just )?(die(?! (laughing|of (laughter|embarrassment|shame|cringe)|from (laughter|embarrassment)))|be dead)\b/,
  /\b(better off dead|better off without me|everyone('?s| is) better off without me|world would be better without me)\b/,
  /\b(don'?t|do not|no longer|not) (want|wish) to (be alive|live|be here|exist|go on living)\b/,
  /\b(no reason|nothing|no point) (to|in) (live|living|be alive|go on|going on|being alive)\b/,
  /\b(hurt|harm|cut|injure|punish) myself\b/,
  /\bself[- ]?harm(ing)?\b/,
  /\b(thoughts|thinking|think) (of|about) (dying|death|ending it|ending things|suicide|killing myself|hurting myself)\b/,
  /\bcan'?t (go on|do this anymore|keep going) (living|with life|with my life)\b/,
  /\bi (just )?(wish|want) i (was|were) (dead|never born)\b/,
  /\b(end it all|end things|end everything)\b/,
];

// ---- Serious low mood that is not about code --------------------------------------------------

const DISTRESS_PATTERNS: RegExp[] = [
  /\bi('?m| am| feel| feel so| feel completely) (worthless|hopeless|empty|numb|a burden|broken inside|a waste of space)\b/,
  /\b(feel|feeling) (like )?(a burden|worthless|hopeless|empty inside|like nothing matters)\b/,
  /\bnothing (matters|will ever (get|be) (better|okay|ok))\b/,
  /\b(i )?hate (myself|my life)\b/,
  /\b(can'?t|cannot) (cope|take it|go on|breathe|stop crying)\b/,
  /\b(having|have had|having a) (a )?(panic attack|breakdown|meltdown)\b/,
  /\bi('?m| am) (falling apart|breaking down|not okay|not ok|depressed|so depressed|in a dark place)\b/,
  /\bno one (cares|would (notice|care|miss me))\b/,
  /\bi('?m| am) (all alone|completely alone)\b/,
  /\bmy life is (falling apart|a mess|over|ruined)\b/,
];

// ---- Learning-related feelings ----------------------------------------------------------------

const GIVING_UP_PATTERNS: RegExp[] = [
  /\bi('?m| am)? ?(going to|gonna|will|want to|wanna|should|might|think i('?ll| will)) (just )?(give up(?! on (this|that|the|my) (approach|idea|solution|method|attempt|way|code|bug))|quit(?! (my|the|this|that) (job|work|server|process|app|editor|terminal|vim|program|script|session))|drop out|stop (learning|coding|trying|programming)|leave (coding|programming|tech))\b/,
  /\bi (give up(?! on (this|that|the|my) (approach|idea|solution|method|attempt|way|code|bug))|quit(?! (my|the|this|that) (job|work|server|process|app|editor|terminal|vim|program|script|session))|surrender|am done|'?m done|'?m out)\b/,
  /\b(giving up|quitting|dropping out)\b/,
  /\bwhat'?s the point (of|in) (learning|coding|trying|continuing|this)\b/,
  /\b(not worth (it|the effort)|waste of (my )?time)\b.{0,40}\b(learn|cod|program|this)\b/,
  /\b(maybe|perhaps) (coding|programming|tech|this) (is )?(just )?not (for me|my thing)\b/,
  /\bi('?m| am) (not|never) (cut out|meant|made|going to make it)\b/,
  /\bshould i (just )?(quit|give up|stop)\b/,
];

const SELF_DOUBT_PATTERNS: RegExp[] = [
  /\bi('?m| am) (so |just |really |too |such a )?(stupid|dumb|slow|useless|hopeless at|bad at|terrible at|an idiot|not smart enough|not good enough|behind|a failure)\b/,
  /\bi (can'?t|cannot|will never|'?ll never|never) (do|get|learn|understand|figure|make) (this|it|anything|any of this|coding|programming)\b/,
  /\bi('?ll| will) never (get|understand|learn|be able|be good)\b/,
  /\b(everyone|everybody|others|other people) (else )?(is|are|seems?) (so much )?(better|faster|smarter|ahead)\b/,
  /\bam i (even )?(cut out|stupid|dumb|too slow|too old|good enough|smart enough)\b/,
  /\b(impostor|imposter) syndrome\b/,
  /\bi('?m| am) not (smart|good|talented|cut out)\b/,
  /\bi('?m| am) (the )?(only|slowest|worst) (one|person)\b/,
  /\bwhy am i (so|always) (slow|bad|dumb|stupid|behind)\b/,
];

const OVERWHELM_PATTERNS: RegExp[] = [
  /\b(overwhelm(ed|ing)?|too much|swamped|drowning|buried|can'?t keep up|so much to (learn|do)|don'?t know where to start|where do i even (start|begin))\b/,
  /\b(my|the) (brain|head|mind) (is )?(fried|hurts|can'?t|is full|is melting)\b/,
  /\b(information|so many) (overload|things|concepts|tutorials|frameworks)\b/,
  /\bi('?m| am) (lost|totally lost|completely lost)\b/,
];

const FRUSTRATION_PATTERNS: RegExp[] = [
  /\b(frustrat(ed|ing)|annoy(ed|ing)|fed up|sick of|so angry|furious|irritat(ed|ing)|infuriating|maddening|losing (it|my mind|my patience))\b/,
  /\b(i )?hate (this|coding|programming|css|javascript|bugs?|errors?|it)\b/,
  /\b(this )?(is )?(driving me (crazy|insane|mad|nuts)|making me (crazy|mad|insane))\b/,
  /\b(still|again) (not working|broken|failing|the same error|getting the same)\b/,
  /\bnothing (works|is working|i try works)\b/,
  /\b(why (won'?t|doesn'?t|isn'?t) (this|it) (work|working)|why does (nothing|this never) work)\b/,
  /\bi('?ve| have) (been )?(stuck|trying|at this) (for )?(hours|all day|all night|forever|days|so long|ages)\b/,
  /\b(ugh+|argh+|aaargh+|wtf|ffs)\b/,
  /\bi (just )?(can'?t|cannot) (take|stand) (this|it) anymore\b/,
  /\bso (stuck|annoying)\b/,
];

const DISAPPOINTMENT_PATTERNS: RegExp[] = [
  /\bi (failed|messed up|screwed up|blew it|got (it|them|everything) wrong|got (a )?(low|bad|poor) (score|mark|grade)|did (badly|terribly|poorly))\b/,
  /\b(failed|flunked|bombed) (the|my|a) (quiz|test|exercise|challenge|assessment|interview|submission)\b/,
  /\b(so |really )?(disappointed|embarrass(ed|ing)|ashamed|discouraged|demoralized|let (myself|everyone) down)\b/,
  /\b(all that|so much) (work|time|effort) (for nothing|wasted)\b/,
  /\bi (made|keep making) (the same|so many|a lot of|stupid|silly|dumb) (mistakes?|errors?)\b/,
  /\bi (feel|felt) (so )?(bad|terrible|awful|crushed|deflated|sad) (about|after|because)\b/,
];

const LOW_MOTIVATION_PATTERNS: RegExp[] = [
  /\b(no|lost|lost my|losing|low) (motivation|drive|energy|enthusiasm|interest|passion)\b/,
  /\b(can'?t|cannot|don'?t|do not) (be bothered|find the motivation|feel like (it|coding|studying|learning))\b/,
  /\b(unmotivated|demotivated|bored of|burn(ed|t)? out|burnout)\b/,
  /\b(don'?t|do not) (want to|feel like) (study|studying|code|coding|learn|learning|open (my|the) laptop)\b/,
  /\bkeep (putting (it|this) off|procrastinating)\b/,
  /\bi('?m| am) (just )?not (feeling it|into it anymore|enjoying (this|it|coding) anymore)\b/,
];

const EXHAUSTION_PATTERNS: RegExp[] = [
  /\b(exhausted|so tired|drained|worn out|wiped out|running on empty|haven'?t (slept|eaten)|no sleep|up all night|been up (all night|for hours))\b/,
];

const CONFUSION_PATTERNS: RegExp[] = [
  /\b(i('?m| am) (so |really |totally |completely )?(confused|lost)|i'?m confus(ed|ing)|confus(ing|ed)|makes no sense|doesn'?t make sense|don'?t (get|understand)|do not (get|understand)|can'?t (understand|wrap my head)|still (don'?t|do not) (get|understand)|no idea what)\b/,
  /\bwhat does (this|that) even mean\b/,
  /\bi('?m| am) (not following|not sure i follow|struggling (to|with) understand)\b/,
];

// The previous explanation did not help.
const NOT_LANDING_PATTERNS: RegExp[] = [
  /\b(still|that|this) (didn'?t|doesn'?t|does not|did not) (help|work|make sense|click)\b/,
  /\b(still|i still) (don'?t|do not|can'?t|cannot) (get|understand|see|follow)\b/,
  /\b(you|that) (already )?(said|explained|told me) (that|this)\b/,
  /\b(explain|say|put) (it|that|this) (differently|another way|in another way|more simply|simpler)\b/,
  /\bi'?m still (confused|lost|stuck)\b/,
  /\b(that|this) (is|was) (still )?(confusing|unclear)\b/,
  /\bsame (thing|explanation) (again|as before)\b/,
  /\b(it )?(still )?(makes|made) no sense\b/,
  /\bi('?m| am) (still )?not (getting|understanding|following) (it|this|that)\b/,
  /\bdoesn'?t click\b/,
];

// Repeated struggle: words learners use when it keeps going wrong.
const REPEAT_WORDS =
  /\b(again|still|same (error|problem|bug|issue|mistake|thing)|keep(s)? (getting|failing|making)|every time|once more|another time|yet again|not again|third time|second time)\b/;

// ---- Technical questions ----------------------------------------------------------------------

const TECHNICAL_HINTS =
  /(```|\b(error|exception|stack ?trace|undefined|null|syntax|function|variable|array|object|loop|class|promise|async|await|api|endpoint|query|database|sql|css|html|javascript|typescript|python|react|node|git|npm|compile|runtime|regex|bug|syntax|import|export|component|hook|state|props|json|http|server|docker)\b|\b(how (do|can|does|to)|what (is|are|does)|why (does|is|do)|difference between|explain|example of|can you show|which (is|should))\b|[{}();=<>]{2,})/i;

function anyMatch(patterns: RegExp[], text: string): boolean {
  return patterns.some((p) => p.test(text));
}

/** True when the text mentions thoughts of suicide or self-harm (code blocks are ignored). */
export function mentionsSelfHarm(text: string): boolean {
  const t = norm(text);
  return anyMatch(IMMEDIATE_PATTERNS, t) || anyMatch(CRISIS_PATTERNS, t);
}

const emptyAssessment = (): EmotionAssessment => ({
  level: 'neutral',
  signals: [],
  technicalOnly: false,
  repeatedDifficulty: false,
  explanationNotLanding: false,
  recentSafetyConcern: false,
});

/**
 * Reads the learner's latest message (plus the recent conversation) and decides how the mentor
 * should respond. History is only used to notice repeated difficulty and an earlier safety concern.
 */
export function assessEmotionalContext(
  message: string,
  history: HistoryItem[] = [],
  context?: { weakTopics?: string[]; currentTopic?: string }
): EmotionAssessment {
  const result = emptyAssessment();
  const raw = String(message || '');
  const text = norm(raw);
  const learnerHistory = (Array.isArray(history) ? history : [])
    .filter((h) => h && h.sender === 'user' && typeof h.text === 'string')
    .slice(-8)
    .map((h) => norm(h.text));

  // Earlier safety concern in this chat: follow-ups ("no", "I'm fine", "okay") must stay caring.
  result.recentSafetyConcern = learnerHistory.slice(-4).some((t) => anyMatch(IMMEDIATE_PATTERNS, t) || anyMatch(CRISIS_PATTERNS, t));

  if (anyMatch(IMMEDIATE_PATTERNS, text)) {
    result.level = 'crisis_immediate';
    return result;
  }
  if (anyMatch(CRISIS_PATTERNS, text)) {
    result.level = 'crisis';
    return result;
  }

  const signals = new Set<EmotionSignal>();
  if (anyMatch(FRUSTRATION_PATTERNS, text)) signals.add('frustration');
  if (anyMatch(CONFUSION_PATTERNS, text)) signals.add('confusion');
  if (anyMatch(OVERWHELM_PATTERNS, text)) signals.add('overwhelm');
  if (anyMatch(SELF_DOUBT_PATTERNS, text)) signals.add('self_doubt');
  if (anyMatch(LOW_MOTIVATION_PATTERNS, text)) signals.add('low_motivation');
  if (anyMatch(DISAPPOINTMENT_PATTERNS, text)) signals.add('disappointment');
  if (anyMatch(EXHAUSTION_PATTERNS, text)) signals.add('exhaustion');
  const givingUp = anyMatch(GIVING_UP_PATTERNS, text);
  if (givingUp) signals.add('giving_up');
  result.signals = Array.from(signals);

  result.explanationNotLanding = anyMatch(NOT_LANDING_PATTERNS, text);

  // Repeated difficulty: the learner signals "again/still" now, or earlier learner messages in this
  // chat were already struggling and the current one is too.
  const earlierStruggles = learnerHistory.filter(
    (t) => anyMatch(FRUSTRATION_PATTERNS, t) || anyMatch(CONFUSION_PATTERNS, t) || anyMatch(NOT_LANDING_PATTERNS, t) || REPEAT_WORDS.test(t)
  ).length;
  const nowStruggling = signals.has('frustration') || signals.has('confusion') || result.explanationNotLanding || REPEAT_WORDS.test(text);
  result.repeatedDifficulty = nowStruggling && (REPEAT_WORDS.test(text) || earlierStruggles >= 2 || (earlierStruggles >= 1 && result.explanationNotLanding));

  // Serious low mood that is not about code. Checked on the whole message so "I feel hopeless" is
  // not mistaken for ordinary learning self-doubt.
  const distress = anyMatch(DISTRESS_PATTERNS, text);
  if (distress) {
    result.level = 'distress';
    return result;
  }
  if (givingUp) {
    result.level = 'giving_up';
    return result;
  }
  const feeling = result.signals.filter((s) => s !== 'confusion');
  if (feeling.length) {
    result.level = 'struggling';
    return result;
  }
  if (signals.has('confusion') || result.explanationNotLanding) {
    result.level = 'confused';
    result.technicalOnly = false;
    return result;
  }
  // A recent safety concern keeps the chat in a caring mode even if this message looks neutral.
  if (result.recentSafetyConcern) return result;

  result.technicalOnly = TECHNICAL_HINTS.test(raw) || raw.trim().endsWith('?');
  void context;
  return result;
}

/** Sensitive feelings should not be written into the visible chat-list title. */
export function isSensitiveForTitle(text: string): boolean {
  const a = assessEmotionalContext(text);
  return a.level === 'crisis' || a.level === 'crisis_immediate' || a.level === 'distress' || a.level === 'giving_up' || (a.level === 'struggling' && a.signals.length > 0 && !/```/.test(text) && text.length < 160 && !TECHNICAL_HINTS.test(text));
}

// ---- Prompt guidance (used with Groq) ---------------------------------------------------------

/**
 * A short, per-message block appended to the system prompt. It tells the model how to answer THIS
 * message: nothing for an ordinary technical question beyond "answer it directly".
 */
export function buildEmotionGuidance(a: EmotionAssessment, context?: { weakTopics?: string[]; currentTopic?: string }): string {
  const lines: string[] = [];
  const topic = String(context?.currentTopic || '').trim();
  const weak = (context?.weakTopics || []).map(String).filter(Boolean);
  const topicIsWeak = Boolean(topic) && weak.some((w) => w.toLowerCase().includes(topic.toLowerCase()) || topic.toLowerCase().includes(w.toLowerCase()));

  if (a.level === 'distress' || a.recentSafetyConcern) {
    lines.push(
      'THIS MESSAGE: the learner may be going through something heavier than a coding problem. Set the lesson aside for this reply.',
      '- Respond with calm warmth in 3 to 6 short sentences. Say you are glad they told you and that what they feel sounds heavy. Do not judge, and do not minimise.',
      '- Do not teach, assign a task, or give study advice in this reply. Do not use cheerleading or "everything happens for a reason" lines.',
      '- Ask gently how they are doing and whether they are safe right now, or whether they have thoughts of hurting themselves. If they are, they should contact someone they trust or a local crisis line or emergency number now.',
      '- Say plainly that you are an AI study mentor, not a counsellor or doctor, and that talking to a trusted person or a professional can help in a way you cannot.',
      '- If they answer that they are okay, believe them kindly, stay available, and let THEM choose whether to go back to the lesson.',
      '- Never give methods, means or instructions for self-harm.'
    );
  } else if (a.level === 'giving_up') {
    lines.push(
      'THIS MESSAGE: the learner is thinking about quitting. Do not argue them out of it and do not give a motivational speech.',
      '- Take it seriously in the first sentence ("That sounds really draining" level, in your own words). Do not dismiss the feeling.',
      '- Ask, as one gentle choice, what would help most right now: talk about what is making it feel this way, take a proper break, or try a much smaller or different way into the topic.',
      '- Mention something true from their context or chat if there is one. Never invent achievements or numbers. Do not promise they will definitely succeed.',
      '- Keep it to about 50 to 100 words. No lesson content in this reply, and no long explanation.'
    );
  } else if (a.level === 'struggling') {
    const parts: string[] = [];
    if (a.signals.includes('frustration')) parts.push('frustration (acknowledge it first; do not tell them to calm down)');
    if (a.signals.includes('overwhelm')) parts.push('feeling overwhelmed (shrink the problem to ONE tiny step, about 5 minutes of work; drop everything else)');
    if (a.signals.includes('self_doubt')) parts.push('self-doubt (say that a mistake or slow pace is not a verdict on them; point to something real from the chat; no flattery)');
    if (a.signals.includes('disappointment')) parts.push('disappointment after a mistake (a mistake is information, not a failure; say what it shows and the smallest fix)');
    if (a.signals.includes('low_motivation')) parts.push('low motivation (be honest and low-pressure; offer a very small step or a break; do not lecture)');
    if (a.signals.includes('exhaustion')) parts.push('tiredness (say that resting is a reasonable choice and offer to pick this up later)');
    lines.push(
      `THIS MESSAGE: the learner is showing ${parts.join('; ')}.`,
      '- Open with one or two genuine sentences that acknowledge how they feel, in your own natural words. Do not use stock phrases, exclamation marks or a motivational-poster tone.',
      '- Keep the reply short (about 60 to 120 words). Do NOT dump a long explanation on someone who is already struggling.',
      '- Give at most one small, concrete next step, then ask ONE gentle question or offer an easy choice: talk about it, take a break, or try it a different way.',
      '- You may give a little more help than their chosen help level would normally allow, but never withhold help to make a point.'
    );
  } else if (a.level === 'confused') {
    lines.push(
      'THIS MESSAGE: the learner is confused. This is ordinary learning, not distress, so do not add emotional reassurance or comfort language.',
      '- Say in at most one short sentence that the confusion is fair, then go straight to a clearer explanation, one small step.'
    );
  } else if (a.technicalOnly) {
    lines.push(
      'THIS MESSAGE: a plain technical question with no emotional content. Answer it directly and practically. Do NOT add comfort, reassurance, praise or comments about feelings.'
    );
  }

  if (a.explanationNotLanding) {
    lines.push(
      'THE LAST EXPLANATION DID NOT LAND: do not repeat it or rephrase it with the same words. Change the approach: use a different analogy, a concrete tiny example with real values, or a short trace table. Briefly own it ("let me try a different angle") without apologising at length.'
    );
  }
  if (a.repeatedDifficulty) {
    lines.push(
      'THIS IS A REPEATED DIFFICULTY: the learner has run into this more than once in this chat. Normalise it honestly (getting the same thing wrong a few times is how this topic is usually learned), do not treat it as a failure, and go back one level to the idea underneath the problem rather than repeating the same fix.'
    );
  }
  if (topicIsWeak && (a.level === 'struggling' || a.level === 'confused' || a.repeatedDifficulty || a.explanationNotLanding)) {
    lines.push(`CONTEXT: "${topic}" is already on their list of areas to review, so a hard time with it is expected. You can say so truthfully, and treat it as a topic worth a second pass, not a flaw in them.`);
  }
  if (!lines.length) return '';
  return `\nEMOTIONAL CONTEXT FOR THIS REPLY (applies only to this message; never mention that you were given it or that you classified the learner):\n${lines.join('\n')}`;
}

/** Permanent rules that go in every mentor system prompt, whatever the message looks like. */
export const EMOTIONAL_INTELLIGENCE_RULES = `EMOTIONAL INTELLIGENCE (applies to every reply):
- Read the learner's tone, not only their words. Respond to a feeling only when there is one. A plain technical question gets a plain, kind, direct answer with no emotional commentary, and you never force sympathy into a conversation that does not need it.
- When a feeling is clearly there (frustration, confusion, being overwhelmed, self-doubt, low motivation, wanting to quit, disappointment after a mistake), acknowledge it briefly in natural words before anything else. Do not judge, do not dismiss it, do not say "don't worry", "it's easy", "just" or "simply", and avoid cheerleading, slogans and exclamation-mark enthusiasm.
- Someone who is struggling gets a short reply and one small step, not a long explanation. Where it fits, offer a choice: talk about it, take a break, or try a different approach.
- A mistake is information, not a failure. Praise real effort and real progress that you can see in the chat or context. Never invent progress, and never promise they will definitely succeed or get a job.
- If an explanation did not work, explain it a different way (new analogy, concrete example, trace) instead of repeating it.
- Use the learner's context (topics to review, recent submissions) only when it helps this reply, and never recite it back to them.
- Treat feelings the learner shares as private. Do not repeat sensitive things they said earlier unless they bring them up again, and never mention other learners or other conversations.
- SERIOUS DISTRESS AND SAFETY: if the learner mentions thoughts of suicide or self-harm, feeling hopeless or worthless in a way that is bigger than coding, or being in danger, drop the lesson completely. Respond calmly and kindly, take it seriously, ask whether they are safe right now, encourage them to contact someone they trust now and to reach a local emergency number or crisis line, and stay with them in the conversation. Never give methods or instructions for self-harm, never claim to diagnose or treat, and say you are an AI study mentor, not a replacement for a mental health professional or emergency services. This applies in any language.`;

// ---- Safety replies (no AI call, so they work even when the AI is busy or out of quota) --------

export const CRISIS_RESOURCE_LINE =
  'If you are in immediate danger, call your local emergency number now. To find a crisis line in your country, findahelpline.com lists free, confidential ones by country.';

export function crisisReply(level: 'crisis' | 'crisis_immediate'): string {
  if (level === 'crisis_immediate') {
    return [
      "I'm really glad you told me, and I'm taking this seriously. Your safety matters more than anything on this platform.",
      '',
      "If you might act on these thoughts, or you are in danger right now, please call your local emergency number now, or go to the nearest emergency room. If you can, move away from anything you could use to hurt yourself, and get another person physically close to you: a family member, a friend, a neighbour.",
      '',
      CRISIS_RESOURCE_LINE,
      '',
      "I'm an AI study mentor, not a counsellor or a replacement for emergency or mental health care, so please reach out to a real person right now. I'll stay here with you in this chat. Can you tell me whether someone is with you, or whether you've been able to contact anyone?",
    ].join('\n');
  }
  return [
    "Thank you for telling me. That sounds painful, and I'm taking it seriously. We can leave the lessons for later; you matter more than any of this.",
    '',
    "Are you thinking about acting on these thoughts, or are you safe right now? If you are not safe, or you might hurt yourself, please call your local emergency number now.",
    '',
    "Please also tell someone you trust today: a friend, a family member, a teacher, or a doctor. You do not have to explain it perfectly. Something like \"I'm not doing okay and I need company\" is enough. " + CRISIS_RESOURCE_LINE,
    '',
    "I'm an AI study mentor, so I can't diagnose anything or replace a professional, but I'm here and happy to keep talking, about how you're feeling or about anything else. How are you doing right now?",
  ].join('\n');
}

/** Shown in the chat only when the AI could not be reached, so a struggling learner is not told to "test a small example". */
export function offlineSupportFallback(text: string, currentTopic: string): string | null {
  const a = assessEmotionalContext(text);
  if (a.level === 'crisis' || a.level === 'crisis_immediate') return crisisReply(a.level);
  if (a.level === 'distress') {
    return `I couldn't reach the AI mentor just now, but I don't want that to get in the way: what you wrote sounds heavy. If you can, tell someone you trust how you're feeling today. If you feel unsafe, contact your local emergency number. ${CRISIS_RESOURCE_LINE}`;
  }
  if (a.level === 'giving_up' || a.level === 'struggling') {
    return `I couldn't reach the AI mentor just now. It's okay to step away for a bit. When you come back, try one tiny step on ${currentTopic || 'your current topic'}, or ask in Community Discussions, where other learners can help.`;
  }
  return null;
}
