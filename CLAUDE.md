# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start                    # Run the CLI (generate command by default)
node index.js                # Run directly
node index.js generate       # Build a deck (default)
node index.js plan           # Generate an outline and design plan only
node index.js doctor         # Check environment and credentials
npm test                     # Syntax check all source modules
npm run test:smoke           # Run smoke tests (pure-function + CLI integration)
```

## Architecture

Deckgen is a Node.js CLI that generates reveal.js presentations via an LLM.
Entry point is `index.js` (thin wrapper); all logic lives in `src/`.

### Module layout

```
index.js                  — thin entry; imports src/cli.js and calls run()
src/
  cli.js                  — arg parsing, command routing, context object construction
  ui.js                   — terminal design system: phase headers, status rows, run summary, outline display
  utils.js                — pure utilities: text, JSON parsing, data normalisation, file IO, subprocess
  auth.js                 — Gemini API key management, Copilot device-flow auth, model picker
  llm.js                  — callGemini(), callCopilot(), callLLM() — all take a ctx object
  evidence.js             — web evidence (DuckDuckGo) and workspace evidence gathering
  constants.js            — TYPE_PALETTE, DEPTH_SETTINGS, SYSTEM_PROMPT, FALLBACK_CONCEPTS
  pipeline/
    outline.js            — generateOutline(), reviseOutline()
    content.js            — generateSlideContent()
    design.js             — generateDesignSystem()
    images.js             — resolveSlideImages(), Wikimedia Commons search, image download
    html.js               — buildRevealHTML(), sanitiseGeneratedHtml()
    artefacts.js          — writeGeneratedArtifacts() (chart JSON files)
  commands/
    generate.js           — full guided generate flow with phase headers and run summary
    plan.js               — outline-only planning flow; saves plan.json
    doctor.js             — environment and credential health check
tests/
  smoke.js                — 32 unit + integration smoke tests (no mocking, no network)
```

### RunContext object

All commands receive a `ctx` object created in `src/cli.js`:

```js
{
  provider:     'gemini' | 'copilot',
  brief:        '',             // set by CLI flag or prompt
  depth:        '',             // set by CLI flag or prompt
  variant:      'dark',         // set by CLI flag or prompt
  yes:          false,          // --yes flag
  serve:        null,           // --serve / --no-serve / null (ask)
  geminiApiKey: '',             // populated by auth.js
  copilotToken: '',             // populated by auth.js
  copilotModel: 'gpt-5.4-mini',// populated by auth.js
  startTime:    Date.now(),
  phases:       [],             // { name, start, end, status } — populated during execution
  slideCount:   undefined,      // set after content generation
  conceptCount: undefined,
  args:         {},             // raw parsed args
}
```

### Generate flow (5 phases)

1. **Evidence** — web search (DuckDuckGo) + workspace file scan
2. **Outline** — `generateOutline()` → interactive review loop → `reviseOutline()`
3. **Design** — `generateDesignSystem()` → font pair + colour palette + signature move
4. **Content** — `generateSlideContent()` expands outline into full slide data
5. **Build** — clone/update reveal.js, resolve images, write HTML, optionally serve

### AI providers

| Provider | Model | Auth |
|----------|-------|------|
| Gemini | `gemini-3.1-flash-lite` | `GEMINI_API_KEY` in `.env` — prompted and auto-saved if missing |
| Copilot | `gpt-5.4-mini` (configurable) | `COPILOT_GITHUB_TOKEN` / `GH_TOKEN` / `GITHUB_TOKEN`, or Copilot CLI stored credentials |

Both providers are called through `callLLM(ctx, prompt)` in `src/llm.js`.
The Gemini call enables `googleSearch` grounding so chart slides can retrieve real data.

### Slide types (`TYPE_PALETTE` in `src/constants.js`)

`Title Card`, `Transition`, `Image Hero`, `Caption Card`, `Chart - Bar`, `Chart - Line`,
`Data Table`, `Quote Callout`, `Stat Callout`, `Comparison`

Chart slides produce a `chartConfig` (Chart.js v4, loaded from CDN).
Image slides produce `imageQuery` resolved via Wikimedia Commons.

### Output

Each run creates `output/<slug>_<YYYYMMDD_HHMMSS>/reveal.js/` containing:
- `index.html` — the generated deck
- `assets/images/` — resolved images (copied or downloaded)
- `generated/charts/` — chart config JSON files
- The full reveal.js source (cloned from GitHub on first run, updated on subsequent runs)

### Key invariants

- All LLM prompts request **strict JSON only**; `parseJSON()` strips fences as a safety net.
- `SYSTEM_PROMPT` enforces British English and no emojis — preserve this in all prompt edits.
- `getPlanningFiles()` excludes `node_modules`, `output`, `src`, and hidden files.
- `sanitiseGeneratedHtml()` fixes escaped `</script>` tags that occasionally leak from LLM output.
- Auth state is on `ctx`, not module-level globals.
- Phase tracking: push to `ctx.phases` using `startPhase`/`endPhase` helpers in each command file.
