// Run: node tests/parser.test.mjs
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const src = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const a = src.indexOf('const QR_CHAIN_IDS');
const b = src.indexOf('/* expose for headless tests */');
const parseWalletQR = new Function(src.slice(a, b) + '; return parseWalletQR;')();
const A = '0xAbCdEf0123456789aBcDeF0123456789abcdef01';
const B = '0x1111111111111111111111111111111111111111';
const cases = [
  [A, { address: A, chainKey: null }],
  ['  ' + A + '\n', { address: A, chainKey: null }],
  ['ethereum:' + A, { address: A, chainKey: null }],
  ['ethereum:' + A + '@42161', { address: A, chainKey: 'arbitrum' }],
  ['ethereum:' + A + '@42161?value=1e18', { address: A, chainKey: 'arbitrum' }],
  ['ethereum:' + A + '@1', { address: A, chainKey: 'ethereum' }],
  ['ethereum:' + A + '@8453', { address: A, chainKey: 'base' }],
  ['ethereum:' + A + '@56', { address: A, chainKey: null }],
  ['ethereum:pay-' + A + '@10', { address: A, chainKey: 'optimism' }],
  ['ETHEREUM:' + A + '@137', { address: A, chainKey: 'polygon' }],
  ['ethereum:' + B + '@42161/transfer?address=' + A + '&uint256=100', { address: A, chainKey: 'arbitrum' }],
  ['https://example.com/pay?address=' + A + '&chainId=42161', { address: A, chainKey: 'arbitrum' }],
  ['https://app.example.com/' + A, { address: A, chainKey: null }],
  ['0X' + A.slice(2), { address: '0x' + A.slice(2), chainKey: null }],
];
for (const [input, want] of cases) assert.deepEqual(parseWalletQR(input), want, input);
const bad = [
  '', '   ', null, undefined, 42, 'hello', '0x', '0x1234',
  A.slice(0, -1),                       // 39 hex
  A + 'a',                              // 41 hex
  '0x' + 'a'.repeat(64),                // 64 hex (key or tx hash)
  'ethereum:' + '0x' + 'a'.repeat(64) + '@1',
  '0x' + 'g'.repeat(40),
  'vitalik.eth', 'bitcoin:bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
  'x'.repeat(5000),
];
for (const input of bad) assert.equal(parseWalletQR(input), null, String(input).slice(0, 40));
console.log('parser tests passed:', cases.length, 'good,', bad.length, 'bad');
