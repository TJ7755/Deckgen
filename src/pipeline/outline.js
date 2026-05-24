import { callLLM } from '../llm.js';
import { TYPE_PALETTE, DEPTH_SETTINGS } from '../constants.js';
import { parseJSON, preservePlanFields, normaliseVisualFields } from '../utils.js';
import { formatPlanningEvidence } from '../evidence.js';

function resolveDepthSettings(ctx) {
  return ctx.modeConfig?.depthSettings || DEPTH_SETTINGS;
}

function resolveSettings(ctx, depth) {
  const ds = resolveDepthSettings(ctx);
  return ds[depth] || ds['standard'] || Object.values(ds)[Math.floor(Object.values(ds).length / 2)];
}

function buildDepthLine(settings) {
  return settings.slides
    ? `Depth: ${settings.label} — aim for ${settings.slides} slides total (${settings.guide}).`
    : `Depth: ${settings.label} — aim for ${settings.concepts} concepts, ${settings.slidesPerConcept} slide(s) per concept (${settings.guide}).`;
}

function buildArcRules(ctx) {
  if (ctx.modeConfig?.narrativeArc === false) {
    return [
      `- Use role "opener" for the introductory concept and role "closer" for the concluding concept`,
      `- Use role "supporting" for all content beats`,
    ];
  }
  return [
    `- The first concept must have role "opener" and contain a Title Card slide`,
    `- The last concept must have role "payoff"`,
    `- Use role "supporting" for factual/evidential beats`,
    `- Use role "transition" only for sharp story pivots (optional, very sparingly)`,
  ];
}

function buildSlideRules(ctx) {
  if (ctx.modeConfig?.allowBullets === true) {
    return [
      `- Bullet points are permitted: up to 5 per slide, each starting with an action verb or a data point`,
      `- Every slide should have a clear purpose and contribute to the section argument`,
    ];
  }
  return [
    `- Every slide presents ONE thing: one image, one chart, one stat, one quote`,
  ];
}

function normaliseConcepts(rawConcepts) {
  return rawConcepts
    .map(concept => ({
      role:   concept.role  || 'supporting',
      title:  concept.title || 'Untitled',
      ...preservePlanFields(concept),
      slides: (concept.slides || []).map(s => ({
        ...normaliseVisualFields(s),
        type:  TYPE_PALETTE[s.type] ? s.type : 'Image Hero',
        title: s.title || 'Untitled',
        ...preservePlanFields(s),
      })),
    }))
    .filter(c => c.slides.length > 0);
}

export async function generateOutline(ctx, brief, depth, assets = [], planningFiles = [], evidence = {}) {
  const types       = Object.keys(TYPE_PALETTE).join(', ');
  const settings    = resolveSettings(ctx, depth);
  const style       = ctx.modeConfig?.outlineStyle || 'visual journalism';
  const assetsInfo  = assets.length       ? `\nAvailable local images: ${assets.join(', ')}. Assign "image" to slides where these fit.`   : '';
  const filesInfo   = planningFiles.length ? `\nOther project files: ${planningFiles.join(', ')}. Reference them for evidence or data.`   : '';
  const evidenceLines = formatPlanningEvidence(evidence);
  const evidenceInfo = evidenceLines.length
    ? `\nPlanning evidence, cited numerically and in order:\n${evidenceLines.join('\n')}`
    : '';

  const arcRules   = buildArcRules(ctx);
  const slideRules = buildSlideRules(ctx);

  const imageQueryRule = ctx.modeConfig?.allowBullets
    ? `- Include an "imageQuery" for image and photo slides where visual context adds value`
    : `- Every slide except Chart and Data Table must include an "imageQuery" search string`;

  const txt = await callLLM(
    ctx,
    `Plan a ${style} presentation for this brief: "${brief}"\n\n` +
    `${buildDepthLine(settings)}${assetsInfo}${filesInfo}${evidenceInfo}\n\n` +
    `Structure rules:\n` +
    `- Each "concept" is a major section (horizontal navigation in the deck)\n` +
    `- Each concept contains 1–5 "slides" that develop that section (vertical navigation)\n` +
    arcRules.join('\n') + '\n' +
    slideRules.join('\n') + '\n' +
    `- Available types: ${types}\n` +
    `- Forbidden types: List, Body Text, Section Divider\n` +
    `${imageQueryRule}\n\n` +
    `- Use the exact visual schema for slides: imageQuery, image, chartConfig, diagram, compareA, compareB, tableHeaders, tableRows, quote, attribution, stat, statLabel, caption\n` +
    `- Do not use aliases such as imageUrl, imageURL, mermaid, flowchart, chart, chartData, chartSpec, or diagramSource\n` +
    `- Each concept must include a short "summary", a numbered "rationale" array, and an "evidenceRefs" array of the numeric citations used from the evidence list above\n` +
    `- Every slide should also include a short "summary", a numbered "rationale" array, and an "evidenceRefs" array where possible\n\n` +
    `Return STRICT JSON only:\n` +
    `{"concepts":[{"role":"opener","title":"concept title (2–5 words)","summary":"one-sentence beat summary","rationale":["1. concise explanation","2. numbered evidence-backed justification"],"evidenceRefs":[1,2],"slides":[{"type":"Title Card","title":"deck title (3–7 words)","summary":"one-sentence slide intent","rationale":["1. concise explanation"],"evidenceRefs":[1],"imageQuery":"atmospheric search term","image":"optional local or remote image path or URL","caption":"optional short caption"}]}]}`
  );

  const parsed      = parseJSON(txt);
  const rawConcepts = Array.isArray(parsed.concepts) ? parsed.concepts
    : Array.isArray(parsed.slides) ? [{ role: 'opener', title: brief, slides: parsed.slides }]
    : [];

  return normaliseConcepts(rawConcepts);
}

export async function reviseOutline(ctx, concepts, instruction, assets = [], planningFiles = [], evidence = {}) {
  const types      = Object.keys(TYPE_PALETTE).join(', ');
  const assetsInfo = assets.length        ? `\nAvailable local images: ${assets.join(', ')}.` : '';
  const filesInfo  = planningFiles.length ? `\nProject files: ${planningFiles.join(', ')}.`   : '';
  const evidenceLines = formatPlanningEvidence(evidence);
  const evidenceInfo = evidenceLines.length
    ? `\nPlanning evidence, cited numerically and in order:\n${evidenceLines.join('\n')}`
    : '';

  const arcNote = ctx.modeConfig?.narrativeArc === false
    ? 'You may add or remove concepts and slides. Ensure an opener concept begins the deck.'
    : 'You may add or remove concepts and slides. Preserve the narrative arc (opener → payoff).';

  const imageQueryNote = ctx.modeConfig?.allowBullets
    ? 'Include imageQuery for image and photo slides where visual context adds value.'
    : 'Every slide except Chart and Data Table must include an "imageQuery".';

  const txt = await callLLM(
    ctx,
    `Revise this presentation concept tree based on the instruction.\n` +
    `Current structure: ${JSON.stringify(concepts)}\n` +
    `Instruction: "${instruction}"${assetsInfo}${filesInfo}${evidenceInfo}\n\n` +
    `Available types: ${types}. Forbidden types: List, Body Text, Section Divider.\n` +
    `${arcNote}\n` +
    `${imageQueryNote}\n` +
    `Preserve existing visual fields where possible, especially imageQuery, image, chartConfig, diagram, compareA, compareB, tableHeaders, and tableRows.\n` +
    `Do not rename visual fields or replace them with aliases.\n` +
    `Each concept should include a short "summary", a numbered "rationale" array, and an "evidenceRefs" array of numeric citations.\n` +
    `Return STRICT JSON only: {"concepts":[{"role":"...","title":"...","slides":[{"type":"...","title":"...","imageQuery":"..."}]}]}`
  );

  const parsed      = parseJSON(txt);
  const rawConcepts = Array.isArray(parsed.concepts) ? parsed.concepts : concepts;
  return normaliseConcepts(rawConcepts);
}
