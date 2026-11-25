const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const svg = fs.readFileSync('out/front-live-sheet.svg', 'utf8');
  const m = /viewBox="([\d.\s-]+)"/.exec(svg); const vb = m ? m[1].trim().split(/\s+/).map(Number) : [0, 0, 594, 420];
  const W = 1600, H = Math.round(W * vb[3] / vb[2]);
  const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
  await pg.setContent(`<!doctype html><html><body style="margin:0;background:#fff"><div style="width:${W}px;height:${H}px">${svg.replace(/<\?xml[^>]*>/, '').replace(/<svg /, `<svg width="${W}" height="${H}" `)}</div></body></html>`);
  await pg.screenshot({ path: 'out/front-live-sheet.png', fullPage: true }); await b.close(); console.log('png', W + 'x' + H, '@2x');
})();
