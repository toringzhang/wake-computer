const store = require('../../utils/store');
const actions = require('../../utils/actions');

Page({
  data: {
    device: null,
    status: 'unknown',
    apps: [],
    busy: false
  },

  onLoad(options) {
    this.deviceId = options.id;
  },

  onShow() {
    this.refresh();
  },

  refresh() {
    const device = store.get(this.deviceId);
    if (!device) {
      wx.navigateBack();
      return;
    }
    const apps = (device.apps || []).map((a) => ({ ...a, running: null, pending: false }));
    this.setData({ device, apps });
    wx.setNavigationBarTitle({ title: device.name });
    this.probe();
  },

  async probe() {
    const online = await actions.probe(this.data.device);
    this.setData({ status: online ? 'online' : 'offline' });
    if (online && this.data.apps.length) this.queryApps();
  },

  async queryApps() {
    try {
      const map = await actions.queryAppRunning(this.data.device, this.data.apps);
      const apps = this.data.apps.map((a) => ({ ...a, running: map[a.id] === true }));
      this.setData({ apps });
    } catch (e) {
      // 查询失败不打断主流程
    }
  },

  async doWake() {
    if (this.data.busy) return;
    this.setData({ busy: true });
    wx.showLoading({ title: '发送唤醒包…' });
    try {
      await actions.wake(this.data.device);
      wx.hideLoading();
      wx.showToast({ title: '唤醒包已发送', icon: 'success' });
      setTimeout(() => this.probe(), 8000);
    } catch (err) {
      wx.hideLoading();
      wx.showModal({ title: '唤醒失败', content: err.message, showCancel: false });
    }
    this.setData({ busy: false });
  },

  doShutdown() {
    this.confirmPower('关机', () => actions.shutdown(this.data.device));
  },

  doReboot() {
    this.confirmPower('重启', () => actions.reboot(this.data.device));
  },

  confirmPower(label, fn) {
    if (this.data.busy) return;
    wx.showModal({
      title: `确认${label}`,
      content: `确定要${label}「${this.data.device.name}」吗？`,
      confirmText: label,
      confirmColor: '#ef4444',
      success: async (res) => {
        if (!res.confirm) return;
        this.setData({ busy: true });
        wx.showLoading({ title: `正在${label}…` });
        try {
          await fn();
          wx.hideLoading();
          wx.showToast({ title: `${label}指令已发送`, icon: 'success' });
          setTimeout(() => this.probe(), 5000);
        } catch (err) {
          wx.hideLoading();
          // 关机时连接常被立即切断，视为成功
          if (/关闭|超时/.test(err.message)) {
            wx.showToast({ title: `${label}指令已发送`, icon: 'success' });
            setTimeout(() => this.probe(), 5000);
          } else {
            wx.showModal({ title: `${label}失败`, content: err.message, showCancel: false });
          }
        }
        this.setData({ busy: false });
      }
    });
  },

  async toggleApp(e) {
    const { id } = e.currentTarget.dataset;
    const idx = this.data.apps.findIndex((a) => a.id === id);
    if (idx < 0 || this.data.apps[idx].pending) return;
    const app = this.data.apps[idx];
    const starting = app.running !== true;

    this.setData({ [`apps[${idx}].pending`]: true });
    try {
      if (starting) await actions.startApp(this.data.device, app);
      else await actions.stopApp(this.data.device, app);
      this.setData({
        [`apps[${idx}].pending`]: false,
        [`apps[${idx}].running`]: starting
      });
      wx.showToast({ title: starting ? '已启动' : '已关闭', icon: 'success' });
    } catch (err) {
      this.setData({ [`apps[${idx}].pending`]: false });
      wx.showModal({ title: starting ? '启动失败' : '关闭失败', content: err.message, showCancel: false });
    }
  },

  async testConnection() {
    wx.showLoading({ title: '测试连接中…' });
    try {
      const info = await actions.ping(this.data.device);
      wx.hideLoading();
      wx.showModal({ title: '连接成功', content: 'PowerShell ' + info.replace('OK ', ''), showCancel: false });
      this.setData({ status: 'online' });
    } catch (err) {
      wx.hideLoading();
      wx.showModal({ title: '连接失败', content: err.message, showCancel: false });
    }
  },

  goEditDevice() {
    wx.navigateTo({ url: `/pages/device-edit/device-edit?id=${this.deviceId}` });
  },

  goAddApp() {
    wx.navigateTo({ url: `/pages/app-edit/app-edit?deviceId=${this.deviceId}` });
  },

  goEditApp(e) {
    wx.navigateTo({ url: `/pages/app-edit/app-edit?deviceId=${this.deviceId}&appId=${e.currentTarget.dataset.id}` });
  }
});
