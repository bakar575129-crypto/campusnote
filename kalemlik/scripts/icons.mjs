// PWA PNG ikonlarını SVG'den üretir (geliştirme aracı; Playwright/Chromium gerekir).
import {chromium} from 'playwright';
import fs from 'node:fs/promises';
const browser = await chromium.launch();
const page = await browser.newPage();
for (const [src, out, size] of [['icon.svg', 'icon-192.png', 192], ['icon.svg', 'icon-512.png', 512], ['maskable.svg', 'maskable-512.png', 512], ['maskable.svg', 'apple-touch-icon.png', 180]]) {
  const svg = await fs.readFile(`public/icons/${src}`, 'utf8');
  await page.setViewportSize({width: size, height: size});
  await page.setContent(`<body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body>`);
  await page.screenshot({path: `public/icons/${out}`, omitBackground: true, clip: {x: 0, y: 0, width: size, height: size}});
}
await browser.close();
console.log('İkonlar üretildi.');
