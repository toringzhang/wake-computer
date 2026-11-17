const store = require('../../utils/store');
const winrm = require('../../utils/winrm');

Page({
  data: {
    isEdit: false,
    form: {
      name: '',
      host: '',
      mac: '',
      port: 5985,
      username: '',
      password: ''
    },
    testing: false
  },

  onLoad(options) {
    if (options.id) {
      const device = store.get(options.id);
      if (device) {
        this.deviceId = options.id;
        this.setData({
          isEdit: true,
          form: {
            name: device.name,
            host: device.host,
            mac: device.mac,
            port: device.port || 5985,
            username: device.username || '',
            password: device.password || ''
          }
        });
        wx.setNavigationBarTitle({ title: '编辑设备' });
      }
    }
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [`form.${field}`]: e.detail.value });
  },

  validate() {
    const f = this.data.form;
    if (!f.name.trim()) return '请填写设备名称';
    if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(f.host.trim())) return '请填写正确的 IP 地址';
    const mac = f.mac.replace(/[^0-9a-fA-F]/g, '');
    if (mac.length !== 12) return '请填写正确的 MAC 地址（如 AA:BB:CC:DD:EE:FF）';
    if (!f.username.trim()) return '请填写登录用户名';
    if (!f.password) return '请填写登录密码';
    const port = parseInt(f.port, 10);
    if (!port || port < 1025 || port > 65535) return '端口需在 1025-65535 之间';
    return null;
  },

  buildDevice() {
    const f = this.data.form;
    return {
      id: this.deviceId,
      type: 'windows',
      name: f.name.trim(),
      host: f.host.trim(),
      mac: f.mac.trim().toUpperCase(),
      port: parseInt(f.port, 10) || 5985,
      username: f.username.trim(),
      password: f.password
    };
  },

  async onTest() {
    const err = this.validate();
    if (err) {
      wx.showToast({ title: err, icon: 'none' });
      return;
    }
    this.setData({ testing: true });
    wx.showLoading({ title: '连接测试中…' });
    try {
      const info = await winrm.ping(this.buildDevice());
      wx.hideLoading();
      wx.showModal({ title: '连接成功', content: 'PowerShell ' + info.replace('OK ', ''), showCancel: false });
    } catch (e) {
      wx.hideLoading();
      wx.showModal({ title: '连接失败', content: e.message, showCancel: false });
    }
    this.setData({ testing: false });
  },

  onSave() {
    const err = this.validate();
    if (err) {
      wx.showToast({ title: err, icon: 'none' });
      return;
    }
    store.upsert(this.buildDevice());
    wx.showToast({ title: '已保存', icon: 'success' });
    setTimeout(() => wx.navigateBack(), 400);
  },

  onDelete() {
    wx.showModal({
      title: '删除设备',
      content: '确定删除该设备及其应用配置吗？',
      confirmColor: '#ef4444',
      success: (res) => {
        if (!res.confirm) return;
        store.remove(this.deviceId);
        wx.navigateBack({ delta: 2 });
      }
    });
  }
});
