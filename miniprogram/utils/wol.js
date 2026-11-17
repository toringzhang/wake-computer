// 通过 Wake-on-LAN 魔术包唤醒目标机。
// 同时向子网广播地址与 255.255.255.255 的 9/7 端口发送，提高兼容性。
function buildMagicPacket(mac) {
  const hex = mac.replace(/[^0-9a-fA-F]/g, '');
  if (hex.length !== 12) throw new Error('MAC 地址格式错误');
  const macBytes = [];
  for (let i = 0; i < 12; i += 2) macBytes.push(parseInt(hex.substr(i, 2), 16));
  const packet = new Uint8Array(102);
  packet.fill(0xff, 0, 6);
  for (let i = 0; i < 16; i++) packet.set(macBytes, 6 + i * 6);
  return packet.buffer;
}

function broadcastAddressOf(ip) {
  const m = /^(\d+)\.(\d+)\.(\d+)\.\d+$/.exec(ip || '');
  if (!m) return null;
  return `${m[1]}.${m[2]}.${m[3]}.255`;
}

function wake(mac, ip) {
  return new Promise((resolve, reject) => {
    let packet;
    try {
      packet = buildMagicPacket(mac);
    } catch (e) {
      reject(e);
      return;
    }
    const udp = wx.createUDPSocket();
    try {
      udp.bind();
    } catch (e) {
      reject(new Error('UDP 初始化失败：' + (e.errMsg || e.message)));
      return;
    }
    const targets = [];
    const subnetBc = broadcastAddressOf(ip);
    if (subnetBc) targets.push(subnetBc);
    targets.push('255.255.255.255');

    let sent = 0;
    const sendRound = () => {
      for (const address of targets) {
        for (const port of [9, 7]) {
          try {
            udp.send({ address, port, message: packet, setBroadcast: true });
            sent++;
          } catch (e) { /* 某些平台对全局广播会抛错，忽略 */ }
        }
      }
    };
    // 连发 3 轮，间隔 300ms，降低丢包影响
    sendRound();
    setTimeout(sendRound, 300);
    setTimeout(() => {
      sendRound();
      setTimeout(() => {
        udp.close();
        if (sent > 0) resolve();
        else reject(new Error('魔术包发送失败'));
      }, 100);
    }, 600);
  });
}

module.exports = { wake, buildMagicPacket };
