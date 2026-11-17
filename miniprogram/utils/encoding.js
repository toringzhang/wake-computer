const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function utf8Encode(str) {
  const out = [];
  for (let i = 0; i < str.length; i++) {
    let c = str.codePointAt(i);
    if (c > 0xffff) i++;
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return new Uint8Array(out);
}

function utf8Decode(u8) {
  let s = '';
  for (let i = 0; i < u8.length; ) {
    const b = u8[i];
    let c;
    if (b < 0x80) { c = b; i += 1; }
    else if (b < 0xe0) { c = ((b & 31) << 6) | (u8[i + 1] & 63); i += 2; }
    else if (b < 0xf0) { c = ((b & 15) << 12) | ((u8[i + 1] & 63) << 6) | (u8[i + 2] & 63); i += 3; }
    else { c = ((b & 7) << 18) | ((u8[i + 1] & 63) << 12) | ((u8[i + 2] & 63) << 6) | (u8[i + 3] & 63); i += 4; }
    s += String.fromCodePoint(c);
  }
  return s;
}

function base64Encode(u8) {
  let s = '';
  for (let i = 0; i < u8.length; i += 3) {
    const b0 = u8[i], b1 = u8[i + 1], b2 = u8[i + 2];
    s += B64[b0 >> 2] + B64[((b0 & 3) << 4) | ((b1 || 0) >> 4)];
    s += i + 1 < u8.length ? B64[((b1 & 15) << 2) | ((b2 || 0) >> 6)] : '=';
    s += i + 2 < u8.length ? B64[b2 & 63] : '=';
  }
  return s;
}

function base64Decode(str) {
  const clean = str.replace(/[^A-Za-z0-9+/]/g, '');
  const out = [];
  for (let i = 0; i < clean.length; i += 4) {
    const n = (B64.indexOf(clean[i]) << 18) | (B64.indexOf(clean[i + 1]) << 12) |
      ((B64.indexOf(clean[i + 2]) & 63) << 6) | (B64.indexOf(clean[i + 3]) & 63);
    out.push((n >> 16) & 255);
    if (clean[i + 2] && clean[i + 2] !== '=') out.push((n >> 8) & 255);
    if (clean[i + 3] && clean[i + 3] !== '=') out.push(n & 255);
  }
  return new Uint8Array(out);
}

function base64OfString(str) {
  return base64Encode(utf8Encode(str));
}

// PowerShell -EncodedCommand 要求 UTF-16LE 的 base64
function psEncodedCommand(script) {
  const bytes = new Uint8Array(script.length * 2);
  for (let i = 0; i < script.length; i++) {
    const c = script.charCodeAt(i);
    bytes[i * 2] = c & 255;
    bytes[i * 2 + 1] = c >> 8;
  }
  return base64Encode(bytes);
}

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === 'x' ? r : (r & 3) | 8).toString(16);
  });
}

function xmlEscape(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

module.exports = { utf8Encode, utf8Decode, base64Encode, base64Decode, base64OfString, psEncodedCommand, uuid, xmlEscape };
