function escHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function hexToRgb(hex) {
  const m = String(hex).match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  return m ? `${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)}` : '200,200,200';
}

function applyChartTheme(cfg, fg) {
  if (!cfg || typeof cfg !== 'object') return cfg;
  const c = JSON.parse(JSON.stringify(cfg));
  const tickClr = `rgba(${hexToRgb(fg)},0.7)`;
  const gridClr = `rgba(${hexToRgb(fg)},0.1)`;
  c.options = c.options || {};
  c.options.responsive = true;
  c.options.maintainAspectRatio = false;
  c.options.plugins = c.options.plugins || {};
  c.options.plugins.legend = c.options.plugins.legend || {};
  c.options.plugins.legend.labels = { ...(c.options.plugins.legend.labels || {}), color: fg };
  if (c.options.scales) {
    ['x', 'y'].forEach(axis => {
      if (!c.options.scales[axis]) return;
      c.options.scales[axis].ticks = { ...(c.options.scales[axis].ticks || {}), color: tickClr };
      c.options.scales[axis].grid  = { ...(c.options.scales[axis].grid  || {}), color: gridClr };
    });
  }
  return c;
}

export function buildRevealHTML(concepts, variant, brief, design = {}, modeConfig = {}) {
  const isHex = v => /^#[0-9a-f]{6}$/i.test(String(v || ''));
  const safe  = (val, fallback) => isHex(val) ? String(val) : fallback;

  const isLight  = variant === 'light';
  const themeMap = { dark: 'black', light: 'white', alt: 'moon' };
  const theme    = themeMap[variant] || 'black';

  const bg     = safe(design.backgroundColor,    isLight ? '#f5f2ec' : '#0e0e0c');
  const fg     = safe(design.textColor,           isLight ? '#1a1816' : '#f0ede7');
  const accent = safe(design.accentColor,         isLight ? '#7a3f14' : '#c8a853');
  const divBg  = safe(design.sectionDividerColor, isLight ? '#1a1816' : '#1c1b18');

  const displayFont = String(design.displayFont || 'Playfair Display').trim().replace(/['"]/g, '');
  const bodyFont    = String(design.bodyFont    || 'Source Serif 4').trim().replace(/['"]/g, '');
  const dfEnc = displayFont.replace(/ /g, '+');
  const bfEnc = bodyFont.replace(/ /g, '+');
  const fontsHref = `https://fonts.googleapis.com/css2?family=${dfEnc}:wght@400;700&family=${bfEnc}:ital,wght@0,400;0,600;1,400&display=swap`;

  const chartInits   = [];
  const diagramInits = [];
  let   globalSlideIdx = 0;

  function renderSlide(s, ci) {
    const idx    = globalSlideIdx++;
    const aaBase = modeConfig.autoAnimate !== false ? 'data-auto-animate' : '';

    if (s.type === 'Title Card') {
      const bgAttr = s.image
        ? ` data-background-image="${escHtml(s.image)}" data-background-size="cover" data-background-opacity="0.18"`
        : '';
      return [
        `    <section class="dk-title" ${aaBase}${bgAttr}>`,
        `      <span class="dk-eyebrow">Presentation</span>`,
        `      <h1>${escHtml(s.title)}</h1>`,
        `      <div class="dk-rule dk-rule--center"></div>`,
        s.tagline ? `      <p class="dk-sub">${escHtml(s.tagline)}</p>` : '',
        `    </section>`,
      ].filter(l => l.trim()).join('\n');
    }

    if (s.type === 'Transition') {
      return [
        `    <section class="dk-transition" data-background-color="${escHtml(divBg)}" ${aaBase}>`,
        `      <h2 class="dk-transition-h">${escHtml(s.title)}</h2>`,
        `      <div class="dk-rule dk-rule--center"></div>`,
        `    </section>`,
      ].join('\n');
    }

    if (s.type === 'Image Hero') {
      const bgAttr = s.image
        ? `data-background-image="${escHtml(s.image)}" data-background-size="cover" data-background-position="center" data-background-opacity="0.95"`
        : '';
      return [
        `    <section class="dk-image-hero" ${aaBase} ${bgAttr}>`,
        `      <div class="dk-hero-overlay">`,
        `        <h2>${escHtml(s.title)}</h2>`,
        s.caption ? `        <p class="dk-hero-cap">${escHtml(s.caption)}</p>` : '',
        (s.imageCaption || s.imageCredit)
          ? `        <p class="dk-cap">${[s.imageCaption, s.imageCredit].filter(Boolean).map(escHtml).join(' · ')}</p>`
          : '',
        `      </div>`,
        `    </section>`,
      ].filter(l => l.trim()).join('\n');
    }

    if (s.type === 'Caption Card') {
      const capLine = [s.imageCaption, s.imageCredit].filter(Boolean).map(escHtml).join(' · ');
      return [
        `    <section class="dk-caption-card" ${aaBase}>`,
        `      <h2>${escHtml(s.title)}</h2>`,
        s.image ? [
          `      <figure class="dk-fig">`,
          `        <img src="${escHtml(s.image)}" alt="${escHtml(s.title)}" class="dk-img">`,
          capLine ? `        <p class="dk-cap">${capLine}</p>` : '',
          `      </figure>`,
        ].filter(l => l.trim()).join('\n') : '',
        s.caption ? `      <p class="dk-caption-text">${escHtml(s.caption)}</p>` : '',
        `    </section>`,
      ].filter(l => l.trim()).join('\n');
    }

    if (s.chartConfig) {
      chartInits.push({ idx, src: s.chartConfigPath || '', config: s.chartConfig ? applyChartTheme(s.chartConfig, fg) : null });
      return [
        `    <section ${aaBase}>`,
        `      <h2>${escHtml(s.title)}</h2>`,
        `      <div class="dk-chart"><canvas id="chart-${idx}"${s.chartConfigPath ? ` data-chart-src="${escHtml(s.chartConfigPath)}"` : ''}></canvas></div>`,
        `    </section>`,
      ].join('\n');
    }

    if (s.diagram) {
      diagramInits.push({ idx, source: s.diagram });
      return [
        `    <section ${aaBase}>`,
        `      <h2>${escHtml(s.title)}</h2>`,
        `      <div class="dk-diagram" id="diagram-${idx}" data-diagram="${escHtml(s.diagram)}"></div>`,
        s.caption ? `      <p class="dk-diagram-caption">${escHtml(s.caption)}</p>` : '',
        `    </section>`,
      ].filter(l => l.trim()).join('\n');
    }

    if (s.type === 'Data Table') {
      const headers = Array.isArray(s.tableHeaders) ? s.tableHeaders : [];
      const rows    = Array.isArray(s.tableRows)    ? s.tableRows    : [];
      const thead   = headers.length
        ? `<thead><tr>${headers.map(h => `<th>${escHtml(h)}</th>`).join('')}</tr></thead>` : '';
      const tbody   = rows.length
        ? `<tbody>${rows.map(row =>
            `<tr>${(Array.isArray(row) ? row : []).map(cell => `<td>${escHtml(String(cell))}</td>`).join('')}</tr>`
          ).join('')}</tbody>` : '';
      return [
        `    <section ${aaBase}>`,
        `      <h2>${escHtml(s.title)}</h2>`,
        `      <div class="dk-table-wrap"><table class="dk-table">${thead}${tbody}</table></div>`,
        `    </section>`,
      ].join('\n');
    }

    if (s.type === 'Quote Callout') {
      const bgAttr = s.image
        ? ` data-background-image="${escHtml(s.image)}" data-background-size="cover" data-background-opacity="0.1"` : '';
      return [
        `    <section class="dk-quote" ${aaBase}${bgAttr}>`,
        `      <blockquote>`,
        `        <p class="dk-quote-text">&ldquo;${escHtml(s.quote || s.title)}&rdquo;</p>`,
        s.attribution ? `        <cite>${escHtml(s.attribution)}</cite>` : '',
        `      </blockquote>`,
        `    </section>`,
      ].filter(l => l.trim()).join('\n');
    }

    if (s.type === 'Stat Callout') {
      const bgAttr = s.image
        ? ` data-background-image="${escHtml(s.image)}" data-background-size="cover" data-background-opacity="0.1"` : '';
      return [
        `    <section class="dk-stat-card" ${aaBase}${bgAttr}>`,
        `      <div class="dk-stat-number" data-id="stat-${ci}">${escHtml(String(s.stat || '?'))}</div>`,
        s.statLabel ? `      <p class="dk-stat-label">${escHtml(s.statLabel)}</p>` : '',
        `      <p class="dk-stat-title">${escHtml(s.title)}</p>`,
        `    </section>`,
      ].filter(l => l.trim()).join('\n');
    }

    if (s.type === 'Comparison') {
      const sideA = s.compareA || {};
      const sideB = s.compareB || {};
      const renderSide = side => [
        `          <div class="dk-compare-cell">`,
        side.image ? `            <img src="${escHtml(side.image)}" alt="${escHtml(side.label || '')}" class="dk-img">` : '',
        `            <p class="dk-compare-label">${escHtml(side.label || '')}</p>`,
        side.value ? `            <p class="dk-compare-val">${escHtml(side.value)}</p>` : '',
        `          </div>`,
      ].filter(l => l.trim()).join('\n');
      return [
        `    <section class="dk-comparison" ${aaBase}>`,
        `      <h2>${escHtml(s.title)}</h2>`,
        `      <div class="dk-compare-grid">`,
        renderSide(sideA),
        renderSide(sideB),
        `      </div>`,
        `    </section>`,
      ].join('\n');
    }

    return [
      `    <section ${aaBase}>`,
      `      <h2>${escHtml(s.title)}</h2>`,
      s.image ? `      <figure class="dk-fig"><img src="${escHtml(s.image)}" alt="${escHtml(s.title)}" class="dk-img"></figure>` : '',
      `    </section>`,
    ].filter(l => l.trim()).join('\n');
  }

  const conceptSections = concepts.map((concept, ci) => {
    const slides = concept.slides || [];
    if (slides.length === 0) return '';
    const rendered = slides.map(slide => renderSlide(slide, ci));
    if (slides.length === 1) return rendered[0].replace(/^    /gm, '  ');
    return `  <section>\n${rendered.join('\n\n')}\n  </section>`;
  }).filter(Boolean);

  const chartScript = chartInits.length ? `
(function () {
  var defs = ${JSON.stringify(chartInits)};
  var done = new Set();
  async function loadConfig(item) {
    if (item.config) return item.config;
    if (!item.src) return null;
    var response = await fetch(item.src);
    if (!response.ok) throw new Error('Failed to load chart config: ' + item.src);
    return response.json();
  }
  async function tryInit(slideEl) {
    for (var i = 0; i < defs.length; i += 1) {
      var d = defs[i];
      var idx = d.idx;
      if (done.has(idx)) continue;
      var el = document.getElementById('chart-' + idx);
      if (!el || (slideEl && !slideEl.contains(el))) continue;
      try {
        var cfg = await loadConfig(d);
        if (!cfg) continue;
        new Chart(el, cfg);
        done.add(idx);
      } catch (err) {
        console.warn(err);
      }
    }
  }
  Reveal.on('ready',        function (e) { tryInit(e.currentSlide); });
  Reveal.on('slidechanged', function (e) { tryInit(e.currentSlide); });
}());` : '';

  const diagramScript = diagramInits.length ? `
(function () {
  var defs = ${JSON.stringify(diagramInits)};
  var done = new Set();
  function renderOne(slideEl) {
    if (!window.mermaid || !mermaid.render) return;
    defs.forEach(function (d) {
      if (done.has(d.idx)) return;
      var el = document.getElementById('diagram-' + d.idx);
      if (!el || (slideEl && !slideEl.contains(el))) return;
      var source = el.getAttribute('data-diagram');
      if (!source) return;
      var renderId = 'diagram-render-' + d.idx;
      mermaid.render(renderId, source).then(function (result) {
        el.innerHTML = result.svg;
        if (result.bindFunctions) result.bindFunctions(el);
        done.add(d.idx);
      }).catch(function (err) {
        console.warn(err);
      });
    });
  }
  Reveal.on('ready',        function (e) { renderOne(e.currentSlide); });
  Reveal.on('slidechanged', function (e) { renderOne(e.currentSlide); });
}());` : '';

  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8">
<title>${escHtml(brief)}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${fontsHref}">
<link rel="stylesheet" href="./dist/reveal.css">
<link rel="stylesheet" href="./dist/theme/${theme}.css" id="theme">
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"></script>
<style>
:root {
  --r-background-color:          ${bg};
  --r-main-color:                ${fg};
  --r-heading-color:             ${fg};
  --r-main-font:                 '${bodyFont}', Georgia, 'Times New Roman', serif;
  --r-heading-font:              '${displayFont}', Georgia, 'Times New Roman', serif;
  --r-main-font-size:            32px;
  --r-heading-letter-spacing:    -0.025em;
  --r-heading-line-height:       1.1;
  --r-heading-text-transform:    none;
  --r-heading-font-weight:       700;
  --dk-accent:                   ${accent};
  --dk-fg:                       ${fg};
  --dk-bg:                       ${bg};
  --dk-divbg:                    ${divBg};
}

/* === Base === */
.reveal .slides section {
  text-align: left;
  padding: 2.2rem 3.8rem;
  box-sizing: border-box;
}
.reveal h1 { font-size: 2.6em; max-width: 20ch; margin-bottom: 0.2em; line-height: 1.05; }
.reveal h2 { font-size: 1.55em; max-width: 26ch; margin-bottom: 0.5em; }
.reveal p  { margin: 0.35em 0; line-height: 1.55; }

.dk-eyebrow {
  display: block;
  font-family: '${bodyFont}', serif;
  font-size: 0.42em;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  opacity: 0.35;
  margin-bottom: 0.9rem;
}
.dk-sub {
  font-size: 0.92em !important;
  font-style: italic;
  opacity: 0.58 !important;
  margin-top: 0.7rem !important;
  line-height: 1.5;
  max-width: 36ch;
}
.dk-rule {
  width: 2rem;
  height: 3px;
  background: var(--dk-accent);
  border-radius: 2px;
  margin: 0.75rem 0;
}
.dk-rule--center { margin-left: auto; margin-right: auto; }

/* === Title Card === */
.dk-title { text-align: center !important; }

/* === Transition beat === */
.dk-transition { text-align: center !important; }
.dk-transition-h {
  font-size: 2.2em !important;
  max-width: 16ch;
  color: ${fg} !important;
  margin: 0 auto 0.35em !important;
}

/* === Image Hero — full-bleed background image === */
.dk-image-hero {
  padding: 0 !important;
  height: 100% !important;
  position: relative;
  text-align: left;
}
.dk-hero-overlay {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 2.8rem 3.8rem;
  background: linear-gradient(to top,
    rgba(0,0,0,0.88) 0%,
    rgba(0,0,0,0.35) 55%,
    transparent 100%
  );
}
.dk-image-hero h2 {
  color: #fff !important;
  text-shadow: 0 2px 14px rgba(0,0,0,0.55);
  margin-bottom: 0.2em;
}
.dk-hero-cap {
  font-size: 0.82em !important;
  color: rgba(255,255,255,0.68) !important;
  font-style: italic;
  margin: 0 !important;
}

/* === Caption Card === */
.dk-caption-card .dk-fig  { margin: 0.5rem 0; }
.dk-caption-card .dk-img  {
  max-height: 58vh;
  width: auto;
  max-width: 100%;
  border-radius: 4px;
  box-shadow: 0 12px 40px rgba(0,0,0,0.28);
}
.dk-caption-text {
  font-size: 0.85em !important;
  line-height: 1.55;
  opacity: 0.75;
  max-width: 58ch;
  margin-top: 0.3rem !important;
}

/* === Quote Callout === */
.dk-quote blockquote { margin: 0; padding: 0; border: none; background: none; }
.dk-quote-text {
  font-size: 1.42em !important;
  font-style: italic;
  line-height: 1.45;
  max-width: 26ch;
  color: ${fg} !important;
  opacity: 1 !important;
  margin: 0 0 0.75rem !important;
}
.dk-quote cite {
  display: block;
  font-size: 0.58em;
  font-style: normal;
  opacity: 0.5;
  letter-spacing: 0.07em;
  text-transform: uppercase;
}

/* === Stat Callout === */
.dk-stat-number {
  font-family: '${displayFont}', serif;
  font-size: 5.2em;
  font-weight: 700;
  line-height: 1;
  letter-spacing: -0.03em;
  color: var(--dk-accent);
}
.dk-stat-label {
  font-size: 0.98em !important;
  opacity: 0.65;
  max-width: 34ch;
  margin: 0.25rem 0 0 !important;
}
.dk-stat-title {
  font-size: 0.62em !important;
  opacity: 0.35 !important;
  margin-top: 0.9rem !important;
  font-style: italic;
}

/* === Comparison === */
.dk-compare-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2.5rem;
  margin-top: 0.5rem;
}
.dk-compare-cell { display: flex; flex-direction: column; gap: 0.45rem; }
.dk-compare-cell .dk-img {
  max-height: 36vh;
  width: 100%;
  object-fit: cover;
  border-radius: 3px;
  box-shadow: 0 6px 24px rgba(0,0,0,0.22);
}
.dk-compare-label {
  font-size: 0.8em !important;
  font-weight: 700;
  color: var(--dk-accent);
  text-transform: uppercase;
  letter-spacing: 0.09em;
  margin: 0 !important;
}
.dk-compare-val {
  font-size: 0.78em !important;
  opacity: 0.65;
  margin: 0 !important;
}

/* === Data Table === */
.dk-table-wrap { overflow-x: auto; margin-top: 0.4rem; }
.dk-table { width: 100%; border-collapse: collapse; font-size: 0.66em; font-family: '${bodyFont}', serif; }
.dk-table th {
  text-align: left;
  padding: 0.4rem 0.8rem;
  border-bottom: 2px solid var(--dk-accent);
  font-family: '${displayFont}', serif;
  font-weight: 700;
  font-size: 0.78em;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  white-space: nowrap;
}
.dk-table td {
  padding: 0.38rem 0.8rem;
  border-bottom: 1px solid rgba(128,128,128,0.11);
  line-height: 1.4;
}
.dk-table tr:last-child td { border-bottom: none; }

/* === Shared === */
.dk-fig { margin: 0; }
.dk-img { display: block; max-width: 100%; object-fit: contain; border-radius: 3px; }
.dk-cap {
  display: block;
  margin-top: 0.32rem;
  font-size: 0.37em;
  opacity: 0.4;
  font-style: italic;
}
.dk-chart { position: relative; width: 100%; height: 54vh; }
.dk-chart canvas { position: absolute; inset: 0; width: 100% !important; height: 100% !important; }
.dk-diagram {
  min-height: 54vh;
  display: flex;
  align-items: center;
  justify-content: center;
}
.dk-diagram svg { max-width: 100%; max-height: 54vh; }
.dk-diagram-caption {
  margin-top: 0.45rem !important;
  font-size: 0.62em !important;
  opacity: 0.6;
}
</style>
</head>
<body>
<div class="reveal">
  <div class="slides">

${conceptSections.join('\n\n')}

  </div>
</div>
<script src="./dist/reveal.js"></script>
<script>
Reveal.initialize(${JSON.stringify(Object.assign({
  hash:                true,
  slideNumber:         'c/t',
  transition:          'fade',
  transitionSpeed:     'slow',
  controls:            true,
  progress:            true,
  center:              true,
  autoAnimateDuration: 0.7,
  autoAnimateEasing:   'ease-out',
}, modeConfig.revealConfig || {}), null, 2)});
if (window.mermaid) {
  mermaid.initialize({ startOnLoad: false, theme: 'base', securityLevel: 'loose' });
}
${chartScript}
${diagramScript}
</script>
</body>
</html>`;
}

export function sanitiseGeneratedHtml(html) {
  let cleaned = String(html || '');
  cleaned = cleaned.replace(/<\\\/script>/gi, '</script>');
  cleaned = cleaned.replace(/https?:\/\/(www\.)?slid\.es[^\s"'>]*/g, '');
  cleaned = cleaned.replace(/<meta[^>]*slid\.es[^>]*>/gi, '');
  if (!/^\s*<!doctype html>/i.test(cleaned)) cleaned = `<!doctype html>\n${cleaned}`;
  return cleaned;
}
