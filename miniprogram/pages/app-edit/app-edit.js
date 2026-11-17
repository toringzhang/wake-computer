const store = require('../../utils/store');

const ICONS = ['📦', '🎮', '🌐', '🎵', '🎬', '📝', '💬', '🛠️', '📁', '🖥️'];

Page({
  data: {
    isEdit: false,
    icons: ICONS,
    form: {
      name: '',
      path: '',
      args: '',
      processName: '',
      icon: '📦'
    }
  },

  onLoad(options) {
    this.deviceId = options.deviceId;
    if (options.appId) {
      const device = store.get(this.deviceId);
      const app = device && (device.apps || []).find((a) => a.id === options.appId);
      if (app) {
        this.appId = options.appId;
        this.setData({
          isEdit: true,
          form: {
            name: app.name,
            path: app.path,
            args: app.args || '',
            processName: app.processName || '',
            icon: app.icon || '📦'
          }
        });
        wx.setNavigationBarTitle({ title: '编辑应用' });
      }
    }
  },

  onInput(e) {
    this.setData({ [`form.${e.currentTarget.dataset.field}`]: e.detail.value });
  },

  pickIcon(e) {
    this.setData({ 'form.icon': e.currentTarget.dataset.icon });
  },

  onSave() {
    const f = this.data.form;
    if (!f.name.trim()) {
      wx.showToast({ title: '请填写应用名称', icon: 'none' });
      return;
    }
    if (!f.path.trim()) {
      wx.showToast({ title: '请填写程序路径', icon: 'none' });
      return;
    }
    store.upsertApp(this.deviceId, {
      id: this.appId,
      name: f.name.trim(),
      path: f.path.trim(),
      args: f.args.trim(),
      processName: f.processName.trim(),
      icon: f.icon
    });
    wx.showToast({ title: '已保存', icon: 'success' });
    setTimeout(() => wx.navigateBack(), 400);
  },

  onDelete() {
    wx.showModal({
      title: '删除应用',
      content: '确定删除该应用配置吗？',
      confirmColor: '#ef4444',
      success: (res) => {
        if (!res.confirm) return;
        store.removeApp(this.deviceId, this.appId);
        wx.navigateBack();
      }
    });
  }
});
