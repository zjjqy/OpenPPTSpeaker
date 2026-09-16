/**
 * 简体中文词典（基准语言）。
 *
 * 这里是键的唯一定义处：en-US.ts 以 Record<DictKey, string> 声明，
 * 新增键若漏写英文会在 typecheck 阶段直接报错，保证两种语言永不缺项。
 */

export const zhCN = {
  // ==================== 通用动作 ====================
  'action.save': '保存配置',
  'action.cancel': '取消',
  'action.confirm': '确定',
  'action.delete': '删除',
  'action.rename': '重命名',
  'action.copy': '复制',
  'action.close': '关闭',
  'action.retry': '重试',
  'action.import': '导入',
  'action.export': '导出',
  'action.refresh': '刷新',
  'action.back': '返回',
  'tip.saved': '已保存',
  'tip.cancelled': '已取消',
  'tip.loading': '加载中…',

  // ==================== 窗口标题 ====================
  'window.settings': 'OpenPPTSpeaker - 设置',
  'window.ppt': 'OpenPPTSpeaker - PPT 管理',

  // ==================== 自绘标题栏的窗口按钮 ====================
  'win.minimize': '最小化',
  'win.maximize': '最大化',
  'win.restore': '向下还原',
  'win.close': '关闭窗口',

  // ==================== 系统托盘 ====================
  'tray.toggleOrb': '显示/隐藏悬浮球',
  'tray.settings': '设置',
  'tray.ppt': 'PPT 管理',
  'tray.quit': '退出应用',

  // ==================== 设置：导航 ====================
  'settings.group.preferences': '偏好',
  'settings.group.model': '模型与声音',
  'settings.group.connection': '连接',
  'settings.group.personalize': '个性化',
  'settings.nav.general': '通用',
  'settings.nav.wake': '语音与打断',
  'settings.nav.model': '模型与语音',
  'settings.nav.phone': '手机遥控',
  'settings.nav.appearance': '外观',

  // ==================== 设置：通用 ====================
  'settings.general.title': '通用',
  'settings.general.desc': '关于助手的基础行为与窗口形态。',
  'settings.language.title': '界面语言',
  'settings.language.desc': '界面文案与助手讲解、问答使用的语言',
  'settings.orbPosition.title': '讲解时悬浮球停靠位置',
  'settings.orbPosition.desc': '常态居中展示；讲解中收缩为迷你胶囊停靠此处',
  'settings.closeOrb.title': '关闭悬浮球面板',
  'settings.closeOrb.desc': '点击收起到系统托盘，后台继续聆听唤醒词',
  'settings.closeOrb.chip': '托盘常驻',

  // 悬浮球停靠位置
  'orb.topLeft': '左上',
  'orb.topRight': '右上',
  'orb.bottomLeft': '左下',
  'orb.bottomRight': '右下（默认）',
  'orb.none': '不显示',

  // ==================== 设置：语音与打断 ====================
  'settings.wake.title': '语音与打断',
  'settings.wake.desc': '唤醒词、打断与收音来源。',
  'settings.enableWake.title': '启用语音唤醒',
  'settings.enableWake.desc': '应用常驻后，说出唤醒词即可唤起助手',
  'settings.wakeWords.title': '唤醒词',
  'settings.wakeWords.desc': '逗号分隔；建议 2~4 字，支持容错匹配',
  'settings.bargeIn.title': '允许讲解中打断',
  'settings.bargeIn.desc': '听众可随时插话提问，助手暂停讲解进入问答',
  'settings.pcMic.title': '电脑麦克风参与收音',
  'settings.pcMic.desc': '默认关闭：讲解时声音只从手机遥控端采集，避免回声',
  'settings.history.title': '保留对话历史轮数',
  'settings.history.desc': '供问答联想上下文，越多越费 token',
  'settings.history.rounds': '{n} 轮',

  // ==================== 设置：模型与语音 ====================
  'settings.model.title': '模型与语音',
  'settings.model.desc': '讲解引擎背后的 LLM / 识别 / 合成。Key 仅保存在本机，通过主进程直连云端。',
  'settings.apiKey.title': 'DashScope API Key',
  'settings.apiKey.desc': '用于大模型 / 语音识别 / 语音合成',
  'settings.llm.title': '对话模型',
  'settings.llm.desc': '生成讲解词与回答听众提问',
  'settings.asr.title': '语音识别模型',
  'settings.asr.desc': '实时流式识别',
  'settings.tts.title': '合成引擎',
  'settings.tts.desc': 'Edge 免费无需 Key（默认）；CosyVoice 音质好；Sambert 可选',
  'settings.tts.edge': 'Edge · 微软免费（推荐）',
  'settings.tts.cosyvoice': 'CosyVoice · 云端',
  'settings.tts.sambert': 'Sambert · 云端',
  'settings.voice.title': '音色',
  'settings.voice.desc': '适合讲解场景的中文音色',
  'settings.pron.title': '多音字标注',
  'settings.pron.desc': '每行一条：词=拼音（声调用数字 1~5，拼音个数须与字数一致）',
  'settings.pron.edge': 'Edge 使用微软音素（sapi 拼音），如：重音=chong2 yin1',
  'settings.pron.cosyvoice': 'CosyVoice 使用拼音音素（py），如：重音=chong2 yin1',

  // 对话模型
  'llm.qwen38flash': '通义千问 3.8 Flash（推荐 · 快而省）',
  'llm.qwenTurbo': '通义千问 Turbo（更快更省）',
  'llm.qwenMax': '通义千问 Max（最强）',

  // Qwen 音色
  'voice.qwen.longanfengyue': '龙安风悦（女·自然亲切）',
  'voice.qwen.longanhuan': '龙安欢（女·自然）',
  'voice.qwen.longanxiaoxin': '龙安小昕（女·亲切活泼）',
  'voice.qwen.longanlingxi': '龙安灵希（女·甜美）',
  'voice.qwen.longchuanshu': '龙川叔（男·沉稳大叔）',

  // Sambert 音色
  'voice.sambert.zhichu': '知厨（男）',
  'voice.sambert.zhiwei': '知薇（女）',
  'voice.sambert.zhiyue': '知玥（女·播音）',
  'voice.sambert.zhibei': '知贝（女·童声）',

  // Edge 音色（中文）
  'voice.edge.xiaoxiao': '晓晓（女·活泼自然）',
  'voice.edge.xiaoyi': '晓伊（女·温柔亲切）',
  'voice.edge.xiaohan': '晓涵（女·温暖知性）',
  'voice.edge.xiaorui': '晓睿（女·知性成熟）',
  'voice.edge.yunjian': '云健（男·稳重有力）',
  'voice.edge.yunxi': '云希（男·清亮阳光）',
  'voice.edge.yunyang': '云扬（男·新闻播报）',

  // Edge 音色（英文）
  'voice.edge.enUSJenny': 'Jenny（女·自然）',
  'voice.edge.enUSAria': 'Aria（女·亲和）',
  'voice.edge.enUSGuy': 'Guy（男·清晰）',
  'voice.edge.enUSAndrew': 'Andrew（男·沉稳）',
  'voice.edge.enUSMichelle': 'Michelle（女·温暖）',

  // ==================== 设置：手机遥控 ====================
  'settings.phone.title': '手机遥控',
  'settings.phone.desc': '同一局域网内，手机扫码即可作为无线麦克风与遥控器，无需安装 App。',
  'settings.phone.enable.title': '启用手机桥接服务',
  'settings.phone.enable.desc': '启动本机 HTTPS + WebSocket 服务（自签证书，扫码一次信任即可）',
  'settings.phone.port.title': '服务端口',
  'settings.phone.port.desc': '默认 8123',
  'settings.phone.audio.title': '手机播放助手语音',
  'settings.phone.audio.desc': '关闭后手机仅作为麦克风，声音仍从电脑扬声器输出',
  'settings.phone.devices.title': '已连接设备',
  'settings.phone.devices.desc': '当前会话在线设备数',
  'settings.phone.devices.online': '{n} 台在线',
  'settings.phone.qr.title': '扫码连接',
  'settings.phone.qr.generating': '二维码生成中…',
  'settings.phone.qr.failed': '二维码图片加载失败，请尝试复制上方地址手动访问',
  'settings.phone.detected': '已检测到网卡：{list}',

  // ==================== 设置：外观 ====================
  'settings.appearance.title': '外观',
  'settings.appearance.desc': '主题与强调色即时生效，同样作用于字幕条与演示外壳。',
  'settings.theme.title': '主题模式',
  'settings.theme.desc': '跟随系统 / 浅色 / 深色',
  'settings.theme.light': '浅色',
  'settings.theme.dark': '深色',
  'settings.theme.auto': '跟随',
  'settings.accent.title': '强调色',
  'settings.accent.desc': '状态光、主按钮与进度使用强调色',

  // 强调色
  'accent.ocean': '海蓝（默认）',
  'accent.sky': '晴蓝',
  'accent.violet': '星紫',
  'accent.emerald': '松绿',
  'accent.amber': '日橙',
  'accent.rose': '玫红',

  // ==================== 悬浮球 ====================
  'orb.header': 'OpenPPTSpeaker 语音讲解',
  'orb.tipPpt': 'PPT 库 / 讲稿编辑',
  'orb.tipSettings': '设置',
  'orb.tipMinimize': '收起到托盘',
  'orb.tipMinimizeDisabled': '讲解中，暂不能收起',
  'orb.tipPauseResume': '暂停/继续',
  'orb.start': '开始讲解',
  'orb.prev': '‹ 上一页',
  'orb.next': '下一页 ›',
  'orb.pause': '暂停',
  'orb.resume': '继续',
  'orb.end': '结束讲解',
  'orb.pptLibrary': 'PPT 库',
  'orb.noApiKey': '未配置 API Key，点击设置',
  'orb.chooseDeck': '选择讲解内容',
  'orb.current': ' · 当前',
  'orb.builtin': '内置演示',
  'orb.slides': '{n} 页',
  'orb.noScript': ' · 无讲稿（将实时生成）',
  'orb.emptyDecks': '还没有导入的 PPT',
  'orb.emptyDecksHint': '点击「PPT 库」按钮导入',
  'orb.captionIdle': '说出唤醒词，或点击「开始讲解」',

  // 讲解状态
  'status.preparing': '正在准备…',
  'status.presenting': '讲解中',
  'status.listening': '倾听中',
  'status.paused': '已暂停',
  'status.answering': '回答中',
  'status.resuming': '继续讲解',
  'status.ended': '讲解结束',
  'status.wakeup': '已唤醒',
  'status.idle': '待命中',

  // ==================== PPT 库 / 讲稿编辑 ====================
  'ppt.subtitle': 'PPT 库 · 讲稿编辑',
  'ppt.tabDecks': 'PPT 管理',
  'ppt.tabEditor': '讲稿编辑',
  'ppt.libraryTitle': 'PPT 库',
  'ppt.libraryDesc': '导入 PDF / 图片为可讲解的演示，并用大模型生成逐句讲稿',
  'ppt.import': '导入演示',
  'ppt.importName': '演示名称',
  'ppt.importNameHint': '留空使用文件名',
  'ppt.importNamePlaceholder': '例如：产品发布会（2026 夏季）',
  'ppt.importPrompt': '讲稿生成提示词',
  'ppt.importPromptHint': '可选 · 决定讲解的语气与侧重',
  'ppt.importPromptPlaceholder': '例如：面向首次体验的听众，语气轻松口语化，每页讲 3~5 句，先讲结论再解释…',
  'ppt.autoGen': '导入后自动生成演讲稿（取消可先导入，稍后手动编写或再生成）',
  'ppt.importPdf': '导入 PDF',
  'ppt.importImages': '导入图片',
  'ppt.stage.convert': '转换页面',
  'ppt.stage.script': '生成讲稿',
  'ppt.stage.video': '导出视频',
  'ppt.stage.working': '处理中',
  'ppt.chipCurrent': '当前',
  'ppt.chipBuiltin': '内置演示',
  'ppt.hasScript': '有讲稿',
  'ppt.noScript': '无讲稿',
  'ppt.srcBuiltin': '内置',
  'ppt.srcPdf': 'PDF 导入',
  'ppt.srcImages': '图片导入',
  'ppt.setActive': '设为当前',
  'ppt.editScript': '编辑讲稿',
  'ppt.regenScript': 'AI 生成讲稿',
  'ppt.exportVideo': '导出视频',
  'ppt.newNamePrompt': '新的演示名称：',
  'ppt.confirmDelete': '确定删除「{name}」？页面图片与讲稿将一并删除。',
  'ppt.errImport': '导入失败',
  'ppt.errStart': '启动讲解失败',
  'ppt.errGen': '生成失败',
  'ppt.errExport': '导出失败',
  'ppt.errDelete': '删除失败',

  // 讲稿生成提示词示例（会作为提示词发给大模型，故随语言切换）
  'ppt.sample1': '面向公司领导的汇报场合：简明扼要、突出成果与价值，避免术语堆砌。',
  'ppt.sample2': '面向新入职员工：先用大白话解释背景，再逐页带读，语气耐心。',
  'ppt.sample3': '面向开发者社区的技术分享：语速适中，重点讲架构与设计取舍。',
  'ppt.sample1.label': '面向领导汇报 · 简明扼要',
  'ppt.sample2.label': '面向新员工 · 讲清背景',
  'ppt.sample3.label': '技术分享 · 突出重点',

  // ==================== 讲稿编辑器 ====================
  'edit.selectDeck': '选择要编辑的 PPT…',
  'edit.subtitleStyle': '字幕样式',
  'edit.subtitleStyleTip': '整份讲稿统一的字幕样式',
  'edit.undo': '↶ 撤销',
  'edit.undoTip': '撤销 (Ctrl+Z)',
  'edit.redo': '↷ 重做',
  'edit.redoTip': '重做 (Ctrl+Shift+Z)',
  'edit.importScript': '导入讲稿 JSON',
  'edit.saveScript': '保存讲稿',
  'edit.savedTip': '✓ 已保存',
  'edit.slideTitle': '第 {n} 页',
  'edit.boxTip': '拖动鼠标框选第 {n} 句的聚光范围',
  'edit.stageHint': '聚光框 = 页面压暗后保持高亮的区域。点击右侧「框选」后在本图上拖拽。',
  'edit.slideHeader': '第 {n} 页 · {m} 句',
  'edit.addSentence': '+ 加一句',
  'edit.rebox': '重框',
  'edit.box': '框选',
  'edit.clearBox': '清框',
  'edit.deleteShort': '删',
  'edit.emptySentences': '本页还没有讲解句，点「+ 加一句」开始。',
  'edit.styleScope': '整份讲稿统一 · 同步到讲演与视频',
  'edit.resetStyle': '恢复默认',
  'edit.secText': '文字',
  'edit.font': '字体',
  'edit.fontWeight': '字重',
  'edit.weight.regular': '常规',
  'edit.weight.medium': '中等',
  'edit.weight.semibold': '半粗',
  'edit.weight.bold': '加粗',
  'edit.fontSize': '字号 {v}%',
  'edit.lineHeight': '行高 {v}',
  'edit.color': '颜色',
  'edit.showProgress': '显示句序',
  'edit.secBg': '背景板',
  'edit.enabled': '启用',
  'edit.bgColor': '背景色',
  'edit.bgRadius': '圆角 {v}',
  'edit.bgPaddingX': '横向内边距 {v}',
  'edit.bgPaddingY': '纵向内边距 {v}',
  'edit.secStroke': '描边',
  'edit.strokeWidth': '粗细 {v}',
  'edit.secShadow': '投影',
  'edit.shadowBlur': '模糊 {v}',
  'edit.shadowOffsetX': '水平偏移 {v}',
  'edit.shadowOffsetY': '垂直偏移 {v}',
  'edit.secPosition': '位置',
  'edit.bottomPct': '距底部 {v}%',
  'edit.maxWidthPct': '最大宽度 {v}%',
  'edit.chooseHint': '选择一个 PPT 开始编辑讲稿与聚光框。内置演示的讲稿请直接编辑 introduceProduction/演讲稿.json。',
  'edit.fontMsYahei': '微软雅黑',
  'edit.fontSimHei': '黑体',
  'edit.fontSimSun': '宋体',
  'edit.fontKaiTi': '楷体',
  'edit.fontSourceHan': '思源黑体',
  'edit.errSave': '保存失败',
  'edit.errSaveDetail': '保存失败: {msg}',
  'edit.errImport': '导入失败',

  // ==================== 内部工作页（隐藏窗口）====================
  'video.errImageLoad': '图片加载失败',
  'pdf.errNotLoaded': 'PDF 未载入',

  // ==================== 助手人设与话术（会朗读 / 会进提示词，故必须随语言）====================
  'assistant.persona': '你是 OpenPPTSpeaker，一位友好的开源讲演助手。',
  'assistant.greeting': '您好，我是 OpenPPTSpeaker 讲演助手。请问需要我讲解哪份演示？',
  'assistant.anyQuestions': '大家有什么疑问吗？',
  'assistant.interruptedHint': '（注意：这是被打断后重新讲解，衔接刚才的话题，不要机械重复。）',
  'assistant.holdOn': '好的，我暂停一下，您先讲。需要继续时请说"继续"。',
  'assistant.listeningTip': '倾听中，请讲',
  'assistant.holdTip': '已暂停，等您补充',
  'assistant.askMoreTip': '还有问题请讲，或说"继续"',
  'assistant.askMore': '还有问题请讲，或者说"继续"。',
  'assistant.resume': '好，我们继续。',
  'assistant.profile': `【背景 · OpenPPTSpeaker 开源讲演助手】
- 定位：把 PDF / 图片导入为可讲解的演示，由 AI 逐页语音讲解的开源桌面工具。
- 是开源项目，可自由查看与修改源码。

【核心能力】
1. 导入：把 PPT 另存为 PDF（或逐页图片）导入，自动转成可控演示页。
2. 讲稿：大模型按页面内容生成逐句讲解词；也可以手动编辑（含每句聚光定位、字幕样式）。
3. 讲演：开讲前预合成全部语音，字幕与声音精确同步；讲解中听众可随时插话提问，助手暂停并作答后继续。
4. 遥控：手机扫码即变无线麦克风与遥控器（翻页/暂停/结束），无需安装 App。
5. 导出：可把讲解（画面+语音+字幕）导出为 MP4 视频。

【语音与模型】
- 语音识别：paraformer 实时流式识别；语音合成支持 CosyVoice / Sambert / Edge 多引擎。
- 大模型与语音服务通过用户自己的 DashScope API Key 调用，Key 只保存在用户本机。

【边界（回答时应遵守）】
- 不了解演示内容本身：讲解内容以当前演示的讲稿与页面文字为准。
- 不提供本应用之外的事实性承诺；与演示无关的问题礼貌引导回主题。`,

  // ==================== 讲解流程状态 ====================
  'tour.noApiKey': '未配置 DashScope API Key，请在设置中填写',
  'tour.connecting': '正在连接语音服务…',
  'tour.preparingAudio': '正在准备讲解音频…',
  'tour.preparingAudioProgress': '正在准备讲解音频 {done}/{total}…',
  'tour.retryingAudio': '正在重试合成音频…',
  'tour.retryingProgress': '正在重试合成 {done}/{total}…',
  'tour.cancelledAudio': '已取消讲解（音频未就绪）',
  'tour.openingDeck': '正在打开「{title}」',
  'tour.starting': '讲解即将开始…',
  'tour.pausedRemote': '已暂停（遥控）',
  'tour.paused': '已暂停',
  'tour.slideTtsFailed': '第 {n} 页语音合成失败，静音播放中',
  'tour.ttsFailedTitle': '部分页面语音合成失败',
  'tour.ttsRetryFailedTitle': '语音合成仍然失败',
  'tour.btnMutePlay': '静音播放',
  'tour.btnRetrySynth': '重试合成',
  'tour.ttsFailedTitleMsg': '「{title}」有 {n} 页未能合成语音',
  'tour.ttsRetryFailedMsg': '重试后仍有 {n} 页未能合成语音',
  'tour.ttsFailedDetail': '失败页码：{pages}\n\n当前语音引擎：{engine}（合成失败通常是该服务网络不通或超时）\n\n· 重试合成：再尝试一次（建议先检查网络，或在设置里切换为更稳定的引擎）\n· 静音播放：照常讲解，失败页只显示字幕与聚光、不出声，内容仍是你的讲稿\n· 取消：结束本次讲解',
  'tour.pagesMore': ' …（共 {n} 页）',
  'tour.presentSection': '请讲解当前区段「{title}」。',
  'list.sep': '、',
  'list.semi': '；',

  // ==================== 演示加载 ====================
  'deck.noSlides': '演讲稿.json 中没有幻灯片数据',
  'deck.defaultTitle': '产品介绍',
  'deck.defaultDesc': 'PPT 讲演',
  'deck.builtinPathOnly': '内置演示请走默认加载路径',
  'deck.noSlideImages': '该 PPT 没有页面图片',
  'deck.scriptNotFound': '未找到讲稿文件: {path}',
  'deck.slideTitle': '第 {n} 页',

  // ==================== PPT 库与导入 ====================
  'ppt.builtinDemoName': '内置演示（产品介绍）',
  'ppt.untitledDeck': '未命名演示',
  'ppt.imageDeck': '图片演示',
  'ppt.deckNotFound': 'PPT 不存在: {id}',
  'ppt.builtinNoRename': '内置演示不可重命名',
  'ppt.builtinNoDelete': '内置演示不可删除',
  'ppt.builtinNoExport': '内置演示暂不支持视频导出',
  'ppt.builtinScriptHint': '内置演示的讲稿请直接编辑 introduceProduction/演讲稿.json',

  // ==================== 讲稿生成 ====================
  'script.sys.role': '你是一位专业的企业演示演讲稿撰写专家。',
  'script.sys.task': '你的任务是为 PPT 的每一页撰写口语化的现场讲解词。',
  'script.sys.req': '要求：',
  'script.sys.r1': '1. 讲解词口语化、自然流畅，适合照稿播报，不要出现"本页""这张幻灯片"等元描述；',
  'script.sys.r2': '2. 每页 2~6 句，每句是一个完整句子，总时长约 30~60 秒；',
  'script.sys.r3': '3. 先给页标题（10 字以内，概括该页主题），再给逐句讲解词；',
  'script.sys.r4': '4. 严格输出 JSON，不要输出任何其他内容：{"title":"页标题","speech":["第一句","第二句"]}',
  'script.user.textIntro': '这是 PPT 第 {i} 页（共 {n} 页，整篇主题：{title}）的文本内容：',
  'script.user.imageIntro': '这是 PPT 第 {i} 页（共 {n} 页，整篇主题：{title}）的页面截图。',
  'script.user.ask': '请为这一页撰写讲解词。',
  'script.user.observe': '请观察页面内容，为这一页撰写讲解词。',
  'script.user.hint': '补充要求：{hint}',
  'script.progress': '正在生成第 {i}/{n} 页讲稿…',
  'script.visionFailed': '视觉模型请求失败 ({status}): {msg}',

  // ==================== 视频导出 ====================
  'video.needScript': '请先生成或导入演讲稿',
  'video.emptyScript': '演讲稿没有任何讲解句',
  'video.noAudio': '没有可用的讲解音频（合成失败）',
  'video.ffmpegFailed': 'ffmpeg 失败: {msg}',
  'video.progressAudio': '准备音频 {done}/{total}…',
  'video.progressFrame': '合成画面 {done}/{total}…',
  'video.progressEncode': '正在合成视频…',
  'video.progressDone': '完成',

  // ==================== 演示页控制 ====================
  'browser.exitPresenting': '退出演讲',
  'browser.noWindow': '讲解窗口不存在',
  'browser.noElement': '未找到元素',
  'browser.pageTitle': '页面标题: {v}',
  'browser.h1s': '主要标题: {v}',
  'browser.h2s': '子标题: {v}',
  'browser.nav': '导航/页头: {v}',
  'ctrl.firstSlide': '已是第一页',
  'ctrl.lastSlide': '已是最后一页',

  // ==================== 语音引擎 ====================
  'tts.noApiKey': '未配置 DashScope API Key',
  'tts.cosyvoiceTimeout': 'CosyVoice 连接超时（10s）',
  'tts.sambertFailed': 'Sambert 合成失败 ({status}): {msg}',
  'llm.requestFailed': 'LLM 请求失败 ({status}): {msg}',

  // ==================== 上下文与提示词 ====================
  'ctx.noSection': '【当前区段内容】无',
  'ctx.roleUser': '听众',
  'ctx.roleAssistant': '助手',

  // ==================== 系统对话框 ====================
  'dlg.choosePdf': '选择 PDF 文件',
  'dlg.pdfDocs': 'PDF 文档',
  'dlg.chooseImages': '选择页面图片（多选，按文件名排序）',
  'dlg.images': '图片',
  'dlg.chooseScript': '选择演讲稿 JSON',
  'dlg.exportVideo': '导出讲解视频',
  'dlg.mp4': 'MP4 视频',
  'err.scriptFormat': '演讲稿格式不正确（需要 version: 2）',
  'err.scriptFormatFull': '演讲稿格式不正确（需要 version: 2 的新格式，含 slides 数组）',
  'err.deckMissing': 'PPT 不存在',
  'progress.convert': '转换页面 {done}/{total}…',
  'progress.importImages': '导入图片 {done}/{total}…',

  // ==================== 手机桥接 ====================
  'phone.noLanIp': '未检测到真实局域网 IPv4（仅看到 127.0.0.1）。请在"电脑 IP"中手动填入 Wi-Fi/有线网卡的 IP。'
} as const

/** 词典键（英文词典须覆盖全部键） */
export type DictKey = keyof typeof zhCN
