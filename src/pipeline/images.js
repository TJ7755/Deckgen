import fs from 'fs/promises';
import path from 'path';
import { allSlides } from '../constants.js';
import { pathExists, downloadBinary, normaliseFileName } from '../utils.js';

async function searchWikimediaCommonsImage(query) {
  const trimmedQuery = String(query || '').trim();
  if (!trimmedQuery) return null;

  // SVG excluded: reveal.js data-background-image doesn't render SVGs reliably
  const PHOTO_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp']);
  const isRenderableImage = (url, metadata = {}) => {
    const mime = String(metadata.MimeType?.value || metadata.mimeType || '').toLowerCase();
    if (mime === 'image/svg+xml' || mime === 'image/tiff') return false;
    if (mime.startsWith('image/')) return true;
    try {
      const ext = path.extname(new URL(url).pathname).toLowerCase();
      return PHOTO_EXTS.has(ext);
    } catch { return false; }
  };

  const apiUrl = new URL('https://commons.wikimedia.org/w/api.php');
  apiUrl.searchParams.set('action', 'query');
  apiUrl.searchParams.set('generator', 'search');
  apiUrl.searchParams.set('gsrsearch', trimmedQuery);
  apiUrl.searchParams.set('gsrnamespace', '6');
  apiUrl.searchParams.set('gsrlimit', '10');
  apiUrl.searchParams.set('prop', 'imageinfo');
  apiUrl.searchParams.set('iiprop', 'url|extmetadata');
  apiUrl.searchParams.set('format', 'json');
  apiUrl.searchParams.set('origin', '*');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(apiUrl, { signal: controller.signal });
    if (!res.ok) return null;

    const data = await res.json();
    const pages = Object.values(data?.query?.pages || {});
    const firstPage = pages.find(page => {
      const imageInfo = page?.imageinfo?.[0];
      return imageInfo?.url && isRenderableImage(imageInfo.url, imageInfo.extmetadata || {});
    });
    if (!firstPage) return null;

    const imageInfo = firstPage.imageinfo[0];
    const metadata  = imageInfo.extmetadata || {};
    const title     = firstPage.title || '';

    return {
      url:     imageInfo.url,
      title,
      pageUrl: title ? `https://commons.wikimedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}` : 'https://commons.wikimedia.org/',
      caption: metadata.ImageDescription?.value || metadata.ObjectName?.value || trimmedQuery,
      credit:  [metadata.Artist?.value, metadata.Credit?.value, metadata.LicenseShortName?.value].filter(Boolean).join(' · '),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function resolveOneImage(query, localOrUrl, assetsDir) {
  let resolvedPath = '';
  let caption = '';
  let credit  = '';

  const src = String(localOrUrl || '').trim();

  if (src) {
    if (/^https?:\/\//i.test(src)) {
      const remoteUrl  = new URL(src);
      const remoteName = normaliseFileName(path.basename(remoteUrl.pathname), 'web-image');
      const ext        = path.extname(remoteUrl.pathname) || '.jpg';
      const fileName   = `${remoteName}${ext}`;
      await downloadBinary(src, path.join(assetsDir, fileName));
      resolvedPath = path.posix.join('assets', 'images', fileName);
    } else {
      const sourcePath = path.join(process.cwd(), src);
      const fileName   = path.basename(src);
      if (await pathExists(sourcePath)) {
        await fs.copyFile(sourcePath, path.join(assetsDir, fileName));
        resolvedPath = path.posix.join('assets', 'images', fileName);
      }
    }
  }

  if (!resolvedPath && query) {
    // Try the full query, then a simplified 3-word fallback if it yields nothing
    const simplified = query.split(/\s+/).slice(0, 3).join(' ');
    const queries = [query, ...(simplified !== query && simplified.length > 3 ? [simplified] : [])];
    for (const q of queries) {
      const result = await searchWikimediaCommonsImage(q);
      if (result?.url) {
        const parsedUrl  = new URL(result.url);
        const extension  = path.extname(parsedUrl.pathname) || '.jpg';
        const fileName   = `${normaliseFileName(query, 'web-image')}${extension}`;
        await downloadBinary(result.url, path.join(assetsDir, fileName));
        resolvedPath = path.posix.join('assets', 'images', fileName);
        caption      = result.caption;
        credit       = result.credit || result.pageUrl;
        break;
      }
    }
  }

  return { resolvedPath, caption, credit };
}

export async function resolveSlideImages(concepts, deckDir) {
  const assetsDir = path.join(deckDir, 'assets', 'images');
  await fs.mkdir(assetsDir, { recursive: true });

  for (const slide of allSlides(concepts)) {
    if (slide.type === 'Comparison') {
      for (const side of [slide.compareA, slide.compareB].filter(Boolean)) {
        if (side.image || side.imageQuery) {
          const { resolvedPath, caption } = await resolveOneImage(side.imageQuery, side.image, assetsDir).catch(() => ({}));
          if (resolvedPath) { side.image = resolvedPath; if (caption) side.caption = side.caption || caption; }
        }
      }
      continue;
    }

    const query = String(slide.imageQuery || '').trim();
    const src   = String(slide.image     || '').trim();
    if (!query && !src) continue;

    const { resolvedPath, caption, credit } = await resolveOneImage(query, src, assetsDir).catch(err => {
      process.stderr.write(`  Warning: image resolution failed for "${query || src}": ${err.message}\n`);
      return {};
    });
    if (resolvedPath) {
      slide.image = resolvedPath;
      if (caption && !slide.imageCaption) slide.imageCaption = caption;
      if (credit  && !slide.imageCredit)  slide.imageCredit  = credit;
    }
  }
}
