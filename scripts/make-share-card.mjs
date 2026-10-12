// Renders the preview card for the shared Loved list (public/share-card.jpg, 1200×630), the image
// Messages and WhatsApp show under the link. Usage: CHROMIUM_PATH=/path/to/chrome node scripts/make-share-card.mjs
import { chromium } from 'playwright';

const bottle = (h, tint) => `
  <svg viewBox="0 0 40 140" style="height:${h}px">
    <path d="M16 2h8v36c0 7 11 12 11 25v70a5 5 0 0 1-5 5H10a5 5 0 0 1-5-5V63c0-13 11-18 11-25z" fill="${tint}" stroke="rgba(80,40,30,0.18)" stroke-width="0.6"/>
    <rect x="5.4" y="84" width="29.2" height="26" fill="#f6efe6"/>
  </svg>`;

const html = `<!doctype html><html><head>
<link href="https://fonts.googleapis.com/css2?family=Bodoni+Moda:ital,opsz,wght@0,6..96,400..600;1,6..96,400..600&family=Hanken+Grotesk:wght@500;600&display=swap" rel="stylesheet">
<style>
  html,body{margin:0}
  .card{width:1200px;height:630px;box-sizing:border-box;padding:72px 84px;display:flex;justify-content:space-between;align-items:center;
    background:radial-gradient(70% 90% at 78% 30%, rgba(122,31,53,0.10), transparent 70%), radial-gradient(85% 65% at 50% 25%, #fffaf2, #ede3d6);
    font-family:'Hanken Grotesk',sans-serif;color:#231f1d}
  .text{display:grid;gap:26px;max-width:640px}
  .mark{font-family:'Bodoni Moda',serif;font-style:italic;font-weight:500;font-size:44px;display:flex;align-items:baseline;gap:8px}
  .dot{width:11px;height:11px;border-radius:50%;background:#7a1f35;display:inline-block}
  h1{margin:0;font-family:'Bodoni Moda',serif;font-weight:400;font-size:92px;line-height:1.02;letter-spacing:-0.01em}
  h1 em{color:#7a1f35}
  p{margin:0;font-size:30px;font-weight:500;color:#5d5650}
  .bottles{display:flex;align-items:flex-end;gap:18px;padding-bottom:20px;filter:drop-shadow(0 24px 22px rgba(70,35,20,0.22))}
</style></head><body>
<div class="card">
  <div class="text">
    <div class="mark">Palate<span class="dot"></span></div>
    <h1>Rusty’s<br><em>loved</em> wines</h1>
    <p>The bottles I’d happily buy again.</p>
  </div>
  <div class="bottles">${bottle(330, '#5b1a2b')}${bottle(390, '#7a1f35')}${bottle(340, '#c9b48a')}</div>
</div></body></html>`;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: new URL('../public/share-card.jpg', import.meta.url).pathname, type: 'jpeg', quality: 88 });
await browser.close();
