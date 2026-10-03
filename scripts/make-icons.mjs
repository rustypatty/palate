// Renders public/icon.svg to the square PNGs iOS and Android need (the OS rounds the corners).
// Usage: CHROMIUM_PATH=/path/to/chrome node scripts/make-icons.mjs
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const svg = readFileSync(new URL('../public/icon.svg', import.meta.url), 'utf8');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage();
for (const [size, name] of [
  [180, "icon-180.png"],
  [192, "icon-192.png"],
  [512, "icon-512.png"],
]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<style>html,body{margin:0;background:transparent}</style>${svg.replace('rx="112"', 'rx="0"').replace('<svg ', `<svg width="${size}" height="${size}" `)}`);
  await page.screenshot({ path: new URL(`../public/${name}`, import.meta.url).pathname, omitBackground: false });
}
await browser.close();
