// Run: node tests/addcollateral.test.mjs
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const src = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const slice = (n) => { const a = src.indexOf('/* ' + n + ':start */'), b = src.indexOf('/* ' + n + ':end */'); assert.ok(a > 0 && b > a, n + ' markers'); return src.slice(a, b); };
const m = new Function('TARGET_HF', slice('addcoll') + slice('scenario') +
  '; return { addCollateralFor, mainCollateral, parseLtvInput, parseHfInput, scenarioAt, scnXFromT, scnTFromX, scnTrackStops, scnColorKey };')(2.2);
const near = (x, y, e = 1e-9) => assert.ok(Math.abs(x - y) <= e, x + ' vs ' + y);

// debt 4000, collateral 10000 (current LTV 40%)
let r = m.addCollateralFor(4000, 10000, 0.5, 100000);
assert.equal(r.status, 'below'); assert.equal(r.extraUsd, 0);
// 30% target: 4000/0.3 - 10000 = 3333.33
r = m.addCollateralFor(4000, 10000, 0.3, 100000);
assert.equal(r.status, 'add'); near(r.extraUsd, 4000 / 0.3 - 10000); near(r.extraAmount, r.extraUsd / 100000); near(r.newCollateralUsd, 4000 / 0.3);
// after adding, LTV equals target exactly
near(4000 / r.newCollateralUsd, 0.3);
// exactly at target and within a half cent
assert.equal(m.addCollateralFor(5000, 10000, 0.5, 1).status, 'below');
assert.equal(m.addCollateralFor(5000.001, 10000, 0.5, 1).status, 'below');
// no debt, bad targets
assert.equal(m.addCollateralFor(0, 10000, 0.5, 1).status, 'nodebt');
for (const t of [0, -0.1, NaN, Infinity, 1.01, undefined]) assert.equal(m.addCollateralFor(100, 200, t, 1).status, 'invalid', String(t));
// target 100% means collateral equals debt
r = m.addCollateralFor(100, 60, 1, 1); near(r.extraUsd, 40);
// no price: USD only
r = m.addCollateralFor(4000, 10000, 0.3, 0); assert.equal(r.extraAmount, null);
// zero collateral
r = m.addCollateralFor(100, 0, 0.5, 50); near(r.extraUsd, 200); near(r.extraAmount, 4);

// main collateral: first enabled, else first
assert.equal(m.mainCollateral([{ symbol: 'A', enabled: false }, { symbol: 'B', enabled: true }]).symbol, 'B');
assert.equal(m.mainCollateral([{ symbol: 'A', enabled: false }]).symbol, 'A');
assert.equal(m.mainCollateral([]), null);

// custom input parsing
const good = [['45', 0.45], [' 45 ', 0.45], ['45%', 0.45], ['45.5', 0.455], ['45,5', 0.455], ['.5', 0.005], ['100', 1], ['7.', 0.07]];
for (const [i, w] of good) near(m.parseLtvInput(i), w);
for (const i of ['', '  ', 'abc', '0', '-5', '101', '1e2', '4 5', null, undefined, '%', '0x10']) assert.equal(m.parseLtvInput(i), null, String(i));


// HF target input
for (const [i, w] of [['2.2', 2.2], [' 3 ', 3], ['1,8', 1.8], ['1.05', 1.05], ['10', 10]]) near(m.parseHfInput(i), w);
for (const i of ['', 'abc', '1', '1.04', '10.1', '0', '-2', '1e1', null]) assert.equal(m.parseHfInput(i), null, String(i));

// ---------------- what-if scenario ----------------
// WBTC 0.1 @ 80000 = 8000 (LT 78%, LTV 73%) and USDC 2000 supplied (LT 80%, LTV 75%); debt 3000 USDC
const main = { symbol: 'WBTC', price: 80000, usd: 8000, lt: 0.78, ltv: 0.73, enabled: true };
const pos = {
  emode: 0,
  account: { totalCollateralUsd: 10000, totalDebtUsd: 3000, liqThreshold: (8000 * 0.78 + 2000 * 0.8) / 10000, ltv: (8000 * 0.73 + 2000 * 0.75) / 10000, availableBorrowsUsd: 10000 * ((8000 * 0.73 + 2000 * 0.75) / 10000) - 3000, hf: 0 }
};
const W = 10000 * pos.account.liqThreshold;   // 7840
// x = 1 reproduces the position exactly: HF = collateral * LT / debt
let s1 = m.scenarioAt(pos, main, 1, 2.2);
near(s1.hf, W / 3000); near(s1.ltv, 0.3); near(s1.collateralUsd, 10000); near(s1.price, 80000);
// price halves: only WBTC changes
let s2 = m.scenarioAt(pos, main, 0.5, 2.2);
near(s2.collateralUsd, 6000); near(s2.ltv, 3000 / 6000);
near(s2.hf, (W - 8000 * 0.78 * 0.5) / 3000);  // 4720 / 3000
near(s2.hf, 4720 / 3000);
near(s2.price, 40000);
// liquidation price: HF = 1 there
const liqX = 1 + (3000 - W) / (8000 * 0.78);
near(s1.liqPrice, 80000 * liqX);
near(m.scenarioAt(pos, main, liqX, 2.2).hf, 1, 1e-9);
near(s1.dropPct, (1 - liqX) * 100);
// distance to liquidation from a scenario price
near(s2.dropPct, (1 - liqX / 0.5) * 100);
// at or below liquidation: distance is 0 and HF at or below 1
let s3 = m.scenarioAt(pos, main, 0.2, 2.2);
assert.ok(s3.hf < 1); assert.equal(s3.dropPct, 0);
// HF 2.2 target actions at x = 0.5 (HF 1.573): add collateral using the main asset's own LT
near(s2.addUsd, (2.2 * 3000 - 4720) / 0.78); near(s2.addCoin, s2.addUsd / 40000);
// adding that much really lands on HF 2.2
near((4720 + s2.addUsd * 0.78) / 3000, 2.2);
// repay: debt falls so that W'/D' = 2.2
near(s2.repayUsd, 3000 - 4720 / 2.2); near(4720 / (3000 - s2.repayUsd), 2.2);
assert.equal(s2.room, 0);
// above target: nothing to add or repay, room to re-borrow back to 2.2
assert.ok(s1.hf > 2.2); assert.equal(s1.addUsd, 0); assert.equal(s1.repayUsd, 0);
near(s1.room, W / 2.2 - 3000);
assert.ok(s1.roomCapped <= s1.room);
near(s1.roomCapped, Math.min(s1.room, pos.account.availableBorrowsUsd));
// re-borrowing that much lands on HF 2.2
near(W / (3000 + s1.room), 2.2);
// cap by Aave max LTV: a tight LTV limit should cap the room
const tight = { ...pos, account: { ...pos.account, ltv: 0.32 } };
let sc = m.scenarioAt(tight, { ...main, ltv: 0.32 }, 1, 2.2);
near(sc.roomCapped, 10000 * 0.32 - 3000); assert.ok(sc.capHit);
// custom target HF changes the actions
near(m.scenarioAt(pos, main, 0.5, 3).addUsd, (3 * 3000 - 4720) / 0.78);
// invalid target falls back to 2.2
near(m.scenarioAt(pos, main, 0.5, undefined).targetHF, 2.2);
// e-mode uses the account level thresholds for the main asset
const em = { ...pos, emode: 1 };
near(m.scenarioAt(em, main, 0.5, 2.2).hf, (W - 8000 * pos.account.liqThreshold * 0.5) / 3000);
// price up: HF and room both rise
const up = m.scenarioAt(pos, main, 1.5, 2.2);
near(up.hf, (W + 8000 * 0.78 * 0.5) / 3000); assert.ok(up.room > s1.room);

// slider mappings round trip, in every mode
for (const mode of ['price', 'hf', 'ltv']) {
  near(m.scnXFromT(mode, 0, pos, main), 0.3, 1e-9);
  near(m.scnXFromT(mode, 1, pos, main), 2, 1e-9);
  for (const tt of [0, 0.1, 0.4118, 0.5, 0.9, 1]) {
    const x = m.scnXFromT(mode, tt, pos, main);
    near(m.scnTFromX(mode, x, pos, main), tt, 1e-9);
  }
  for (const x of [0.3, 0.5, 1, 1.7, 2]) near(m.scnXFromT(mode, m.scnTFromX(mode, x, pos, main), pos, main), x, 1e-9);
}
// price and HF modes are the same line, "now" sits at 41.18% of the track
near(m.scnTFromX('price', 1, pos, main), 0.7 / 1.7);
near(m.scnXFromT('hf', 0.5, pos, main), 1.15);
// LTV mode: LTV falls as the slider moves right, and the readout LTV matches the scenario LTV
{
  let prev = Infinity;
  for (let i = 0; i <= 10; i++) { const x = m.scnXFromT('ltv', i / 10, pos, main); const l = m.scenarioAt(pos, main, x, 2.2).ltv; assert.ok(l < prev); prev = l; }
  const mid = m.scnXFromT('ltv', 0.5, pos, main);
  const l0 = 3000 / (10000 - 8000 * 0.7), l1 = 3000 / (10000 + 8000);
  near(m.scenarioAt(pos, main, mid, 2.2).ltv, (l0 + l1) / 2, 1e-9);
}
// colour bands: green above 1.8, yellow 1.5 to 1.8, orange 1.3 to 1.5, red below 1.3
const cases = [[Infinity, 'green'], [3, 'green'], [1.81, 'green'], [1.8, 'yellow'], [1.6, 'yellow'], [1.5, 'orange'], [1.4, 'orange'], [1.3, 'red'], [1.0, 'red'], [0.5, 'red']];
for (const [hf, k] of cases) assert.equal(m.scnColorKey(hf), k, String(hf));
const stops = m.scnTrackStops('price', pos, main, 100);
assert.equal(stops.length, 101); assert.equal(stops[0], 'red'); assert.equal(stops[100], 'green');
// colours only get safer left to right in price mode
const order = ['red', 'orange', 'yellow', 'green'];
for (let i = 1; i < stops.length; i++) assert.ok(order.indexOf(stops[i]) >= order.indexOf(stops[i - 1]));
console.log('add-collateral and scenario tests passed');
