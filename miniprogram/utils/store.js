// 设备数据存储（本地缓存）。
const KEY = 'wakepc_devices_v1';

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function list() {
  return wx.getStorageSync(KEY) || [];
}

function save(devices) {
  wx.setStorageSync(KEY, devices);
}

function get(id) {
  return list().find((d) => d.id === id) || null;
}

function upsert(device) {
  const devices = list();
  if (!device.id) {
    device.id = genId();
    device.apps = device.apps || [];
    devices.push(device);
  } else {
    const idx = devices.findIndex((d) => d.id === device.id);
    if (idx >= 0) devices[idx] = Object.assign(devices[idx], device);
    else devices.push(device);
  }
  save(devices);
  return device;
}

function remove(id) {
  save(list().filter((d) => d.id !== id));
}

function upsertApp(deviceId, app) {
  const devices = list();
  const dev = devices.find((d) => d.id === deviceId);
  if (!dev) return;
  dev.apps = dev.apps || [];
  if (!app.id) {
    app.id = genId();
    dev.apps.push(app);
  } else {
    const idx = dev.apps.findIndex((a) => a.id === app.id);
    if (idx >= 0) dev.apps[idx] = app;
    else dev.apps.push(app);
  }
  save(devices);
}

function removeApp(deviceId, appId) {
  const devices = list();
  const dev = devices.find((d) => d.id === deviceId);
  if (!dev) return;
  dev.apps = (dev.apps || []).filter((a) => a.id !== appId);
  save(devices);
}

module.exports = { list, get, upsert, remove, upsertApp, removeApp };
