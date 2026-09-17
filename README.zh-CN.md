# OpenPPTSpeaker

[English](./README.md) | **简体中文**

![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)
![Platform: Windows x64](https://img.shields.io/badge/platform-Windows%20x64-lightgrey.svg)

> 开源的 AI PPT 讲演助手：导入演示文稿，由大模型撰写讲解词，用语音逐页讲出来，字幕与声音精确同步，并支持听众随时打断提问。

把静态的演示，变成一场可以被听见、也能被追问的讲解。

## 下载

**[⬇ 下载最新版本](https://github.com/zjjqy/OpenPPTSpeaker/releases/latest)** — Windows 安装包（x64），约 115 MB。

安装包未做代码签名，Windows 会弹出 SmartScreen 提示，选择**更多信息 → 仍要运行**即可；详细说明见[版本说明](./RELEASE_NOTES_v1.0.1.md)。想自行编译？见[快速开始](#快速开始)。

## 演示截图

| 悬浮球 | PPT 库 |
| --- | --- |
| ![悬浮球：状态与开始讲解按钮](./screenshots/orb.png) | ![PPT 库：导入面板与演示卡片](./screenshots/deck-library.png) |

![讲演现场：页面聚光压暗、字幕与语音同步、右下角迷你胶囊](./screenshots/presenting.png)

## 特性

- **导入演示**：支持 PDF（逐页转幻灯片）或逐页图片。
- **AI 讲稿**：大模型按页生成逐句讲解词，每一句都可以手动编辑。
- **预合成语音**：开讲前一次性合成整份讲稿，字幕随真实音频时间轴推进。若某页合成失败，会静音播放作者原文，而不是用 AI 现编内容顶替。
- **可打断问答**：听众随时插话，助手暂停作答，然后从被打断的那一句继续讲解。
- **聚光定位**：讲解到某句时高亮页面对应区域、其余部分压暗。支持按元素 id 或百分比坐标定位。
- **手机变遥控与麦克风**：同一 Wi-Fi 下扫码即可用手机当无线麦克风与遥控器（上一页 / 下一页 / 暂停 / 继续 / 结束），无需安装 App。
- **导出视频**：把整场讲解（画面 + 语音 + 字幕）导出为 MP4。
- **主题外观**：浅色 / 深色 / 跟随系统，6 档强调色，所有窗口统一生效。
- **中英双语**：界面、助手话术与生成的讲稿语言都跟随「界面语言」设置，设置页可随时切换；Edge TTS 音色随之切换到对应语言的音色。

## 技术栈

| 层级 | 选型 |
| --- | --- |
| 桌面框架 | Electron 28 |
| 构建 | electron-vite |
| 界面 | Vue 3 + Pinia + TypeScript |
| 大模型 | DashScope（千问），默认 `qwen3.8-flash` |
| 语音识别 | Paraformer 实时流式（`paraformer-realtime-v2`） |
| 语音合成 | Edge TTS（默认，免费免 Key）、CosyVoice、Sambert |

## 环境要求

- Node.js >= 18
- 用于大模型与语音识别的 **DashScope API Key**。CosyVoice / Sambert 同样需要该 Key；**Edge TTS 无需任何 Key**。
- 麦克风（本机麦克风，或通过手机遥控页使用手机麦克风）。

## 快速开始

```bash
# 安装依赖
npm install

# 开发运行（先构建，再启动 Electron）
npm run dev

# 主进程 / 渲染层类型检查
npm run typecheck

# 打包 Windows 版本
npm run package:win
```

首次启动后，打开「设置」填写 DashScope API Key。Key 只保存在本机（应用的 `userData/config.json`），由主进程直连云端服务，不经任何中转。

## 配置项

以下为默认值（均可在「设置」中修改）：

| 配置 | 默认值 |
| --- | --- |
| 界面语言 | `简体中文` |
| 对话模型 | `qwen3.8-flash` |
| 语音识别 | `paraformer-realtime-v2` |
| 语音合成 | Edge TTS（`zh-CN-XiaoxiaoNeural`） |
| 唤醒词 | `小讲`、`你好小讲` |
| 讲解时悬浮球停靠位置 | 右下 |

其他可配置项：多音字标注（`词=拼音`，声调用数字 1~5）、是否允许打断、电脑端麦克风收音、手机端语音输出、主题与强调色。

## 演示页控制接口

任何演示 HTML 只要暴露两个全局对象，就能被助手驱动。

**必需 —— 翻页**（页码从 1 开始）：

```js
window.speakerDeck = {
  goTo(page) { /* 成功返回 true */ },
  next() {},
  prev() {},
  current() { return 1 },
  count() { return 1 }
}
```

`goTo` 必须调用页面自身的翻页逻辑，保证内部页码计数、`.active` 类与进度指示等状态全部同步。

**可选 —— 坐标聚光**（导入的 PDF / 图片演示使用）：

```js
window.speakerSpotlight = function (rect) {
  // rect = { x, y, w, h }，相对页面的百分比（0~100）；传 null 清除聚光
  return true
}
```

内置示例 [`introduceProduction/`](./introduceProduction) 同时实现了两者，完整规范见 [`introduceProduction/控制接口.md`](./introduceProduction/控制接口.md)。

## 目录结构

```
src/
├─ main/                 主进程
│  ├─ ai/                大模型客户端与工具定义
│  ├─ browser/           演示窗口控制（翻页、聚光）
│  ├─ config/            配置读写与默认值
│  ├─ ipc/               IPC 通道注册
│  ├─ phone/             手机桥接（HTTPS + WebSocket）
│  ├─ ppt/               演示库、导入、讲稿生成、视频导出
│  ├─ speech/            语音会话、ASR、TTS 引擎
│  ├─ tour/              讲解引擎与上下文
│  └─ windows/           窗口管理（悬浮球、字幕、设置、PPT）
├─ preload/              渲染层桥接（window.ops）
└─ renderer/             渲染层（Vue 3 + Pinia）
shared/                  主进程 / preload / 渲染层共享类型（含 i18n 词典）
introduceProduction/     内置示例演示 + 控制接口规范
resources/phone/         手机遥控页面
ui/                      静态 HTML UI 设计稿
```

## 隐私说明

- API Key 仅保存在本机，不会上传，也不会输出到日志。
- 页面文本与讲稿只在「生成讲解词」或「回答提问」时发送给所选模型服务。
- 手机桥接在本地局域网内运行（自签证书），不经过第三方中转。

## 参与贡献

欢迎提交 Issue 与 Pull Request。提 PR 前建议：

1. 运行 `npm run typecheck` 并确保通过；
2. 保持改动聚焦，并在 PR 描述中说明动机；
3. UI 相关改动请附截图或简短录屏。

## 许可

[MIT](./LICENSE)
