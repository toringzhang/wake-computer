const assert = require('assert');
const net = require('net');

const sentPackets = [];
global.wx = {
  createTCPSocket() {
    const sock = new net.Socket();
    return {
      onConnect(fn) { sock.on('connect', fn); },
      onMessage(fn) { sock.on('data', (buf) => fn({ message: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) })); },
      onClose(fn) { sock.on('close', fn); },
      onError(fn) { sock.on('error', (e) => fn({ errMsg: e.message })); },
      connect({ address, port }) { sock.connect(port, address); },
      write(data) { sock.write(Buffer.from(data)); },
      close() { sock.destroy(); }
    };
  },
  createUDPSocket() {
    return {
      bind() {},
      send(opt) { sentPackets.push(opt); },
      close() {}
    };
  }
};

const http = require('../miniprogram/utils/http');
const wol = require('../miniprogram/utils/wol');

// chunked 响应服务
const server = net.createServer((sock) => {
  sock.on('data', () => {
    sock.end(
      'HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\nConnection: close\r\n\r\n' +
      '5\r\nHello\r\n7\r\n, World\r\n0\r\n\r\n'
    );
  });
});

(async () => {
  await new Promise((r) => server.listen(15986, '127.0.0.1', r));
  const res = await http.request({ host: '127.0.0.1', port: 15986, path: '/', method: 'GET', body: '' });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.text, 'Hello, World');
  console.log('chunked ->', JSON.stringify(res.text));
  server.close();

  await wol.wake('AA:BB:CC:DD:EE:FF', '192.168.1.100');
  // 3 轮 × 2 地址 × 2 端口 = 12 包
  assert.strictEqual(sentPackets.length, 12);
  assert(sentPackets.some((p) => p.address === '192.168.1.255' && p.port === 9));
  assert(sentPackets.some((p) => p.address === '255.255.255.255' && p.port === 7));
  assert(sentPackets.every((p) => p.setBroadcast === true && p.message.byteLength === 102));
  console.log('wol -> sent', sentPackets.length, 'packets');
  console.log('HTTP/WOL tests passed');
})().catch((e) => { console.error(e); process.exit(1); });
