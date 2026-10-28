# OpenPPTSpeaker v1.0.3

**English** | [简体中文](#简体中文)

> An open-source AI presentation speaker: import your slides, let a large language model write the narration, and have it present aloud with subtitles synced to the audio — interruptible Q&A included.

---

## What's new in 1.0.3

Four user-visible fixes. If you are on 1.0.2 and audio or the settings page misbehaved, this is the release you want.

- **Edge TTS produced no sound at all.** Microsoft replaced the `Sec-MS-GEC` token with a v2 scheme: the hashed input is now prefixed with a 57-byte copyright line, the output became `<CS64 checksum>-<SHA-256>`, and the version string moved from `1-` to `2-`. The old code matched none of it, so every request came back 403. Both the checksum and the prefix are implemented now, verified against a live synthesis (101 handshake, 23 KB of MP3 returned).
- **The switches in Settings could not be clicked.** The `<input>` and the decorative `<i>` pill filled the same box, and the pill was painted on top — so every click landed on an element with no handler. The pill is now `pointer-events: none`. (The one switch in the deck library kept working only because it happened to sit inside a `<label>`, which forwards clicks.)
- **English presentations were transcribed as Chinese.** `paraformer-realtime-v2` does support English — the real problem was that `language_hints` was never sent, so the service kept its default `["zh","en"]` and pulled English speech toward Chinese homophones. It now follows the interface language: `["zh","en"]` for Chinese (English technical terms stay recognisable), `["en"]` for English.
- **The orb flashed over the presentation when "hidden while presenting" was set.** Two causes: the orb was only tucked away *after* the deck window had already opened, and `moveTop()` — a native window call — brings a hidden window back on Windows without firing a `show` event. The orb is now hidden before the deck opens, and every `moveTop()` goes through a helper that skips invisible windows.

Also in this release:

- **The installer no longer bundles a pre-synthesized speech cache.** `data/tts-cache` is a developer machine's runtime cache and had grown to 40 MB — it pushed the installer past Gitee's 100 MB attachment limit, and it would have shipped a developer's own narration audio inside a public installer. The built-in demo now synthesizes on first play.
- `scripts/edge-tts-probe.cjs` — a maintenance script that checks Edge TTS end to end (handshake plus real audio). It is not packaged with the app.

## Download

| File | Size | What it is |
| --- | --- | --- |
| `OpenPPTSpeaker-1.0.3-setup.exe` | ~88 MB | Windows installer (x64), NSIS, choose your own install directory |
| `OpenPPTSpeaker-1.0.3-setup.exe.blockmap` | ~100 KB | Delta-update index, only needed by auto-update clients |

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

## 1.0.3 更新内容

四个用户可感知的修复。如果你在 1.0.2 上遇到没声音、开关点不动，这一版就是需要升级的。

- **Edge TTS 完全合成不出音频。** 微软把 `Sec-MS-GEC` 令牌换成了 v2 方案：哈希输入前面要拼 57 字节版权声明，输出变成 `<CS64 校验和>-<SHA-256>`，版本号前缀从 `1-` 改成 `2-`。旧代码一样都不符合，所以每个请求都返 403。现已实现校验和与前缀，并用真实合成验证（101 握手、收到 23 KB MP3）。
- **设置里的开关全部点不动。** `<input>` 和装饰用的 `<i>` 胶囊完全重合，而胶囊绘制在上层 —— 点击全落在没有事件处理的元素上。现在胶囊是 `pointer-events: none`。（PPT 库里那个开关能用只是因为它恰好被 `<label>` 包着，label 会把点击转发给内部控件。）
- **英文讲解被识别成中文。** `paraformer-realtime-v2` 本身支持英文，真正的问题是从来没传 `language_hints`，服务端一直用默认的 `["zh","en"]`，于是英文语音被往谐音中文上靠。现在该参数跟随界面语言：中文用 `["zh","en"]`（保留英文术语的可识别性），英文用 `["en"]`。
- **设置「讲解中不显示」后，悬浮球仍会在演讲界面出现时闪一下。** 两个原因：一是悬浮球要等演讲窗口打开之后才收起；二是 `moveTop()` 这个原生窗口调用在 Windows 上会把已隐藏的窗口重新显示出来，且不触发 `show` 事件。现在打开演讲窗口前就隐藏，且所有 `moveTop()` 统一走一个会跳过不可见窗口的辅助方法。

本次同时包含：

- **安装包不再携带预合成的语音缓存。** `data/tts-cache` 是开发机上的运行时缓存，已涨到 40 MB —— 既把安装包顶出了 Gitee 的 100 MB 附件上限，也等于把开发者本机演示过的讲解音频打进公开安装包。内置演示现在首次播放时现合成。
- `scripts/edge-tts-probe.cjs` —— 端到端检查 Edge TTS 的维护脚本（握手 + 真实音频），不会打进安装包。

## 下载

| 文件 | 大小 | 说明 |
| --- | --- | --- |
| `OpenPPTSpeaker-1.0.3-setup.exe` | 约 88 MB | Windows 安装包（x64），NSIS，可自选安装目录 |
| `OpenPPTSpeaker-1.0.3-setup.exe.blockmap` | 约 100 KB | 增量更新索引，仅自动更新客户端需要 |

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
