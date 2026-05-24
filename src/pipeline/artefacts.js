import fs from 'fs/promises';
import path from 'path';
import { allSlides } from '../constants.js';

export async function writeGeneratedArtifacts(concepts, deckDir) {
  const chartsDir   = path.join(deckDir, 'generated', 'charts');
  const diagramsDir = path.join(deckDir, 'generated', 'diagrams');
  await fs.mkdir(chartsDir,   { recursive: true });
  await fs.mkdir(diagramsDir, { recursive: true });

  let slideIndex = 0;
  for (const slide of allSlides(concepts)) {
    slideIndex += 1;
    if (!slide.chartConfig) continue;

    const fileName = `chart-${String(slideIndex).padStart(2, '0')}.json`;
    const filePath = path.join(chartsDir, fileName);
    await fs.writeFile(filePath, `${JSON.stringify(slide.chartConfig, null, 2)}\n`, 'utf-8');
    slide.chartConfigPath = path.posix.join('generated', 'charts', fileName);
  }
}
