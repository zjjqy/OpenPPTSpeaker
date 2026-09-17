/**
 * English dictionary.
 *
 * Typed as Record<DictKey, string> against the Chinese dictionary, so a missing
 * or misspelled key fails typecheck instead of silently falling back.
 */

import type { DictKey } from './zh-CN'

export const enUS: Record<DictKey, string> = {
  // ==================== Generic actions ====================
  'action.save': 'Save',
  'action.cancel': 'Cancel',
  'action.confirm': 'OK',
  'action.delete': 'Delete',
  'action.rename': 'Rename',
  'action.copy': 'Copy',
  'action.close': 'Close',
  'action.retry': 'Retry',
  'action.import': 'Import',
  'action.export': 'Export',
  'action.refresh': 'Refresh',
  'action.back': 'Back',
  'tip.saved': 'Saved',
  'tip.cancelled': 'Cancelled',
  'tip.loading': 'Loading…',

  // ==================== Window titles ====================
  'window.settings': 'OpenPPTSpeaker - Settings',
  'window.ppt': 'OpenPPTSpeaker - Decks',

  // ==================== Custom title bar window buttons ====================
  'win.minimize': 'Minimize',
  'win.maximize': 'Maximize',
  'win.restore': 'Restore',
  'win.close': 'Close window',

  // ==================== Tray ====================
  'tray.toggleOrb': 'Show / hide the orb',
  'tray.settings': 'Settings',
  'tray.ppt': 'Decks',
  'tray.quit': 'Quit',

  // ==================== Settings: navigation ====================
  'settings.group.preferences': 'Preferences',
  'settings.group.model': 'Model & voice',
  'settings.group.connection': 'Connection',
  'settings.group.personalize': 'Personalization',
  'settings.nav.general': 'General',
  'settings.nav.wake': 'Voice & interruption',
  'settings.nav.model': 'Model & speech',
  'settings.nav.phone': 'Phone remote',
  'settings.nav.appearance': 'Appearance',

  // ==================== Settings: general ====================
  'settings.general.title': 'General',
  'settings.general.desc': 'Basic assistant behavior and window layout.',
  'settings.language.title': 'Interface language',
  'settings.language.desc': 'Used for the interface and for the assistant’s narration and answers',
  'settings.orbPosition.title': 'Orb position while presenting',
  'settings.orbPosition.desc': 'Centred at rest; docks here as a mini capsule during a talk',
  'settings.closeOrb.title': 'Closing the orb panel',
  'settings.closeOrb.desc': 'Collapses to the system tray and keeps listening for the wake word',
  'settings.closeOrb.chip': 'Always in tray',

  // Orb positions
  'orb.topLeft': 'Top left',
  'orb.topRight': 'Top right',
  'orb.bottomLeft': 'Bottom left',
  'orb.bottomRight': 'Bottom right (default)',
  'orb.none': 'Hidden',

  // ==================== Settings: voice & interruption ====================
  'settings.wake.title': 'Voice & interruption',
  'settings.wake.desc': 'Wake words, barge-in, and where audio comes from.',
  'settings.enableWake.title': 'Voice wake-up',
  'settings.enableWake.desc': 'While the app runs, say a wake word to summon the assistant',
  'settings.wakeWords.title': 'Wake words',
  'settings.wakeWords.desc': 'Comma separated; 2–4 syllables works best, fuzzy matching supported',
  'settings.bargeIn.title': 'Allow barge-in while presenting',
  'settings.bargeIn.desc': 'The audience can cut in at any time; the assistant pauses and answers',
  'settings.pcMic.title': 'Use the PC microphone',
  'settings.pcMic.desc': 'Off by default: audio is captured from the phone only, avoiding echo',
  'settings.history.title': 'Conversation history',
  'settings.history.desc': 'Context kept for follow-up questions; more history costs more tokens',
  'settings.history.rounds': '{n} turns',

  // ==================== Settings: model & speech ====================
  'settings.model.title': 'Model & speech',
  'settings.model.desc': 'The LLM, recognition, and synthesis behind the presenter. Your key stays on this machine and is sent straight to the cloud from the main process.',
  'settings.apiKey.title': 'DashScope API key',
  'settings.apiKey.desc': 'Used for the LLM, speech recognition, and speech synthesis',
  'settings.llm.title': 'Chat model',
  'settings.llm.desc': 'Writes the narration and answers audience questions',
  'settings.asr.title': 'Speech recognition model',
  'settings.asr.desc': 'Realtime streaming recognition',
  'settings.tts.title': 'Synthesis engine',
  'settings.tts.desc': 'Edge is free and needs no key (default); CosyVoice sounds best; Sambert is the alternative',
  'settings.tts.edge': 'Edge · free from Microsoft (recommended)',
  'settings.tts.cosyvoice': 'CosyVoice · cloud',
  'settings.tts.sambert': 'Sambert · cloud',
  'settings.voice.title': 'Voice',
  'settings.voice.desc': 'Voices suited to presenting',
  'settings.pron.title': 'Pronunciation overrides',
  'settings.pron.desc': 'One per line: word=pinyin (tone as a digit 1–5; the syllable count must match the character count)',
  'settings.pron.edge': 'Edge uses Microsoft phonemes (sapi pinyin), e.g. 重音=chong2 yin1',
  'settings.pron.cosyvoice': 'CosyVoice uses pinyin phonemes (py), e.g. 重音=chong2 yin1',

  // Chat models
  'llm.qwen38flash': 'Qwen 3.8 Flash (recommended · fast and cheap)',
  'llm.qwenTurbo': 'Qwen Turbo (faster, cheaper)',
  'llm.qwenMax': 'Qwen Max (most capable)',

  // Qwen voices
  'voice.qwen.longanfengyue': 'Longan Fengyue (F · natural, friendly)',
  'voice.qwen.longanhuan': 'Longan Huan (F · natural)',
  'voice.qwen.longanxiaoxin': 'Longan Xiaoxin (F · lively, warm)',
  'voice.qwen.longanlingxi': 'Longan Lingxi (F · sweet)',
  'voice.qwen.longchuanshu': 'Longchuan Shu (M · steady, mature)',

  // Sambert voices
  'voice.sambert.zhichu': 'Zhichu (M)',
  'voice.sambert.zhiwei': 'Zhiwei (F)',
  'voice.sambert.zhiyue': 'Zhiyue (F · broadcast)',
  'voice.sambert.zhibei': 'Zhibei (F · child)',

  // Edge voices (Chinese)
  'voice.edge.xiaoxiao': 'Xiaoxiao (F · lively, natural)',
  'voice.edge.xiaoyi': 'Xiaoyi (F · gentle, warm)',
  'voice.edge.xiaohan': 'Xiaohan (F · warm, intellectual)',
  'voice.edge.xiaorui': 'Xiaorui (F · mature)',
  'voice.edge.yunjian': 'Yunjian (M · steady, powerful)',
  'voice.edge.yunxi': 'Yunxi (M · bright, sunny)',
  'voice.edge.yunyang': 'Yunyang (M · news anchor)',

  // Edge voices (English)
  'voice.edge.enUSJenny': 'Jenny (F · natural)',
  'voice.edge.enUSAria': 'Aria (F · friendly)',
  'voice.edge.enUSGuy': 'Guy (M · clear)',
  'voice.edge.enUSAndrew': 'Andrew (M · calm)',
  'voice.edge.enUSMichelle': 'Michelle (F · warm)',

  // ==================== Settings: phone remote ====================
  'settings.phone.title': 'Phone remote',
  'settings.phone.desc': 'On the same Wi-Fi, scan a QR code to use your phone as a wireless microphone and remote. No app to install.',
  'settings.phone.enable.title': 'Phone bridge service',
  'settings.phone.enable.desc': 'Runs a local HTTPS + WebSocket server (self-signed certificate; trust it once when scanning)',
  'settings.phone.port.title': 'Port',
  'settings.phone.port.desc': 'Default 8123',
  'settings.phone.audio.title': 'Play the assistant on the phone',
  'settings.phone.audio.desc': 'When off, the phone is only a microphone and audio stays on the computer speakers',
  'settings.phone.devices.title': 'Connected devices',
  'settings.phone.devices.desc': 'Devices online in this session',
  'settings.phone.devices.online': '{n} online',
  'settings.phone.qr.title': 'Scan to connect',
  'settings.phone.qr.generating': 'Generating QR code…',
  'settings.phone.qr.failed': 'The QR image failed to load. Copy an address above to open it manually.',
  'settings.phone.detected': 'Network interfaces detected: {list}',

  // ==================== Settings: appearance ====================
  'settings.appearance.title': 'Appearance',
  'settings.appearance.desc': 'Theme and accent apply instantly, including the subtitle bar and the deck shell.',
  'settings.theme.title': 'Theme',
  'settings.theme.desc': 'Follow the system, light, or dark',
  'settings.theme.light': 'Light',
  'settings.theme.dark': 'Dark',
  'settings.theme.auto': 'Auto',
  'settings.accent.title': 'Accent colour',
  'settings.accent.desc': 'Used for status glow, primary buttons, and progress',

  // Accents
  'accent.ocean': 'Ocean (default)',
  'accent.sky': 'Sky',
  'accent.violet': 'Violet',
  'accent.emerald': 'Emerald',
  'accent.amber': 'Amber',
  'accent.rose': 'Rose',

  // ==================== Orb ====================
  'orb.header': 'OpenPPTSpeaker voice presenter',
  'orb.tipPpt': 'Deck library / script editor',
  'orb.tipSettings': 'Settings',
  'orb.tipMinimize': 'Collapse to tray',
  'orb.tipMinimizeDisabled': 'Cannot collapse while presenting',
  'orb.tipPauseResume': 'Pause / resume',
  'orb.start': 'Start presenting',
  'orb.prev': '‹ Previous',
  'orb.next': 'Next ›',
  'orb.pause': 'Pause',
  'orb.resume': 'Resume',
  'orb.end': 'End presentation',
  'orb.pptLibrary': 'Deck library',
  'orb.noApiKey': 'No API key configured — click to open settings',
  'orb.chooseDeck': 'Choose what to present',
  'orb.current': ' · current',
  'orb.builtin': 'Built-in demo',
  'orb.slides': '{n} slides',
  'orb.noScript': ' · no script yet (generated live)',
  'orb.emptyDecks': 'No decks imported yet',
  'orb.emptyDecksHint': 'Use the “Deck library” button to import one',
  'orb.captionIdle': 'Say the wake word, or click “Start presenting”',

  // Presentation status
  'status.preparing': 'Getting ready…',
  'status.presenting': 'Presenting',
  'status.listening': 'Listening',
  'status.paused': 'Paused',
  'status.answering': 'Answering',
  'status.resuming': 'Resuming',
  'status.ended': 'Ended',
  'status.wakeup': 'Awake',
  'status.idle': 'Standing by',

  // ==================== Deck library / script editor ====================
  'ppt.subtitle': 'Deck library · Script editor',
  'ppt.tabDecks': 'Decks',
  'ppt.tabEditor': 'Script editor',
  'ppt.libraryTitle': 'Deck library',
  'ppt.libraryDesc': 'Import a PDF or page images as a presentable deck, then let the LLM write the narration sentence by sentence',
  'ppt.import': 'Import a deck',
  'ppt.importName': 'Deck name',
  'ppt.importNameHint': 'Leave blank to use the file name',
  'ppt.importNamePlaceholder': 'e.g. Product launch (Summer 2026)',
  'ppt.importPrompt': 'Script prompt',
  'ppt.importPromptHint': 'Optional · sets the tone and focus of the narration',
  'ppt.importPromptPlaceholder': 'e.g. For a first-time audience: keep it conversational, 3–5 sentences per slide, conclusion first, then the reasoning…',
  'ppt.autoGen': 'Generate the script right after importing (uncheck to import now and write or generate it later)',
  'ppt.importPdf': 'Import PDF',
  'ppt.importImages': 'Import images',
  'ppt.stage.convert': 'Converting pages',
  'ppt.stage.script': 'Generating script',
  'ppt.stage.video': 'Exporting video',
  'ppt.stage.working': 'Working',
  'ppt.chipCurrent': 'Current',
  'ppt.chipBuiltin': 'Built-in demo',
  'ppt.hasScript': 'Has script',
  'ppt.noScript': 'No script',
  'ppt.srcBuiltin': 'Built-in',
  'ppt.srcPdf': 'From PDF',
  'ppt.srcImages': 'From images',
  'ppt.setActive': 'Set as current',
  'ppt.editScript': 'Edit script',
  'ppt.regenScript': 'Generate script',
  'ppt.exportVideo': 'Export video',
  'ppt.renameTitle': 'Rename deck',
  'ppt.deleteTitle': 'Delete deck',
  'ppt.errRename': 'Rename failed',
  'ppt.confirmDelete': 'Delete “{name}”? Its page images and script will be removed as well.',
  'ppt.errImport': 'Import failed',
  'ppt.errStart': 'Could not start the presentation',
  'ppt.errGen': 'Generation failed',
  'ppt.errExport': 'Export failed',
  'ppt.errDelete': 'Delete failed',

  // Script prompt samples (sent to the LLM, so they follow the interface language)
  'ppt.sample1': 'Executive briefing: be concise, lead with outcomes and value, and avoid piling up jargon.',
  'ppt.sample2': 'New hires: explain the background in plain language first, then walk through each slide patiently.',
  'ppt.sample3': 'Developer audience: moderate pace, focus on architecture and the design trade-offs.',
  'ppt.sample1.label': 'Executive · concise',
  'ppt.sample2.label': 'New hires · background',
  'ppt.sample3.label': 'Tech talk · key points',

  // ==================== Script editor ====================
  'edit.selectDeck': 'Choose a deck to edit…',
  'edit.subtitleStyle': 'Subtitle style',
  'edit.subtitleStyleTip': 'One subtitle style shared by the whole script',
  'edit.undo': '↶ Undo',
  'edit.undoTip': 'Undo (Ctrl+Z)',
  'edit.redo': '↷ Redo',
  'edit.redoTip': 'Redo (Ctrl+Shift+Z)',
  'edit.importScript': 'Import script JSON',
  'edit.saveScript': 'Save script',
  'edit.savedTip': '✓ Saved',
  'edit.slideTitle': 'Slide {n}',
  'edit.boxTip': 'Drag to mark the spotlight area for sentence {n}',
  'edit.stageHint': 'A spotlight is the region that stays bright while the rest of the slide dims. Click “Select” on the right, then drag on this image.',
  'edit.slideHeader': 'Slide {n} · {m} sentences',
  'edit.addSentence': '+ Add sentence',
  'edit.rebox': 'Redraw',
  'edit.box': 'Select',
  'edit.clearBox': 'Clear',
  'edit.deleteShort': 'Del',
  'edit.emptySentences': 'No sentences on this slide yet. Click “+ Add sentence” to start.',
  'edit.styleScope': 'Shared by the whole script · synced to presenting and video',
  'edit.resetStyle': 'Reset to default',
  'edit.secText': 'Text',
  'edit.font': 'Font',
  'edit.fontWeight': 'Weight',
  'edit.weight.regular': 'Regular',
  'edit.weight.medium': 'Medium',
  'edit.weight.semibold': 'Semibold',
  'edit.weight.bold': 'Bold',
  'edit.fontSize': 'Size {v}%',
  'edit.lineHeight': 'Line height {v}',
  'edit.color': 'Colour',
  'edit.showProgress': 'Show sentence counter',
  'edit.secBg': 'Backdrop',
  'edit.enabled': 'Enabled',
  'edit.bgColor': 'Background',
  'edit.bgRadius': 'Corner radius {v}',
  'edit.bgPaddingX': 'Horizontal padding {v}',
  'edit.bgPaddingY': 'Vertical padding {v}',
  'edit.secStroke': 'Outline',
  'edit.strokeWidth': 'Width {v}',
  'edit.secShadow': 'Shadow',
  'edit.shadowBlur': 'Blur {v}',
  'edit.shadowOffsetX': 'Offset X {v}',
  'edit.shadowOffsetY': 'Offset Y {v}',
  'edit.secPosition': 'Position',
  'edit.bottomPct': 'From bottom {v}%',
  'edit.maxWidthPct': 'Max width {v}%',
  'edit.chooseHint': 'Choose a deck to start editing its script and spotlights. The built-in demo’s script lives in introduceProduction/演讲稿.json.',
  'edit.fontMsYahei': 'Microsoft YaHei',
  'edit.fontSimHei': 'SimHei',
  'edit.fontSimSun': 'SimSun',
  'edit.fontKaiTi': 'KaiTi',
  'edit.fontSourceHan': 'Source Han Sans',
  'edit.errSave': 'Save failed',
  'edit.errSaveDetail': 'Save failed: {msg}',
  'edit.errImport': 'Import failed',

  // ==================== Internal worker pages (hidden windows)====================
  'video.errImageLoad': 'Image failed to load',
  'pdf.errNotLoaded': 'PDF not loaded',

  // ==================== Assistant persona & speech (spoken aloud / used as prompts)====================
  'assistant.persona': 'You are OpenPPTSpeaker, a friendly open-source presentation assistant.',
  'assistant.greeting': 'Hello, I am the OpenPPTSpeaker presenting assistant. Which deck would you like me to present?',
  'assistant.anyQuestions': 'Does anyone have a question?',
  'assistant.interruptedHint': '(Note: this is a resume after an interruption. Pick up the thread you were on and do not repeat yourself mechanically.)',
  'assistant.holdOn': 'Sure, I will pause here. Go ahead — say "continue" when you want me to resume.',
  'assistant.listeningTip': 'Listening — go ahead',
  'assistant.holdTip': 'Paused — waiting for you',
  'assistant.askMoreTip': 'Any other questions, or say "continue"',
  'assistant.askMore': 'Any other questions? Or say "continue".',
  'assistant.resume': 'Alright, let us continue.',
  'assistant.profile': `[Background · OpenPPTSpeaker, an open-source presenting assistant]
- What it is: an open-source desktop tool that turns a PDF or page images into a presentable deck and narrates it page by page with AI speech.
- It is open source; the source code can be read and modified freely.

[Core capabilities]
1. Import: save a deck as PDF (or export page images) and import it; it is converted into a controllable presentation.
2. Script: the LLM writes the narration sentence by sentence from each page's content, and every sentence can be edited by hand (including per-sentence spotlight and subtitle styling).
3. Presenting: all speech is synthesised before the talk starts so subtitles stay locked to the audio. The audience can interrupt at any time; the assistant pauses, answers, then resumes.
4. Remote: scanning a QR code turns a phone into a wireless microphone and remote (next / previous / pause / end) with no app to install.
5. Export: the whole talk (slides + voice + subtitles) can be exported to MP4.

[Speech and models]
- Recognition: Paraformer realtime streaming. Synthesis: CosyVoice, Sambert, or Edge.
- The LLM and speech services are called with the user's own DashScope API key, which is stored only on their machine.

[Boundaries — follow these when answering]
- You do not know the deck beyond its script and page text; treat those as the source of truth.
- Make no factual claims about anything outside this application, and politely steer unrelated questions back to the deck.`,

  // ==================== Prompts (sent straight to the LLM, so they follow the language)====================
  'prompt.presentSystem': `You are "OpenPPTSpeaker", a professional open-source AI presenting assistant, narrating a deck to an audience live over voice.
Rules:
1. Keep the narration conversational, warm and natural; 2–4 sentences per section, written to be read aloud; do not use Markdown.
2. Spotlight and page navigation are handled automatically from the script — focus only on the narration itself.
3. When the current section is finished, call go_next to move on; call go_prev to revisit.
4. At key moments you may call ask_user to ask the audience whether they have questions, then continue based on their reply.
5. When every section has been presented, call end_tour to wrap up.
6. Output only the words to be spoken — never any explanation, heading or annotation.`,
  'prompt.qnaSystem': `You are "OpenPPTSpeaker", answering audience questions or handling commands during a live presentation.
Rules:
1. Answer from the [presentation context], conversationally, in 2–4 sentences, without Markdown.
2. If the listener gives a command (such as "next page / previous page / repeat that / stop / end / continue"), call the matching tool (go_next / go_prev / end_tour) instead of saying anything extra; if they ask you to repeat, restate the key point you just made.
3. For a completely unrelated question, explain politely and steer back to the current topic.`,
  'prompt.contextWrap': 'The following is background for the current presentation; use it when answering the listener:\n{v}',
  'prompt.listenersSay': 'The listener said: “{text}”\nHandle it: call a tool if it is a command, otherwise answer directly.',
  'prompt.wrapUp': 'All {n} sections have now been presented. Please give a short closing summary (2–3 sentences).',
  'prompt.briefTopic': 'Topic: {v}',
  'prompt.briefSection': 'Current section: {v}',
  'prompt.briefContent': 'Section content: {v}',
  'prompt.briefPresented': 'Already presented: {v}',

  // ==================== LLM tool descriptions (they affect how reliably tools are chosen)====================
  'tool.goNext': 'Move to the next section/page. Call this once the current section has been fully presented.',
  'tool.goPrev': 'Go back to the previous section/page.',
  'tool.askUser': 'Ask the audience a question — whether to continue, or whether they have any questions. Call this at key moments or after a long section.',
  'tool.askUserQuestion': 'The question to ask the audience',
  'tool.endTour': 'Call this when every section has been presented, or when the audience asks to stop. Wraps up with a summary.',

  // ==================== Presentation context labels ====================
  'ctx.deckTitle': '[Subject] {v}',
  'ctx.pageSummary': '[Page structure]\n{v}',
  'ctx.sectionContent': '[Current section content]\n{v}',
  'ctx.sectionPrompt': '[Narration requirements] {v}',
  'ctx.progress': '[Progress] Presenting section {i} of {n}.',
  'ctx.presented': '[Already presented] {v}',
  'ctx.focuses': '[Audience interests] {v}',
  'ctx.recentQa': '[Recent Q&A related to this section]\n{v}',
  'ctx.appProfile': '[Application background]\n{v}',

  // ==================== Presentation flow status ====================
  'tour.noApiKey': 'No DashScope API key configured. Please add one in Settings.',
  'tour.connecting': 'Connecting to the speech service…',
  'tour.preparingAudio': 'Preparing the narration audio…',
  'tour.preparingAudioProgress': 'Preparing narration audio {done}/{total}…',
  'tour.retryingAudio': 'Retrying audio synthesis…',
  'tour.retryingProgress': 'Retrying synthesis {done}/{total}…',
  'tour.cancelledAudio': 'Presentation cancelled (audio was not ready)',
  'tour.openingDeck': 'Opening “{title}”…',
  'tour.starting': 'The presentation is about to start…',
  'tour.pausedRemote': 'Paused (remote)',
  'tour.paused': 'Paused',
  'tour.slideTtsFailed': 'Audio synthesis failed on slide {n}; playing it silently',
  'tour.ttsFailedTitle': 'Some slides failed to synthesise',
  'tour.ttsRetryFailedTitle': 'Audio synthesis is still failing',
  'tour.btnMutePlay': 'Play silently',
  'tour.btnRetrySynth': 'Retry synthesis',
  'tour.ttsFailedTitleMsg': '{n} slides of “{title}” failed to synthesise',
  'tour.ttsRetryFailedMsg': 'After retrying, {n} slides still failed to synthesise',
  'tour.ttsFailedDetail': 'Failed slides: {pages}\n\nCurrent engine: {engine} (failures are usually a network problem or a timeout in that service)\n\n· Retry synthesis: try once more (check the network, or switch to a more reliable engine in Settings)\n· Play silently: present as usual — failed slides show subtitles and spotlights without sound, using your own script\n· Cancel: end this presentation',
  'tour.pagesMore': ' … ({n} slides in total)',
  'tour.presentSection': 'Present the current section “{title}”.',
  'list.sep': ', ',
  'list.semi': '; ',

  // ==================== Deck loading ====================
  'deck.noSlides': 'No slides found in the script file',
  'deck.defaultTitle': 'Product introduction',
  'deck.defaultDesc': 'Deck presentation',
  'deck.builtinPathOnly': 'The built-in demo must use the default load path',
  'deck.noSlideImages': 'This deck has no slide images',
  'deck.scriptNotFound': 'Script file not found: {path}',
  'deck.sectionTitle': '{name} — slide {n}',
  'deck.sectionDesc': 'Slide {n}: {title}',
  'deck.slideTitle': 'Slide {n}',

  // ==================== Deck library and import ====================
  'ppt.builtinDemoName': 'Built-in demo (product tour)',
  'ppt.untitledDeck': 'Untitled deck',
  'ppt.imageDeck': 'Image deck',
  'ppt.deckNotFound': 'Deck not found: {id}',
  'ppt.builtinNoRename': 'The built-in demo cannot be renamed',
  'ppt.builtinNoDelete': 'The built-in demo cannot be deleted',
  'ppt.builtinNoExport': 'Video export is not available for the built-in demo',
  'ppt.builtinScriptHint': 'The built-in demo’s script lives in introduceProduction/演讲稿.json',

  // ==================== Script generation ====================
  'script.sys.role': 'You are an expert writer of spoken narration for business presentations.',
  'script.sys.task': 'Your task is to write conversational narration for every slide of a deck, to be read aloud.',
  'script.sys.req': 'Requirements:',
  'script.sys.r1': '1. Keep it conversational and smooth enough to read aloud; never refer to “this page” or “this slide”;',
  'script.sys.r2': '2. 2–6 sentences per slide, each a complete sentence, roughly 30–60 seconds in total;',
  'script.sys.r3': '3. Give a short slide title first (a few words summarising the slide), then the sentence-by-sentence narration;',
  'script.sys.r4': '4. Output JSON only, with nothing else: {"title":"slide title","speech":["first sentence","second sentence"]}',
  'script.user.textIntro': 'Here is the text of slide {i} of {n} (deck title: {title}):',
  'script.user.imageIntro': 'Here is a screenshot of slide {i} of {n} (deck title: {title}).',
  'script.user.ask': 'Write the narration for this slide.',
  'script.user.observe': 'Look at the slide and write its narration.',
  'script.user.hint': 'Additional requirements: {hint}',
  'script.progress': 'Writing the script for slide {i}/{n}…',
  'script.visionFailed': 'Vision model request failed ({status}): {msg}',

  // ==================== Video export ====================
  'video.needScript': 'Generate or import a script first',
  'video.emptyScript': 'The script contains no narration sentences',
  'video.noAudio': 'No usable narration audio (synthesis failed)',
  'video.ffmpegFailed': 'ffmpeg failed: {msg}',
  'video.progressAudio': 'Preparing audio {done}/{total}…',
  'video.progressFrame': 'Rendering frames {done}/{total}…',
  'video.progressEncode': 'Encoding the video…',
  'video.progressDone': 'Done',

  // ==================== Deck control ====================
  'browser.exitPresenting': 'Exit presentation',
  'browser.noWindow': 'The presentation window does not exist',
  'browser.noElement': 'Element not found',
  'browser.pageTitle': 'Page title: {v}',
  'browser.h1s': 'Main headings: {v}',
  'browser.h2s': 'Subheadings: {v}',
  'browser.nav': 'Nav / header: {v}',
  'ctrl.firstSlide': 'Already on the first slide',
  'ctrl.lastSlide': 'Already on the last slide',

  // ==================== Speech engines ====================
  'tts.noApiKey': 'No DashScope API key configured',
  'tts.cosyvoiceTimeout': 'CosyVoice connection timed out (10s)',
  'tts.edgeTimeout': 'Edge TTS connection timed out ({n}s)',
  'tts.cosyvoiceConnectError': 'CosyVoice connection error: {msg}',
  'tts.cosyvoiceSynthError': 'CosyVoice synthesis error: {code} {msg}',
  'tts.edgeConnectError': 'Edge TTS connection error: {msg}',
  'tts.sambertFailed': 'Sambert synthesis failed ({status}): {msg}',
  'llm.requestFailed': 'LLM request failed ({status}): {msg}',

  // ==================== Context and prompts ====================
  'ctx.noSection': '[Current section] none',
  'ctx.roleUser': 'Audience',
  'ctx.roleAssistant': 'Assistant',

  // ==================== System dialogs ====================
  'dlg.choosePdf': 'Choose a PDF file',
  'dlg.pdfDocs': 'PDF documents',
  'dlg.chooseImages': 'Choose page images (multiple, sorted by file name)',
  'dlg.images': 'Images',
  'dlg.chooseScript': 'Choose a script JSON file',
  'dlg.exportVideo': 'Export presentation video',
  'dlg.mp4': 'MP4 video',
  'err.scriptFormat': 'Invalid script format (version: 2 is required)',
  'err.scriptFormatFull': 'Invalid script format (the version 2 format with a slides array is required)',
  'err.deckMissing': 'Deck not found',
  'progress.convert': 'Converting pages {done}/{total}…',
  'progress.importImages': 'Importing images {done}/{total}…',

  // ==================== Phone bridge ====================
  'phone.noLanIp': 'No real LAN IPv4 address was detected (only 127.0.0.1). Enter your Wi-Fi or Ethernet IP manually in “Computer IP”.'
}
