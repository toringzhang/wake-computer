const assert = require('assert');
const enc = require('../miniprogram/utils/encoding');

// UTF-8 roundtrip
const s = 'Hello 世界 🚀';
assert.strictEqual(enc.utf8Decode(enc.utf8Encode(s)), s);

// base64 against Node
for (const t of ['a', 'ab', 'abc', 'abcd', '中文密码!@#']) {
  const u8 = enc.utf8Encode(t);
  assert.strictEqual(enc.base64Encode(u8), Buffer.from(u8).toString('base64'), t);
  assert.deepStrictEqual(Array.from(enc.base64Decode(Buffer.from(u8).toString('base64'))), Array.from(u8), t);
}

// basic auth string
assert.strictEqual(enc.base64OfString('user:pass'), Buffer.from('user:pass').toString('base64'));

// psEncodedCommand = UTF-16LE base64
const script = 'Write-Output "OK"';
assert.strictEqual(enc.psEncodedCommand(script), Buffer.from(script, 'utf16le').toString('base64'));

// uuid format
assert.match(enc.uuid(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);

// xmlEscape
assert.strictEqual(enc.xmlEscape(`<a b="c">&'</a>`), '&lt;a b=&quot;c&quot;&gt;&amp;&apos;&lt;/a&gt;');

// WOL magic packet
global.wx = {};
const wol = require('../miniprogram/utils/wol');
const pkt = new Uint8Array(wol.buildMagicPacket('AA:BB:CC:DD:EE:FF'));
assert.strictEqual(pkt.length, 102);
for (let i = 0; i < 6; i++) assert.strictEqual(pkt[i], 0xff);
for (let r = 0; r < 16; r++) {
  const base = 6 + r * 6;
  assert.deepStrictEqual(Array.from(pkt.slice(base, base + 6)), [0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff]);
}
// also accepts dash / bare formats
assert.strictEqual(new Uint8Array(wol.buildMagicPacket('aa-bb-cc-dd-ee-ff')).length, 102);
assert.strictEqual(new Uint8Array(wol.buildMagicPacket('aabbccddeeff')).length, 102);
assert.throws(() => wol.buildMagicPacket('aabb'));

// http chunked parsing (internal check via a fake response flow is complex; test findHeaderEnd indirectly skipped)

console.log('All tests passed');
