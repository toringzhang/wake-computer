// WinRM (WS-Management) 客户端：通过 HTTP+Basic 认证在远端 Windows 上执行命令。
// 流程：Create Shell -> Execute Command -> Receive Output -> Signal Terminate -> Delete Shell。
// 目标机需执行一次 setup/setup-windows.ps1 完成配置。
const http = require('./http');
const { base64OfString, base64Decode, utf8Decode, psEncodedCommand, uuid, xmlEscape } = require('./encoding');

const NS = `xmlns:s="http://www.w3.org/2003/05/soap-envelope"
  xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing"
  xmlns:w="http://schemas.dmtf.org/wbem/wsman/1/wsman.xsd"
  xmlns:p="http://schemas.microsoft.com/wbem/wsman/1/wsman.xsd"
  xmlns:rsp="http://schemas.microsoft.com/wbem/wsman/1/windows/shell"`;

const RESOURCE_URI = 'http://schemas.microsoft.com/wbem/wsman/1/windows/shell/cmd';

function soapHeader(host, port, action, shellId) {
  const selector = shellId
    ? `<w:SelectorSet><w:Selector Name="ShellId">${shellId}</w:Selector></w:SelectorSet>`
    : '';
  return `<s:Header>
    <a:To>http://${host}:${port}/wsman</a:To>
    <a:ReplyTo><a:Address mustUnderstand="true">http://schemas.xmlsoap.org/ws/2004/08/addressing/role/anonymous</a:Address></a:ReplyTo>
    <w:MaxEnvelopeSize mustUnderstand="true">153600</w:MaxEnvelopeSize>
    <a:MessageID>uuid:${uuid()}</a:MessageID>
    <w:Locale xml:lang="en-US" mustUnderstand="false"/>
    <p:DataLocale xml:lang="en-US" mustUnderstand="false"/>
    <w:OperationTimeout>PT60S</w:OperationTimeout>
    <w:ResourceURI mustUnderstand="true">${RESOURCE_URI}</w:ResourceURI>
    <a:Action mustUnderstand="true">${action}</a:Action>
    ${selector}
  </s:Header>`;
}

function envelope(host, port, action, shellId, body) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<s:Envelope ${NS}>
  ${soapHeader(host, port, action, shellId)}
  <s:Body>${body}</s:Body>
</s:Envelope>`;
}

function extract(xml, tag) {
  const re = new RegExp(`<(?:[\\w.]+:)?${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w.]+:)?${tag}>`);
  const m = re.exec(xml);
  return m ? m[1] : null;
}

function extractAll(xml, tag) {
  const re = new RegExp(`<(?:[\\w.]+:)?${tag}(\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w.]+:)?${tag}>`, 'g');
  const out = [];
  let m;
  while ((m = re.exec(xml))) out.push({ attrs: m[1] || '', text: m[2] });
  return out;
}

function faultText(xml) {
  return extract(xml, 'Text') || extract(xml, 'Reason') || '远端返回 SOAP Fault';
}

async function post(device, action, shellId, body, timeout) {
  const xml = envelope(device.host, device.port, action, shellId, body);
  const res = await http.request({
    host: device.host,
    port: device.port,
    path: '/wsman',
    method: 'POST',
    timeout: timeout || 25000,
    headers: {
      'Content-Type': 'application/soap+xml;charset=UTF-8',
      Authorization: 'Basic ' + base64OfString(`${device.username}:${device.password}`)
    },
    body: xml
  });
  if (res.status === 401) throw new Error('认证失败：用户名或密码错误（需本地账户且已启用 Basic 认证）');
  if (res.status !== 200) {
    const detail = res.text ? faultText(res.text) : '';
    throw new Error(`WinRM 错误（HTTP ${res.status}）${detail ? '：' + detail : ''}`);
  }
  if (res.text.includes('Fault>')) throw new Error('WinRM 错误：' + faultText(res.text));
  return res.text;
}

async function createShell(device) {
  const body = `<rsp:Shell>
    <rsp:InputStreams>stdin</rsp:InputStreams>
    <rsp:OutputStreams>stdout stderr</rsp:OutputStreams>
  </rsp:Shell>`;
  const xml = await post(device, 'http://schemas.xmlsoap.org/ws/2004/09/transfer/Create', null, body);
  const shellId = extract(xml, 'ShellId') || (extractAll(xml, 'Selector').find((s) => s.attrs.includes('ShellId')) || {}).text;
  if (!shellId) throw new Error('创建远程 Shell 失败');
  return shellId;
}

async function runCommand(device, shellId, cmd, args) {
  const argXml = (args || []).map((a) => `<rsp:Arguments>${xmlEscape(a)}</rsp:Arguments>`).join('');
  const body = `<rsp:CommandLine><rsp:Command>${xmlEscape(cmd)}</rsp:Command>${argXml}</rsp:CommandLine>`;
  const xml = await post(device, 'http://schemas.microsoft.com/wbem/wsman/1/windows/shell/Command', shellId, body);
  const commandId = extract(xml, 'CommandId');
  if (!commandId) throw new Error('命令下发失败');
  return commandId;
}

async function receive(device, shellId, commandId) {
  let stdout = '';
  let stderr = '';
  let exitCode = null;
  for (let i = 0; i < 30; i++) {
    const body = `<rsp:Receive><rsp:DesiredStream CommandId="${commandId}">stdout stderr</rsp:DesiredStream></rsp:Receive>`;
    const xml = await post(device, 'http://schemas.microsoft.com/wbem/wsman/1/windows/shell/Receive', shellId, body, 70000);
    for (const st of extractAll(xml, 'Stream')) {
      if (!st.text) continue;
      const text = utf8Decode(base64Decode(st.text));
      if (st.attrs.includes('stderr')) stderr += text;
      else stdout += text;
    }
    const code = extract(xml, 'ExitCode');
    if (code !== null) exitCode = parseInt(code, 10);
    if (xml.includes('CommandState/Done')) break;
  }
  return { stdout, stderr, exitCode };
}

async function cleanup(device, shellId, commandId) {
  try {
    if (commandId) {
      const sig = `<rsp:Signal CommandId="${commandId}"><rsp:Code>http://schemas.microsoft.com/wbem/wsman/1/windows/shell/signal/terminate</rsp:Code></rsp:Signal>`;
      await post(device, 'http://schemas.microsoft.com/wbem/wsman/1/windows/shell/Signal', shellId, sig);
    }
  } catch (e) {}
  try {
    await post(device, 'http://schemas.xmlsoap.org/ws/2004/09/transfer/Delete', shellId, '');
  } catch (e) {}
}

/**
 * 在远端以 PowerShell 执行脚本，返回 {stdout, stderr, exitCode}。
 * 优先使用 pwsh（PowerShell 7），不存在时自动回退 Windows PowerShell 5.1。
 */
async function runPowerShell(device, script) {
  const encoded = psEncodedCommand(script);
  const wrapper = `$ps = (Get-Command pwsh -ErrorAction SilentlyContinue); if ($ps) { pwsh -NoProfile -NonInteractive -EncodedCommand ${encoded} } else { powershell -NoProfile -NonInteractive -EncodedCommand ${encoded} }`;
  const outer = psEncodedCommand(wrapper);

  const shellId = await createShell(device);
  let commandId = null;
  try {
    commandId = await runCommand(device, shellId, 'powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', outer]);
    return await receive(device, shellId, commandId);
  } finally {
    await cleanup(device, shellId, commandId);
  }
}

// 测试连通性
async function ping(device) {
  const r = await runPowerShell(device, 'Write-Output ("OK " + $PSVersionTable.PSVersion.ToString())');
  if (!r.stdout.includes('OK')) throw new Error(r.stderr || '远端无响应');
  return r.stdout.trim();
}

module.exports = { runPowerShell, ping };
