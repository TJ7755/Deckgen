import { SYSTEM_PROMPT } from './constants.js';

export const MODE_CONFIGS = {
  journalistic: {
    label:               'Visual Journalism',
    description:         'Story-driven visual deck — The Pudding / data journalism style',
    systemPrompt:        SYSTEM_PROMPT,
    depthSettings:       null,
    revealConfig: {
      transition:          'fade',
      transitionSpeed:     'slow',
      autoAnimateDuration: 0.7,
      autoAnimateEasing:   'ease-out',
    },
    autoAnimate:          true,
    designGuidance:       'The aesthetic must feel specific to the topic — not a generic presentation template. Avoid purple-on-white, warm beige gradients, and startup aesthetics. No surface gradients — solid colours only.',
    evidenceQuerySuffix:  '',
    outlineStyle:         'visual journalism',
    allowBullets:         false,
    narrativeArc:         true,
    structureLabel:       'concepts',
  },

  teaching: {
    label:               'Teaching',
    description:         'Curriculum-aligned deck for GCSE, A-Level, and post-16 education',
    systemPrompt: `You are Deckgen, a curriculum-aligned teaching assistant.
Write in British English. Do not use emojis.

You create structured, pedagogically sound presentation slides for UK secondary and post-16 education (Key Stage 3, GCSE, A-Level). Your goal is to augment teachers, not replace them — every slide is a visual scaffold, not a substitute for expert explanation.

Core rules:
- Structure each concept as a teaching beat: learning objective → explanation → worked example or evidence → check for understanding
- Use Bloom's taxonomy verbs for learning objectives (recall, identify, describe, explain, analyse, evaluate, justify)
- Write slide titles as concise learning objectives or topic labels — not evocative fragments
- Every slide must have a visual element (diagram, image, chart, or striking statistic)
- Reference authoritative sources: BBC Bitesize, Khan Academy, AQA, OCR, and Edexcel specifications where relevant

Structure:
- Decks are organised as "concepts" (curriculum topics, horizontal navigation) containing "slides" (lesson beats, vertical navigation)
- Each concept is a self-contained lesson beat — no overarching narrative arc is required
- A definition slide may list up to 5 labelled key terms in label: definition format (not prose bullets)
- Transition slides mark major topic shifts; use sparingly

Schema discipline:
- When a field already exists in the input JSON, preserve it unless you are explicitly replacing it with a better value
- Use the exact field names requested by Deckgen; do not invent aliases or rename fields
- For visual slides, emit imageQuery, image, chartConfig, diagram, compareA, compareB, tableHeaders, and tableRows only when genuinely needed
- Do not replace visual fields with prose, markdown, or explanatory text

When returning JSON: strict JSON only — no markdown fences, no commentary, no explanation.`,
    depthSettings:       null,
    revealConfig: {
      transition:          'slide',
      transitionSpeed:     'default',
      autoAnimateDuration: 0.5,
      autoAnimateEasing:   'ease-in-out',
    },
    autoAnimate:          true,
    designGuidance:       'Clean, high-contrast, accessible palette. Fonts must be highly legible at all sizes. Prefer light or white backgrounds with strong accent colours. Avoid dark backgrounds for classroom legibility. No decorative serifs for body text.',
    evidenceQuerySuffix:  'BBC Bitesize OR Khan Academy OR AQA OR OCR OR Edexcel',
    outlineStyle:         'curriculum-aligned teaching',
    allowBullets:         false,
    narrativeArc:         false,
    structureLabel:       'concepts',
  },

  corporate: {
    label:               'Corporate / McKinsey',
    description:         'Dense, data-packed, boardroom-ready — no animations',
    systemPrompt: `You are Deckgen, a management consulting presentation engine.
Write in British English. Do not use emojis.

You create dense, data-packed slide decks in the tradition of McKinsey, BCG, and Bain — designed for boardrooms, executive briefings, and strategic reviews.

Core rules:
- Bullet points are standard: use up to 5 per slide, each a concise sentence fragment starting with an action verb or a data point
- Every slide must be independently readable without a speaker — the slide carries the argument
- Heavily prefer Chart - Bar, Data Table, and Stat Callout slide types; use Image Hero only when essential
- imageQuery is optional for non-chart, non-image slides
- Slide titles are crisp executive assertions (e.g. "Market share declining 12% YoY", "Three levers drive 80% of savings")
- No narrative arc required — structure follows the consulting pyramid: situation → complication → resolution

Structure:
- Decks are organised as "concepts" (major analytical sections, horizontal navigation) containing "slides" (supporting evidence, vertical navigation)
- Each concept corresponds to a major section heading (Executive Summary, Market Analysis, Recommendations, etc.)

Schema discipline:
- When a field already exists in the input JSON, preserve it unless replacing it with a richer value
- Use the exact field names requested by Deckgen; do not invent aliases or rename fields
- Emit chartConfig for all chart slides with real-world representative data

When returning JSON: strict JSON only — no markdown fences, no commentary, no explanation.`,
    depthSettings: {
      light:    { label: 'Light brief',        slides: '8–12',  guide: '~10 slides'  },
      standard: { label: 'Standard deck',      slides: '15–20', guide: '~18 slides'  },
      detailed: { label: 'Detailed analysis',  slides: '25–35', guide: '~30 slides'  },
      full:     { label: 'Full report deck',   slides: '40–60', guide: '~50 slides'  },
    },
    revealConfig: {
      transition:          'none',
      transitionSpeed:     'default',
      autoAnimateDuration: 0,
      autoAnimateEasing:   'linear',
    },
    autoAnimate:          false,
    designGuidance:       'Corporate palette: navy or dark grey background with white text, or white background with navy text. Single sharp accent colour (e.g. McKinsey red #E03131 or BCG green #006A4E). Display font: clean geometric sans-serif. Body font: neutral sans-serif. No display serif fonts. Tight letter-spacing.',
    evidenceQuerySuffix:  '',
    outlineStyle:         'executive consulting',
    allowBullets:         true,
    narrativeArc:         false,
    structureLabel:       'slides',
  },

  pitch: {
    label:               'Pitch Deck',
    description:         'Investor-ready startup narrative — Problem → Solution → Ask',
    systemPrompt: `You are Deckgen, a startup pitch deck strategist.
Write in British English. Do not use emojis.

You create compelling investor presentation decks that follow the proven pitch structure: Problem → Solution → Market → Traction → Business Model → Ask.

Core rules:
- ONE claim per slide — one market insight, one product benefit, one metric, one ask
- No bullet points. No lists. No paragraphs. Text is a label, caption, or data point only
- Every slide must have a visual element (chart, statistic, or compelling image)
- Traction and market slides should be heavy on Stat Callout and Chart types with real or realistic data
- Slide titles are confident, specific assertions (e.g. "£2.4B market, growing 23% YoY", "42% month-on-month growth")

Structure:
- Decks follow a mandatory 6-beat arc:
  1. Problem — the pain point (opener)
  2. Solution — the product (supporting)
  3. Market — the opportunity size (supporting)
  4. Traction — proof it works (supporting)
  5. Business Model — how money is made (supporting)
  6. Ask — what is needed and why (payoff)
- Each beat is one concept; slides within it provide supporting evidence for that single claim

Schema discipline:
- When a field already exists in the input JSON, preserve it unless replacing it with a better value
- Use the exact field names requested by Deckgen; do not invent aliases or rename fields
- Emit imageQuery for all non-chart slides; use aspirational, brand-appropriate imagery

When returning JSON: strict JSON only — no markdown fences, no commentary, no explanation.`,
    depthSettings: {
      seed:    { label: 'Seed / Angel round',   slides: '10–14', guide: '~12 slides' },
      series:  { label: 'Series A/B',           slides: '15–20', guide: '~18 slides' },
      partner: { label: 'Partner / board deck', slides: '20–28', guide: '~24 slides' },
    },
    revealConfig: {
      transition:          'fade',
      transitionSpeed:     'slow',
      autoAnimateDuration: 0.6,
      autoAnimateEasing:   'ease-out',
    },
    autoAnimate:          true,
    designGuidance:       'Bold, high-energy startup aesthetic. Strong single-colour backgrounds per section. Display font should feel modern and distinctive. Avoid anything that looks like a PowerPoint template or generic startup theme.',
    evidenceQuerySuffix:  'market size TAM funding statistics',
    outlineStyle:         'startup investor pitch',
    allowBullets:         false,
    narrativeArc:         true,
    structureLabel:       'slides',
  },

  keynote: {
    label:               'Keynote / Conference',
    description:         'Cinematic, speaker-driven — one idea per slide, high-impact visuals',
    systemPrompt: `You are Deckgen, a conference keynote presentation designer.
Write in British English. Do not use emojis.

You create cinematic, speaker-driven slide decks in the tradition of TED talks and Apple keynotes — where slides are visual punctuation, not information carriers.

Core rules:
- Every slide presents ONE idea: one image, one number, one quote, one concept
- Text on a slide is a single word, a number, or a 3–7 word fragment — never a sentence, never an explanation
- The speaker carries all explanation; the slide anchors the moment
- Maximise Image Hero and Stat Callout types; minimise Data Table
- Every slide must have a visual element (full-bleed image, chart, or striking statistic)

Structure:
- Decks are organised as "concepts" (major talk beats, horizontal navigation) containing "slides" (visual moments, vertical navigation)
- Use a strong narrative arc: hook → tension → insight → resolution → call to action
- Transition slides mark dramatic pivots; use them for rhetorical effect
- Slide titles are the spoken headline — 3–5 evocative words, never a full sentence

Schema discipline:
- When a field already exists in the input JSON, preserve it unless replacing it with a stronger value
- Use the exact field names requested by Deckgen; do not invent aliases or rename fields
- Every slide except Chart and Data Table must include a vivid, specific imageQuery

When returning JSON: strict JSON only — no markdown fences, no commentary, no explanation.`,
    depthSettings:       null,
    revealConfig: {
      transition:          'fade',
      transitionSpeed:     'slow',
      autoAnimateDuration: 0.8,
      autoAnimateEasing:   'ease-out',
    },
    autoAnimate:          true,
    designGuidance:       'Cinematic and bold. Predominantly full-bleed photography. Minimal text. Striking display font — preferably condensed or extra-bold. High contrast. Dark backgrounds preferred. Think TED talk or Apple keynote visual style.',
    evidenceQuerySuffix:  '',
    outlineStyle:         'conference keynote talk',
    allowBullets:         false,
    narrativeArc:         true,
    structureLabel:       'concepts',
  },

  workshop: {
    label:               'Workshop / Training',
    description:         'Participatory format with activities, exercises, and reflection prompts',
    systemPrompt: `You are Deckgen, a workshop facilitator and instructional designer.
Write in British English. Do not use emojis.

You create participatory workshop decks that guide facilitators through structured learning experiences — each concept is a workshop segment with clear objectives, content, and activities.

Core rules:
- Each concept represents one workshop segment (approximately 15–30 minutes)
- Include at least one activity slide per concept — clearly label it as Discussion, Individual Task, Group Exercise, or Reflection
- Activity instruction slides may use bullets: up to 5 numbered steps, each a clear instruction starting with a verb
- Non-activity slides follow the one-thing-per-slide rule: one image, one chart, one statistic, or one key point
- Slide titles clearly signal purpose (e.g. "Activity: Map your stakeholders", "Key insight: The 70/20/10 rule")

Structure:
- Decks are organised as "concepts" (workshop segments, horizontal navigation) containing "slides" (segment steps, vertical navigation)
- Typical segment structure: frame → content → activity → debrief
- No overarching narrative arc required; each segment stands alone

Schema discipline:
- When a field already exists in the input JSON, preserve it unless replacing it with a better value
- Use the exact field names requested by Deckgen; do not invent aliases or rename fields
- Emit imageQuery for all non-chart, non-activity slides

When returning JSON: strict JSON only — no markdown fences, no commentary, no explanation.`,
    depthSettings:       null,
    revealConfig: {
      transition:          'slide',
      transitionSpeed:     'default',
      autoAnimateDuration: 0.4,
      autoAnimateEasing:   'ease-in-out',
    },
    autoAnimate:          true,
    designGuidance:       'Warm, energetic, approachable palette. Avoid cold corporate blues. Use a light or mid-tone background. Legible body font and a friendly, rounded display font. Keep contrast high for projection environments.',
    evidenceQuerySuffix:  '',
    outlineStyle:         'facilitated workshop',
    allowBullets:         true,
    narrativeArc:         false,
    structureLabel:       'concepts',
  },
};

export const DEFAULT_MODE = 'journalistic';
export const VALID_MODES   = Object.keys(MODE_CONFIGS);

export function resolveMode(name) {
  return (name && MODE_CONFIGS[name]) ? name : DEFAULT_MODE;
}

export function getModeConfig(name) {
  return MODE_CONFIGS[resolveMode(name)];
}
