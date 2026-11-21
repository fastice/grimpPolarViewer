// Two-date difference and swipe (Jakobshavn, Greenland annual): the anomaly minus one chosen date, and the
// swipe line showing a chosen date on the left of the displayed one, hidden while an anomaly is drawn.
import { openViewer, catalogs, check, toMap, zoomTo, text, hidden, shot, sleep, finish } from './lib.mjs';

const { browser, page: p } = await openViewer(catalogs.glAnnual);
await zoomTo(p, await toMap(p, -49.4, 69.15), 50e3);
await p.$eval('#saBlock', e => { e.open = true; e.scrollIntoView(); });
const refs = await p.$$eval('#saRef option', o => o.map(x => [x.value, x.textContent]));
check('Minus offers the mean and every date', refs.length >= 3 && refs[0][0] === '' && /mean of \d+ dates/.test(refs[0][1]), refs.slice(0, 3));

// anomaly minus the first date
await p.click('#saOn');
const anomDone = () => p.waitForFunction(() => /minus/.test(document.getElementById('saNote').textContent) && !/Reading/.test(document.getElementById('saNote').textContent), { timeout: 240000 });
await anomDone();
const first = refs[1];
await p.select('#saRef', first[0]); await sleep(500); await anomDone();
const note = await text(p, 'saNote');
check('anomaly is now minus the first date', note.includes(`minus ${first[1].slice(0, 10)}`), note);
const chk = await p.evaluate(id => { const { saShown: s, saCache: c } = window.grimpViewer.sa(), sel = [...c.values.keys()].find(it => it === window.grimpViewer.sa().saShown && false);
  const items = [...c.values.keys()], ref = items.find(it => it.id === id), cur = items[items.length - 1], v = c.values.get(cur), r = c.values.get(ref);
  let n = 0, bad = 0; for (let j = 0; j < v.length; j += 97) { if (Number.isNaN(v[j] - r[j])) continue; n++; if (Math.abs(s.d[j] - (v[j] - r[j])) > 1e-3) bad++; }
  return { n, bad, L: s.L }; }, first[0]);
check('difference = displayed date minus the chosen date at every sampled pixel', chk.n > 100 && chk.bad === 0, chk);
await shot(p, 'compareDifference');

// swipe: hidden while the anomaly is drawn, shown once it is off
await p.click('#swOn'); await sleep(500);
check('swipe waits while the anomaly replaces the main layer', await hidden(p, 'swipe'));
await p.click('#saOn'); await sleep(1500);
const sw = () => p.evaluate(() => { const c = window.grimpViewer.cmp(); return { item: c.compareItem?.id, at: c.swipeAt, visible: c.compareLayer.getVisible(), src: !!c.compareLayer.getSource() }; });
let s = await sw();
check('swipe shows the chosen date over the left half', s.visible && s.src && s.item === (await p.$eval('#swRef', e => e.value)) && !(await hidden(p, 'swipe')), s);
check('labels give both dates', /to/.test(await text(p, 'swLeft')) && /to/.test(await text(p, 'swRight')), [await text(p, 'swLeft'), await text(p, 'swRight')]);
const h = await p.$eval('#swHandle', e => { const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
const m = await p.$eval('#map', e => { const r = e.getBoundingClientRect(); return [r.x, r.width]; });
await p.mouse.move(h[0], h[1]); await p.mouse.down(); await p.mouse.move(m[0] + 0.3 * m[1], h[1], { steps: 6 }); await p.mouse.up(); await sleep(800);
s = await sw();
check('dragging the handle moves the line', Math.abs(s.at - 0.3) < 0.02, s);
await p.focus('#swHandle'); await p.keyboard.press('ArrowRight'); await sleep(200);
check('arrow keys nudge the line', Math.abs((await sw()).at - 0.32) < 0.005, await sw());
await sleep(1500); await shot(p, 'compareSwipe');
await p.click('#swOn'); await sleep(300);
check('unticking removes the swipe', (await hidden(p, 'swipe')) && !(await sw()).visible);
await finish(browser);
