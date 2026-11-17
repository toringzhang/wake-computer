const store = require('../../utils/store');
const actions = require('../../utils/actions');

Page({
  data: {
    devices: []
  },

  onShow() {
    this.loadDevices();
    this.probeAll();
  },

  loadDevices() {
    const devices = store.list().map((d) => ({
      ...d,
      status: 'unknown',
      appCount: (d.apps || []).length
    }));
    this.setData({ devices });
  },

  async probeAll() {
    const devices = this.data.devices;
    await Promise.all(devices.map(async (d, i) => {
      const online = await actions.probe(d);
      if (this.data.devices[i] && this.data.devices[i].id === d.id) {
        this.setData({ [`devices[${i}].status`]: online ? 'online' : 'offline' });
      }
    }));
  },

  goDevice(e) {
    wx.navigateTo({ url: `/pages/device/device?id=${e.currentTarget.dataset.id}` });
  },

  goAdd() {
    wx.navigateTo({ url: '/pages/device-edit/device-edit' });
  },

  async quickWake(e) {
    const id = e.currentTarget.dataset.id;
    const device = store.get(id);
    if (!device) return;
    wx.showLoading({ title: '发送唤醒包…' });
    try {
      await actions.wake(device);
      wx.hideLoading();
      wx.showToast({ title: '唤醒包已发送', icon: 'success' });
    } catch (err) {
      wx.hideLoading();
      wx.showModal({ title: '唤醒失败', content: err.message, showCancel: false });
    }
  }
});
