# OpenPPTSpeaker v1.0.4

**English** | [简体中文](#简体中文)

> An open-source AI presentation speaker: import your slides, let a large language model write the narration, and have it present aloud with subtitles synced to the audio — interruptible Q&A included.

---

## What's new in 1.0.4

Two new controls and two fixes — all of them in the script editor and the library window.

- **Generate a script from a prompt without leaving the editor.** The toolbar now has a **Prompt** panel: describe the tone, the audience and how much to say per slide, and the whole deck is regenerated in place, with per-page progress. Be aware that this rewrites the entire script — sentences, spotlights and subtitle styling are all reset, and there is no undo. The panel says so before you press the button.
- **Subtitles can be turned off.** *Settings → General → Show subtitles* hides the subtitle bar without touching the audio or the spotlights. It takes effect immediately, including mid-presentation — switching it back on brings the current sentence straight back.
- **A deleted deck's script no longer stays open.** The editor is kept alive with `v-show` while you switch tabs, so it held its own copy of the script in memory: delete the deck in the library, switch back, and the deleted script was still there — fully editable. The library now reports every change and the editor reconciles against it; if its deck is gone, it clears itself.
- **"PPT library / PPT management" is now "script library / script management" throughout.** Window title, tray menu, the orb's button and tooltip, tabs, empty state and the "not found" errors all use the new wording (13 strings). Decks without a preview used to show a hard-coded `PPT` literal in the thumbnail; that placeholder is localised now too (an English UI had been showing it in Chinese).

Also in this release:

- Nothing else changed — 1.0.3's Edge TTS, settings-switch, ASR-language and orb-flash fixes are all still in effect.

## Download

| File | Size | What it is |
| --- | --- | --- |
| `OpenPPTSpeaker-1.0.4-setup.exe` | ~88 MB | Windows installer (x64), NSIS, choose your own install directory |
| `OpenPPTSpeaker-1.0.4-setup.exe.blockmap` | ~100 KB | Delta-update index, only needed by auto-update clients |

## ⚠️ Read this before installing

**The installer is not code-signed.** Windows SmartScreen will show *"Windows protected your PC"*. To continue:

1. Click **More info**
2. Click **Run anyway**

Your browser may also flag the download as "not commonly downloaded". Both warnings are expected for a new, unsigned open-source release. Every line of the build is in this repository — you can also [build it yourself](#build-from-source).

## Getting started

1. Install and launch the app — a glowing orb appears in the centre of the screen.
2. Open **Settings** and paste your **DashScope API key**. It is stored only on your machine, in the app's `userData/config.json`.
3. Go to **Decks → Import a deck** and pick a PDF (one page per slide) or a set of page images.
4. Let the LLM write the script, review or edit it, then hit **Start presenting**.

Speech synthesis defaults to **Edge TTS**, which is free and needs no key — so narration works out of the box with only an API key for the LLM.

## Highlights

- **Import slides** — PDF (each page becomes a slide) or page images.
- **AI-written script** — the LLM writes narration page by page, sentence by sentence. Every sentence stays editable.
- **Pre-synthesized speech** — the whole script is synthesized before the talk starts, so subtitles advance with the real audio timeline.
- **Interruptible Q&A** — the audience can cut in at any time; the assistant pauses, answers, then resumes from the exact sentence it stopped at.
- **Spotlight** — the region a sentence refers to is highlighted while the rest of the slide is dimmed.
- **Phone as remote & mic** — scan a QR code on the same Wi-Fi and use your phone as a wireless microphone and remote. No app to install.
- **Video export** — render the whole talk (slides + voice + subtitles) to an MP4.
- **English / 简体中文** — the interface ships in both languages, switchable in Settings at any time. The assistant's spoken lines and the generated narration follow the same setting.
- **Light / dark theming** with 6 accent colours, applied across all windows.

## Requirements

- Windows 10 or 11 (x64)
- A **DashScope API key** for the LLM (and for CosyVoice / Sambert / speech recognition, if you use them)
- A microphone — built-in, or a phone via the remote page

## Known limitations

- **Speech recognition is Chinese-only.** The ASR model (`paraformer-realtime-v2`) recognises Chinese. In English mode the interface, the narration, and the subtitles are all English, but the **microphone input** (barge-in questions and wake words) still goes through the Chinese recogniser.
- **CosyVoice / Sambert are Chinese voices.** Only the Edge TTS voice list follows the interface language. Selecting CosyVoice or Sambert in English mode will read English text with a Chinese voice.
- **DashScope is required for both the LLM and the speech services.** There is no offline mode.
- The built-in demo deck's narration is still Chinese; it is sample content rather than interface text.

## Build from source

```bash
git clone https://github.com/zjjqy/OpenPPTSpeaker.git
cd OpenPPTSpeaker
npm install
npm run dev          # run in development
npm run package:win  # build the Windows installer yourself
```

Requires Node.js >= 18.

## License

[MIT](./LICENSE)

---

# 简体中文

> 开源的 AI PPT 讲演助手：导入演示文稿，由大模型撰写讲解词，用语音逐页讲出来，字幕与声音精确同步，并支持听众随时打断提问。

## 1.0.4 更新内容

两个新控件、两个修复，都在讲稿编辑页与演讲稿库里。

- **在编辑页直接用提示词生成讲稿。** 工具栏新增「提示词生成」面板：填写语气、受众、每页讲多少句，整份讲稿就地重写，并显示逐页进度。注意这会**整份重写** —— 讲解句、聚光框与字幕样式都会被重置，且无法撤销；面板上在你点按钮之前就写明了这一点。
- **字幕可以关掉了。** 设置 → 通用 → 显示字幕，关掉后不再显示字幕条，语音与聚光不受影响。**讲解中切换即时生效**，重新打开会立刻显示当前句。
- **删除稿件后，编辑页不再残留已删除的讲稿。** 编辑页用 `v-show` 常驻，切页签不销毁，所以内存里一直留着那份讲稿：在库页删掉它、再切回来，内容还在，而且能继续编辑。现在库页的每次增删改都会通知编辑页对账，发现自己的稿件已不存在就清空。
- **「PPT 库 / PPT 管理」统一改称「演讲稿库 / 演讲稿管理」。** 窗口标题、托盘菜单、悬浮球按钮与提示、页签、空状态、稿件不存在等错误提示全部更新（13 处）。没有缩略图的稿件原本在缩略图位置显示写死的 `PPT` 字面量，现在也走了 i18n —— 英文界面此前会显示中文。

本次同时包含：

- 其余无改动 —— 1.0.3 的 Edge TTS、设置开关、ASR 语种、悬浮球闪现四项修复仍全部有效。

## 下载

| 文件 | 大小 | 说明 |
| --- | --- | --- |
| `OpenPPTSpeaker-1.0.4-setup.exe` | 约 88 MB | Windows 安装包（x64），NSIS，可自选安装目录 |
| `OpenPPTSpeaker-1.0.4-setup.exe.blockmap` | 约 100 KB | 增量更新索引，仅自动更新客户端需要 |

## ⚠️ 安装前必看

**安装包未做代码签名**，Windows SmartScreen 会提示「Windows 已保护你的电脑」。继续安装：

1. 点击 **更多信息**
2. 点击 **仍要运行**

浏览器也可能提示「不常下载的文件」。新发布的开源软件未签名时都会如此。全部构建脚本都在本仓库内，你也可以[自行编译](#自行编译)。

## 快速开始

1. 安装并启动，屏幕中央会出现一颗发光的悬浮球。
2. 打开**设置**，填入 **DashScope API Key**。Key 只保存在本机（应用的 `userData/config.json`）。
3. 进入 **PPT 库 → 导入演示**，选择 PDF（一页一张幻灯片）或一组页面图片。
4. 让大模型生成讲稿，检查或编辑后点击**开始讲解**。

语音合成默认使用 **Edge TTS**，免费且无需 Key —— 所以只填大模型的 Key 就能出声。

## 主要特性

- **导入演示**：支持 PDF（逐页转幻灯片）或逐页图片。
- **AI 讲稿**：大模型按页生成逐句讲解词，每一句都可以手动编辑。
- **预合成语音**：开讲前一次性合成整份讲稿，字幕随真实音频时间轴推进。
- **可打断问答**：听众随时插话，助手暂停作答，然后从被打断的那一句继续讲解。
- **聚光定位**：讲解到某句时高亮页面对应区域、其余部分压暗。
- **手机变遥控与麦克风**：同一 Wi-Fi 下扫码即用，无需安装 App。
- **导出视频**：把整场讲解（画面 + 语音 + 字幕）导出为 MP4。
- **中英双语**：设置页可随时切换界面语言，助手话术与生成的讲稿语言同步跟随。
- **主题外观**：浅色 / 深色 / 跟随系统，6 档强调色，所有窗口统一生效。

## 环境要求

- Windows 10 或 11（x64）
- 用于大模型的 **DashScope API Key**（若使用 CosyVoice / Sambert / 语音识别也需要）
- 麦克风：本机麦克风，或通过手机遥控页使用手机麦克风

## 已知限制

- **语音识别仅支持中文。** 识别模型 `paraformer-realtime-v2` 只能识别中文。英文模式下界面、讲解、字幕都是英文，但**麦克风输入**（打断提问与唤醒词）仍走中文识别。
- **CosyVoice / Sambert 是中文音色。** 只有 Edge TTS 的音色列表会跟随界面语言。英文模式下选 CosyVoice / Sambert 会用中文音色念英文文本。
- 大模型与语音服务均依赖 DashScope，**没有离线模式**。
- 内置示例演示的讲稿内容仍是中文 —— 它属于演示素材而非界面文案。

## 自行编译

```bash
git clone https://github.com/zjjqy/OpenPPTSpeaker.git
cd OpenPPTSpeaker
npm install
npm run dev          # 开发运行
npm run package:win  # 自行打包 Windows 安装包
```

需要 Node.js >= 18。

## 许可

[MIT](./LICENSE)
