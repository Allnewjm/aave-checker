// Run: node tests/addcollateral.test.mjs
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const src = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const a = src.indexOf('/* addcoll:start */');
const b = src.indexOf('/* addcoll:end */');
assert.ok(a > 0 && b > a, 'markers found');
const m = new Function('TARGET_HF', src.slice(a, b) + '; return { addCollateralFor, addCollateralRows, mainCollateral, parseLtvInput };')(2.2);
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

// preset rows, incl. LT / 2.2
const acct = { totalDebtUsd: 5000, totalCollateralUsd: 8000, liqThreshold: 0.78 };
const rows = m.addCollateralRows(acct, { symbol: 'WBTC', price: 70000, enabled: true });
assert.equal(rows.length, 6);
assert.deepEqual(rows.slice(0, 5).map(x => x.label), ['30%', '40%', '50%', '60%', '70%']);
near(rows[0].extraUsd, 5000 / 0.3 - 8000);
near(rows[2].extraUsd, 5000 / 0.5 - 8000);      // 2000
near(rows[2].extraAmount, 2000 / 70000);
assert.equal(rows[3].status, 'add'); near(rows[3].extraUsd, 5000 / 0.6 - 8000);
assert.equal(rows[4].status, 'below');            // 62.5% now, 70% target
const hf = rows[5];
near(hf.target, 0.78 / 2.2);
assert.equal(hf.label, '35.5% (health factor 2.2)');
near(hf.extraUsd, 5000 * 2.2 / 0.78 - 8000);
// HF check: collateral * LT / debt = 2.2 after adding
near((8000 + hf.extraUsd) * 0.78 / 5000, 2.2, 1e-9);
// no main collateral still works (USD only)
assert.equal(m.addCollateralRows(acct, null)[0].extraAmount, null);
// zero liquidation threshold: no HF row
assert.equal(m.addCollateralRows({ ...acct, liqThreshold: 0 }, null).length, 5);

// main collateral: first enabled, else first
assert.equal(m.mainCollateral([{ symbol: 'A', enabled: false }, { symbol: 'B', enabled: true }]).symbol, 'B');
assert.equal(m.mainCollateral([{ symbol: 'A', enabled: false }]).symbol, 'A');
assert.equal(m.mainCollateral([]), null);

// custom input parsing
const good = [['45', 0.45], [' 45 ', 0.45], ['45%', 0.45], ['45.5', 0.455], ['45,5', 0.455], ['.5', 0.005], ['100', 1], ['7.', 0.07]];
for (const [i, w] of good) near(m.parseLtvInput(i), w);
for (const i of ['', '  ', 'abc', '0', '-5', '101', '1e2', '4 5', null, undefined, '%', '0x10']) assert.equal(m.parseLtvInput(i), null, String(i));
console.log('add-collateral tests passed');
