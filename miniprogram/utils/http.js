// 基于 wx.createTCPSocket 的极简 HTTP/1.1 客户端（WinRM 走 5985 端口，不在小程序禁用端口列表内）。
const { utf8Encode, utf8Decode } = require('./encoding');

function concat(a, b) {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

function findHeaderEnd(buf) {
  for (let i = 0; i + 3 < buf.length; i++) {
    if (buf[i] === 13 && buf[i + 1] === 10 && buf[i + 2] === 13 && buf[i + 3] === 10) return i;
  }
  return -1;
}

function parseChunked(body) {
  let out = new Uint8Array(0);
  let pos = 0;
  while (pos < body.length) {
    let lineEnd = -1;
    for (let i = pos; i + 1 < body.length; i++) {
      if (body[i] === 13 && body[i + 1] === 10) { lineEnd = i; break; }
    }
    if (lineEnd < 0) break;
    const size = parseInt(utf8Decode(body.slice(pos, lineEnd)).trim(), 16);
    if (!size) break;
    const start = lineEnd + 2;
    out = concat(out, body.slice(start, start + size));
    pos = start + size + 2;
  }
  return out;
}

/**
 * 发送一次 HTTP 请求（短连接）。
 * @param {object} opt {host, port, path, method, headers, body(Uint8Array|string), timeout}
 * @returns Promise<{status, headers, body(Uint8Array), text}>
 */
function request(opt) {
  return new Promise((resolve, reject) => {
    const bodyBytes = typeof opt.body === 'string' ? utf8Encode(opt.body) : (opt.body || new Uint8Array(0));
    const headers = Object.assign({
      Host: `${opt.host}:${opt.port}`,
      'Content-Length': String(bodyBytes.length),
      Connection: 'close',
      'User-Agent': 'WakePC-MiniProgram'
    }, opt.headers || {});

    let head = `${opt.method || 'POST'} ${opt.path || '/'} HTTP/1.1\r\n`;
    for (const k of Object.keys(headers)) head += `${k}: ${headers[k]}\r\n`;
    head += '\r\n';
    const payload = concat(utf8Encode(head), bodyBytes);

    const tcp = wx.createTCPSocket();
    let received = new Uint8Array(0);
    let settled = false;
    const timeout = opt.timeout || 20000;

    const finish = (err, res) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { tcp.close(); } catch (e) {}
      if (err) reject(err); else resolve(res);
    };

    const timer = setTimeout(() => finish(new Error('连接超时，请确认目标已开机且端口可达')), timeout);

    const tryParse = (isEnd) => {
      const headerEnd = findHeaderEnd(received);
      if (headerEnd < 0) return false;
      const headText = utf8Decode(received.slice(0, headerEnd));
      const lines = headText.split('\r\n');
      const status = parseInt(lines[0].split(' ')[1], 10);
      const resHeaders = {};
      for (let i = 1; i < lines.length; i++) {
        const idx = lines[i].indexOf(':');
        if (idx > 0) resHeaders[lines[i].slice(0, idx).trim().toLowerCase()] = lines[i].slice(idx + 1).trim();
      }
      const bodyRaw = received.slice(headerEnd + 4);
      const cl = resHeaders['content-length'];
      const chunked = (resHeaders['transfer-encoding'] || '').includes('chunked');
      if (cl !== undefined && bodyRaw.length < parseInt(cl, 10) && !isEnd) return false;
      if (chunked && !isEnd) {
        const tail = utf8Decode(bodyRaw.slice(Math.max(0, bodyRaw.length - 7)));
        if (!tail.includes('0\r\n\r\n')) return false;
      }
      const body = chunked ? parseChunked(bodyRaw) : bodyRaw;
      finish(null, { status, headers: resHeaders, body, text: utf8Decode(body) });
      return true;
    };

    tcp.onError((res) => finish(new Error('网络错误：' + (res.errMsg || '连接失败'))));
    tcp.onMessage((res) => {
      received = concat(received, new Uint8Array(res.message));
      tryParse(false);
    });
    tcp.onClose(() => {
      if (!tryParse(true)) finish(new Error('连接被关闭，未收到完整响应'));
    });
    tcp.onConnect(() => tcp.write(payload.buffer));

    tcp.connect({ address: opt.host, port: opt.port, timeout: Math.min(10, Math.max(2, Math.floor(timeout / 1000))) });
  });
}

module.exports = { request };
