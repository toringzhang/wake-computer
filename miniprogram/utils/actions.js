// 设备高层操作：唤醒、关机、重启、应用启停、状态探测。
const wol = require('./wol');
const winrm = require('./winrm');

function psQuote(s) {
  return "'" + String(s).replace(/'/g, "''") + "'";
}

async function wake(device) {
  await wol.wake(device.mac, device.host);
}

async function shutdown(device) {
  return winrm.runPowerShell(device, 'Stop-Computer -Force');
}

async function reboot(device) {
  return winrm.runPowerShell(device, 'Restart-Computer -Force');
}

// 启动应用：在远端创建计划任务并立即运行，使应用出现在已登录用户的交互式会话中，
// 而不是 WinRM 的后台会话（否则看不到窗口）。
async function startApp(device, app) {
  const exe = app.path;
  const args = app.args || '';
  const script = `
$ErrorActionPreference = 'Stop'
$exe = ${psQuote(exe)}
$args = ${psQuote(args)}
$user = (Get-CimInstance Win32_ComputerSystem).UserName
if ($user) {
  $taskName = 'WakePC_Launch'
  $action = if ($args) { New-ScheduledTaskAction -Execute $exe -Argument $args } else { New-ScheduledTaskAction -Execute $exe }
  $principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
  Register-ScheduledTask -TaskName $taskName -Action $action -Principal $principal | Out-Null
  Start-ScheduledTask -TaskName $taskName
  Start-Sleep -Seconds 1
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
  Write-Output "STARTED:interactive"
} else {
  if ($args) { Start-Process -FilePath $exe -ArgumentList $args } else { Start-Process -FilePath $exe }
  Write-Output "STARTED:background"
}`;
  const r = await winrm.runPowerShell(device, script);
  if (!r.stdout.includes('STARTED')) throw new Error(r.stderr || '启动失败');
  return r;
}

async function stopApp(device, app) {
  const name = app.processName || app.path.split(/[\\/]/).pop().replace(/\.exe$/i, '');
  const script = `
$procs = Get-Process -Name ${psQuote(name)} -ErrorAction SilentlyContinue
if ($procs) { $procs | Stop-Process -Force; Write-Output ("STOPPED:" + $procs.Count) }
else { Write-Output "NOTRUNNING" }`;
  const r = await winrm.runPowerShell(device, script);
  if (r.stdout.includes('NOTRUNNING')) throw new Error('该应用当前未在运行');
  if (!r.stdout.includes('STOPPED')) throw new Error(r.stderr || '关闭失败');
  return r;
}

async function queryAppRunning(device, apps) {
  if (!apps.length) return {};
  const names = apps.map((a) => a.processName || a.path.split(/[\\/]/).pop().replace(/\.exe$/i, ''));
  const listLiteral = names.map(psQuote).join(',');
  const script = `
foreach ($n in @(${listLiteral})) {
  $p = Get-Process -Name $n -ErrorAction SilentlyContinue
  Write-Output ($n + '=' + ([bool]$p))
}`;
  const r = await winrm.runPowerShell(device, script);
  const result = {};
  apps.forEach((a, i) => {
    const m = new RegExp(names[i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '=(True|False)', 'i').exec(r.stdout);
    result[a.id] = m ? m[1].toLowerCase() === 'true' : false;
  });
  return result;
}

// 在线探测：TCP 连接 WinRM 端口
function probe(device, timeoutMs) {
  return new Promise((resolve) => {
    const tcp = wx.createTCPSocket();
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { tcp.close(); } catch (e) {}
      resolve(ok);
    };
    const timer = setTimeout(() => finish(false), timeoutMs || 4000);
    tcp.onConnect(() => finish(true));
    tcp.onError(() => finish(false));
    tcp.connect({ address: device.host, port: device.port || 5985, timeout: 3 });
  });
}

async function ping(device) {
  return winrm.ping(device);
}

module.exports = { wake, shutdown, reboot, startApp, stopApp, queryAppRunning, probe, ping };
