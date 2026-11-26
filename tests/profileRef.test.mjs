// Profile change from a reference date (Jakobshavn, Greenland annual): with two curves, Plot offers each as
// a reference; the reference plots as zero and every other curve as itself minus the reference interpolated
// to its distances (checked against an independent interpolation); the CSV gains a change column; a share
// link with a date series reopens the same series window and reference.
import { openViewer, catalogs, check, toMap, toPixel, zoomTo, hidden, shot, sleep, finish } from './lib.mjs';
import fs from 'fs';

const { browser, page: p } = await openViewer(catalogs.glAnnual);
const curvesRead = (pg, n) => pg.waitForFunction(n => { const q = window.grimpViewer.pf(); return q.pfCurves.length >= n && q.pfCurves.every(c => c.v); }, { timeout: 180000 }, n);
const A = await toMap(p, -49.95, 69.17), B = await toMap(p, -48.9, 69.10);
await zoomTo(p, [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2], Math.abs(B[0] - A[0]) / 2 + 10e3, Math.abs(B[1] - A[1]) / 2 + 10e3);
await p.$eval('#pfSec', e => { e.open = true; });
await p.click('#pfDraw');
const a = await toPixel(p, A), b = await toPixel(p, B);
await p.mouse.click(a[0], a[1]); await sleep(400); await p.mouse.click(b[0], b[1]);
await curvesRead(p, 1);
check('Plot menu hidden with one curve', await hidden(p, 'pfRefRow'));
await p.evaluate(() => { const t = document.querySelectorAll('#tticks .tick'); t[t.length - 6].click(); });
await curvesRead(p, 2); await sleep(500);
const opts = await p.$$eval('#pfRef option', o => o.map(x => x.textContent));
check('Plot offers values and a change from each curve', !(await hidden(p, 'pfRefRow')) && opts.length === 3 && opts[0] === 'values' && opts.slice(1).every(t => /^change from \d{4}-\d\d-\d\d to /.test(t)), opts);

await p.select('#pfRef', await p.$$eval('#pfRef option', o => o[1].value)); await sleep(500);
const r = await p.evaluate(() => {
  const g = window.grimpViewer.pf(), ref = g.pfCurves.find(c => c.href === g.pfRef), other = g.pfCurves.find(c => c !== ref);
  const z = g.pfChange(ref, ref), ch = g.pfChange(other, ref);
  // independent: linear interpolation by bisection
  const interp = x => { const d = ref.d; if (x < d[0] || x > d[d.length - 1]) return NaN; let lo = 0, hi = d.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (d[m] <= x) lo = m; else hi = m; }
    if (x === d[lo]) return ref.v[lo]; if (x === d[hi]) return ref.v[hi];
    return ref.v[lo] + (x - d[lo]) / (d[hi] - d[lo]) * (ref.v[hi] - ref.v[lo]); };
  let n = 0, bad = 0;
  for (let k = 0; k < other.v.length; k++) { const e = other.v[k] - interp(other.d[k]); if (Number.isNaN(e) !== Number.isNaN(ch[k])) bad++; else if (!Number.isNaN(e)) { n++; if (Math.abs(e - ch[k]) > 1e-6) bad++; } }
  return { zero: [...z].every(v => Number.isNaN(v) || v === 0), n, bad, refYear: new Date(+ref.it.start).getUTCFullYear(), title: document.getElementById('pfRef').value === g.pfRef };
});
check('the reference plots as zero', r.zero, r);
check('other curve = itself minus the interpolated reference', r.n > 50 && r.bad === 0, r);
await shot(p, 'profileRef');

const out = new URL('./out/', import.meta.url).pathname;
for (const f of fs.readdirSync(out)) if (f.endsWith('_profile.csv')) fs.unlinkSync(out + f);
const cdp = await p.createCDPSession(); await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: out });
await p.$eval('#pfCsv', e => e.click());
let csv = null; for (let i = 0; i < 40 && !csv; i++) { await sleep(250); const f = fs.readdirSync(out).find(f => f.endsWith('_profile.csv')); if (f) csv = fs.readFileSync(out + f, 'utf8'); }
check('profile CSV has a change column', /,value,change_from_\d{4}-\d\d-\d\d$/.test(csv?.split('\n')[0] || ''), csv?.split('\n')[0]);

// a date series plus the reference, shared and reopened
await p.$eval('#pfSerRow', e => e.scrollIntoView());
await p.click('#pfSerOn'); await sleep(500);
await p.waitForFunction(() => { const q = window.grimpViewer.pf(), s = q.pfSer; return s && q.pfCurves.every(c => c.v) && s.cands.slice(s.i0, s.i1 + 1).every(w => q.pfCurves.some(c => c.href === w.it.assets[q.pfKey].href)); }, { timeout: 180000 });
await p.click('#pfSerEarlier'); await sleep(300);
const st = await p.evaluate(() => { const q = window.grimpViewer.pf(), s = q.pfSer; return { k: [s.cands[s.i0].k, s.cands[s.i1].k], dt: s.dt, ref: q.pfCurves.find(c => c.href === q.pfRef)?.it.id }; });
await p.$eval('#share', e => e.click()); await sleep(300);
const link = await p.evaluate(() => location.href), lq = new URL(link).searchParams;
check('share link carries the series window and the reference', lq.get('pser') === `${st.dt},${st.k[0]},${st.k[1]}` && lq.get('pref') === st.ref, { pser: lq.get('pser'), pref: lq.get('pref'), st });
const q = await browser.newPage();
q.on('pageerror', e => check('no page errors (shared link)', false, e.message));
await q.setViewport({ width: 1400, height: 900 });
await q.goto(link, { waitUntil: 'networkidle2', timeout: 120000 });
await q.waitForFunction(() => { const g = window.grimpViewer?.pf(); return g?.pfSer && g.pfRef && g.pfCurves.every(c => c.v); }, { timeout: 240000 });
const st2 = await q.evaluate(() => { const g = window.grimpViewer.pf(), s = g.pfSer; return { k: [s.cands[s.i0].k, s.cands[s.i1].k], dt: s.dt, ref: g.pfCurves.find(c => c.href === g.pfRef)?.it.id, on: document.getElementById('pfSerOn').checked }; });
check('the shared link reopens the same series window and reference', st2.on && st2.dt === st.dt && st2.k.join() === st.k.join() && st2.ref === st.ref, { st, st2 });
await finish(browser);
