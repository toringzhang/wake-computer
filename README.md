# WakePC — 微信小程序局域网远程唤醒与控制

纯小程序实现（**无任何服务端组件**）的局域网 PC 控制工具：

- ⚡ **远程开机** — 标准 Wake-on-LAN 魔术包（UDP 广播 9/7 端口，连发 3 轮）
- ⏻ **远程关机 / 重启** — WinRM (WS-Management) 协议，小程序内用 `wx.createTCPSocket` 从零实现 HTTP + SOAP 客户端
- 📦 **远程启动 / 关闭应用** — 远端执行 PowerShell（优先 pwsh 7，自动回退 5.1）；启动应用通过临时计划任务注入已登录用户的交互式会话，窗口可见

> 当前版本支持 **Windows**。Linux / macOS 因小程序禁止连接 22 端口且无原生 SSH 能力，纯客户端方案不可行，留待后续以轻量 Agent 方式扩展。

## 目录结构

```
wake-computer/
├── project.config.json          # 微信开发者工具项目配置
├── miniprogram/
│   ├── app.js / app.json / app.wxss
│   ├── pages/
│   │   ├── index/               # 设备列表（在线探测、快捷唤醒）
│   │   ├── device/              # 设备详情（开机/重启/关机、应用启停）
│   │   ├── device-edit/         # 添加/编辑设备
│   │   └── app-edit/            # 添加/编辑应用
│   └── utils/
│       ├── wol.js               # Wake-on-LAN 魔术包
│       ├── http.js              # 基于 TCPSocket 的 HTTP/1.1 客户端
│       ├── winrm.js             # WinRM / WS-Man SOAP 协议客户端
│       ├── actions.js           # 高层操作封装
│       ├── encoding.js          # UTF-8 / Base64 / UTF-16LE 编码
│       └── store.js             # 本地设备存储
└── setup/
    └── setup-windows.ps1        # 目标机一次性配置脚本
```

## 使用步骤

### 1. 配置目标 Windows 电脑（一次性）

以管理员打开 PowerShell，运行：

```powershell
Set-ExecutionPolicy Bypass -Scope Process -Force
.\setup\setup-windows.ps1
```

脚本会启用 WinRM（HTTP 5985 + Basic 认证）、放行防火墙、开启网卡魔术包唤醒，并打印本机 IP / MAC。

另需手动确认：

- **BIOS/UEFI** 中开启 Wake-on-LAN / Power On By PCI-E；
- 建议关闭快速启动（`powercfg /h off`），否则「关机」后部分主板无法被 WOL 唤醒；
- 小程序中填写的必须是**本地账户**（Microsoft 账户不支持 Basic 认证）。

### 2. 导入小程序

用微信开发者工具打开本仓库根目录即可（AppID 可使用测试号）。真机使用时手机需与目标电脑在同一局域网（Wi-Fi）。

### 3. 添加设备

填写设备名称、IP、MAC、WinRM 账户密码，点「测试连接」验证后保存。

### 4. 添加应用

填写程序完整路径（如 `C:\Program Files\Tencent\WeChat\WeChat.exe`）、可选启动参数与进程名。进程名用于查询运行状态和关闭应用，默认取 exe 文件名。

## 技术要点

| 功能 | 实现 |
|------|------|
| 唤醒 | `wx.createUDPSocket` 向子网广播地址与 `255.255.255.255` 的 9/7 端口发送 102 字节魔术包 |
| 远程命令 | `wx.createTCPSocket` 连 5985 端口（不在小程序禁用端口列表），手写 HTTP/1.1 + chunked 解析，SOAP 走 WS-Man Create/Command/Receive/Signal/Delete 五步 |
| PowerShell 7 | 命令统一以 `-EncodedCommand`（UTF-16LE base64）下发，远端检测 `pwsh` 存在则优先使用 |
| 可见窗口 | 启动应用时注册临时计划任务（Interactive LogonType）并立即运行，避免程序落入 WinRM 后台会话 |
| 在线状态 | TCP 探测 5985 端口可达性 |

## 安全说明

- 凭据仅存于手机本地缓存（`wx.setStorageSync`），不经过任何第三方服务器；
- WinRM 走 HTTP 明文 + Basic 认证，**仅适用于可信家庭局域网**；如需更高安全性可自行配置 HTTPS (5986) 证书后调整端口；
- 防火墙规则仅对 Private/Domain 网络开放。

## 已知限制

- 微信小程序每 5 分钟最多创建 20 个 TCPSocket，频繁操作会受限；
- iOS 上 UDP 全局广播（255.255.255.255）可能受限，已同时向子网定向广播地址发送作为兜底；
- Linux / macOS 暂不支持（见上文说明）。
