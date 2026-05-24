export const GEMINI_MODEL = 'gemini-3.1-flash-lite';
export const DEFAULT_CODEX_MODEL = 'gpt-5.4';
export const GH_DEVICE_CLIENT_ID = 'Iv1.b507a08c87ecfe98';
export const COPILOT_TOKEN_ENV_VARS = ['COPILOT_GITHUB_TOKEN', 'GH_TOKEN', 'GITHUB_TOKEN'];
export const DEFAULT_COPILOT_MODEL = 'gpt-5.4-mini';

export const PROVIDER_CAPABILITIES = {
  gemini: {
    label: 'Gemini',
    webSearch: 'grounded',
    persistentThreads: false,
    localImageInput: false,
  },
  copilot: {
    label: 'GitHub Copilot',
    webSearch: 'external',
    persistentThreads: false,
    localImageInput: false,
  },
  codex: {
    label: 'Codex',
    webSearch: 'native',
    persistentThreads: true,
    localImageInput: true,
  },
};

export function getProviderCapabilities(provider) {
  const key = String(provider || 'gemini').trim().toLowerCase();
  return PROVIDER_CAPABILITIES[key] || PROVIDER_CAPABILITIES.gemini;
}

export function describeProviderCapabilities(provider) {
  const capabilities = getProviderCapabilities(provider);
  const parts = [];

  if (capabilities.webSearch === 'grounded') {
    parts.push('Google Search grounding');
  } else if (capabilities.webSearch === 'native') {
    parts.push('native live web search');
  } else {
    parts.push('external web evidence from Deckgen');
  }

  if (capabilities.persistentThreads) parts.push('persistent threads');
  if (capabilities.localImageInput) parts.push('local image input');

  return `${capabilities.label}: ${parts.join('; ')}`;
}

export const SYSTEM_PROMPT = `You are Deckgen, a visual journalism presentation engine.
Write in British English. Do not use emojis.

You create story-driven visual decks in the tradition of The Pudding and data journalism — not corporate slide shows.

Core rules:
- Every slide presents ONE thing: one image, one chart, one statistic, or one quote.
- No bullet points. No lists. No paragraphs. No explanatory sentences on slides.
- Text on a slide is a label, caption, or identifier only — never an explanation.
- The speaker explains; the slide anchors.
- Every slide must have a visual element (image, chart, or striking statistic).

Structure:
- Decks are organised as "concepts" (major story beats, horizontal navigation) containing "slides" (supporting visuals, vertical navigation within each beat).
- Use a narrative arc: opener → supporting beats → payoff.
- Transition slides between major beats are optional; use them only for sharp story pivots.

Slide titles are 3–7 evocative word fragments — never complete sentences or self-contained summaries.

Schema discipline:
- When a field already exists in the input JSON, preserve it unless you are explicitly replacing it with a better value.
- Use the exact field names requested by Deckgen; do not invent aliases or rename fields.
- For visual slides, emit imageQuery, image, chartConfig, diagram, compareA, compareB, tableHeaders, and tableRows only when they are genuinely needed.
- Do not replace visual fields with prose, markdown, or explanatory text.

imageQuery rules (critical — images are fetched from Wikimedia Commons):
- imageQuery must be a photographic search term: 2–5 plain English words with no punctuation, as you would type into a stock-photo search.
- Use concrete visual subjects, not abstract concepts. "flooded street at night" works; "evidential problem of evil" does not. "person praying in church" works; "theodicy philosophical argument" does not.
- Every Image Hero and Caption Card slide must have a non-empty imageQuery; omitting it leaves the slide blank.
- For Stat Callout and Quote Callout, imageQuery is optional but should describe a scene or object, not a concept.

When returning JSON: strict JSON only — no markdown fences, no commentary, no explanation.`;

export const TYPE_PALETTE = {
  'Title Card':    'cyan',
  'Transition':    'yellow',
  'Image Hero':    'redBright',
  'Caption Card':  'red',
  'Chart - Bar':   'blue',
  'Chart - Line':  'blue',
  'Data Table':    'greenBright',
  'Quote Callout': 'magenta',
  'Stat Callout':  'magentaBright',
  'Comparison':    'yellow',
};

export const DEPTH_SETTINGS = {
  'overview':      { label: 'Quick overview',  concepts: '3–4',   slidesPerConcept: '1',   guide: '~4–5 total slides'   },
  'focused':       { label: 'Focused story',   concepts: '5–6',   slidesPerConcept: '1–2', guide: '~8–10 total slides'  },
  'standard':      { label: 'Standard',        concepts: '7–8',   slidesPerConcept: '2–3', guide: '~16–22 total slides' },
  'thorough':      { label: 'Thorough',        concepts: '9–11',  slidesPerConcept: '3–4', guide: '~28–40 total slides' },
  'comprehensive': { label: 'Comprehensive',   concepts: '13–16', slidesPerConcept: '4–5', guide: '~55–75 total slides' },
};

export const FALLBACK_CONCEPTS = [
  {
    role: 'opener',
    title: 'Opening',
    slides: [
      { type: 'Title Card',    title: 'Presentation Overview',   imageQuery: 'abstract background' },
    ],
  },
  {
    role: 'supporting',
    title: 'Background',
    slides: [
      { type: 'Image Hero',    title: 'Setting the Scene',       imageQuery: 'contextual scene' },
      { type: 'Stat Callout',  title: 'The Key Number',          imageQuery: 'data statistics' },
    ],
  },
  {
    role: 'supporting',
    title: 'Evidence',
    slides: [
      { type: 'Chart - Bar',   title: 'The Data' },
      { type: 'Quote Callout', title: 'An Expert Voice',         imageQuery: 'person speaking' },
    ],
  },
  {
    role: 'payoff',
    title: 'Conclusion',
    slides: [
      { type: 'Image Hero',    title: 'The Way Forward',         imageQuery: 'horizon future' },
    ],
  },
];

export const countSlides = concepts => concepts.reduce((n, c) => n + (c.slides?.length || 0), 0);
export const allSlides   = concepts => concepts.flatMap(c => c.slides || []);
