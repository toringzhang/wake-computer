// 集成测试：用 Node net 模拟 wx.createTCPSocket，对接本地伪 WinRM 服务，验证完整 SOAP 流程。
const assert = require('assert');
const net = require('net');

global.wx = {
  createTCPSocket() {
    const sock = new net.Socket();
    const handlers = {};
    return {
      onConnect(fn) { sock.on('connect', fn); },
      onMessage(fn) { sock.on('data', (buf) => fn({ message: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) })); },
      onClose(fn) { sock.on('close', fn); },
      onError(fn) { sock.on('error', (e) => fn({ errMsg: e.message })); },
      connect({ address, port }) { sock.connect(port, address); },
      write(data) { sock.write(Buffer.from(data)); },
      close() { sock.destroy(); }
    };
  }
};

const winrm = require('../miniprogram/utils/winrm');

const SHELL_ID = 'SHELL-1234';
const CMD_ID = 'CMD-5678';

function soapResponse(inner) {
  const body = `<?xml version="1.0"?><s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:rsp="http://schemas.microsoft.com/wbem/wsman/1/windows/shell" xmlns:w="http://schemas.dmtf.org/wbem/wsman/1/wsman.xsd"><s:Body>${inner}</s:Body></s:Envelope>`;
  return `HTTP/1.1 200 OK\r\nContent-Type: application/soap+xml;charset=UTF-8\r\nContent-Length: ${Buffer.byteLength(body)}\r\nConnection: close\r\n\r\n${body}`;
}

const server = net.createServer((sock) => {
  let data = '';
  sock.on('data', (chunk) => {
    data += chunk.toString();
    const headerEnd = data.indexOf('\r\n\r\n');
    if (headerEnd < 0) return;
    const clMatch = /content-length:\s*(\d+)/i.exec(data);
    if (!clMatch) return;
    const body = data.slice(headerEnd + 4);
    if (Buffer.byteLength(body) < parseInt(clMatch[1], 10)) return;

    if (!/Authorization: Basic dXNlcjpwYXNz/.test(data)) {
      sock.end('HTTP/1.1 401 Unauthorized\r\nContent-Length: 0\r\nConnection: close\r\n\r\n');
      return;
    }

    if (body.includes('transfer/Create')) {
      sock.end(soapResponse(`<rsp:Shell><rsp:ShellId>${SHELL_ID}</rsp:ShellId></rsp:Shell>`));
    } else if (body.includes('shell/Command')) {
      assert(body.includes(`Name="ShellId">${SHELL_ID}<`), 'ShellId selector missing');
      assert(body.includes('powershell.exe'), 'should run powershell.exe');
      assert(body.includes('-EncodedCommand'), 'should use EncodedCommand');
      sock.end(soapResponse(`<rsp:CommandResponse><rsp:CommandId>${CMD_ID}</rsp:CommandId></rsp:CommandResponse>`));
    } else if (body.includes('shell/Receive')) {
      const stdout = Buffer.from('OK 7.4.0\r\n', 'utf8').toString('base64');
      sock.end(soapResponse(
        `<rsp:ReceiveResponse>` +
        `<rsp:Stream Name="stdout" CommandId="${CMD_ID}">${stdout}</rsp:Stream>` +
        `<rsp:Stream Name="stdout" CommandId="${CMD_ID}" End="true"></rsp:Stream>` +
        `<rsp:CommandState CommandId="${CMD_ID}" State="http://schemas.microsoft.com/wbem/wsman/1/windows/shell/CommandState/Done">` +
        `<rsp:ExitCode>0</rsp:ExitCode></rsp:CommandState>` +
        `</rsp:ReceiveResponse>`
      ));
    } else if (body.includes('shell/Signal')) {
      sock.end(soapResponse('<rsp:SignalResponse/>'));
    } else if (body.includes('transfer/Delete')) {
      sock.end(soapResponse(''));
    } else {
      sock.end(soapResponse('<s:Fault><s:Reason><s:Text>unknown action</s:Text></s:Reason></s:Fault>'));
    }
  });
});

(async () => {
  await new Promise((r) => server.listen(15985, '127.0.0.1', r));
  const device = { host: '127.0.0.1', port: 15985, username: 'user', password: 'pass' };

  const info = await winrm.ping(device);
  assert.strictEqual(info, 'OK 7.4.0');
  console.log('ping ->', info);

  const r = await winrm.runPowerShell(device, 'Get-Date');
  assert.strictEqual(r.exitCode, 0);
  assert(r.stdout.includes('OK 7.4.0'));
  console.log('runPowerShell -> exitCode', r.exitCode);

  // 错误凭据
  let authErr = null;
  try {
    await winrm.ping({ ...device, password: 'wrong' });
  } catch (e) { authErr = e; }
  assert(authErr && /认证失败/.test(authErr.message));
  console.log('auth failure ->', authErr.message);

  server.close();
  console.log('Integration tests passed');
})().catch((e) => { console.error(e); process.exit(1); });
