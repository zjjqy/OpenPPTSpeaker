/**
 * IPC 通道定义 —— 主进程与渲染进程的契约
 * 所有通道名、请求/响应类型集中在此，保证类型安全。
 */

export const IPC = {
  Window: {
    /** 悬浮球最小化（点击收起到托盘） */
    OrbMinimize: 'window:orb-minimize',
    /** 从托盘恢复悬浮球 */
    OrbRestore: 'window:orb-restore',
    /** 隐藏字幕窗口 */
    SubtitleHide: 'window:subtitle-hide',
    /** 设置字幕窗口展示模式 */
    SubtitleMode: 'window:subtitle-mode',
    /** 打开设置面板 */
    OpenSettings: 'window:open-settings',
    /** 打开 PPT 管理/讲稿编辑窗口 */
    OpenPpt: 'window:open-ppt',
    /** 退出应用 */
    Quit: 'window:quit',
    /** 悬浮球迷你/完整模式切换事件（主进程 → 渲染层） */
    OrbModeChanged: 'window:orb-mode-changed',
  },
  Speech: {
    /** 启动语音会话（开始采集/唤醒监听） */
    Start: 'speech:start',
    /** 停止语音会话 */
    Stop: 'speech:stop',
    /** 切换唤醒监听开关 */
    ToggleWake: 'speech:toggle-wake',
    /** 主动问一句话（无打断场景，直接输入文本） */
    Ask: 'speech:ask',
    /** 语音会话状态/事件推送给渲染层 */
    Event: 'speech:event',
    /** TTS 音频帧下行（主进程 → audioWorker） */
    TtsFrame: 'speech:tts-frame',
    /** TTS 播放控制（interrupt/pause/resume/clear） */
    TtsControl: 'speech:tts-control',
    /** audioWorker 采集到的人声/静音事件上行 */
    AudioEvent: 'speech:audio-event',
    /** audioWorker 采集的 PCM 帧上行 */
    AudioFrame: 'speech:audio-frame',
    /** audioWorker 播放完成事件上行 */
    PlaybackEvent: 'speech:playback-event',
    /** ASR 就绪通知（主进程 → audioWorker）：立即补发缓冲的 PCM 音频 */
    AsrStarted: 'speech:asr-started',
  },
  Tour: {
    /** 开始讲解 */
    Start: 'tour:start',
    /** 下一步 */
    Next: 'tour:next',
    /** 上一步 */
    Prev: 'tour:prev',
    /** 中断（用户插话） */
    Interrupt: 'tour:interrupt',
    /** 暂停讲解（静默停播，等待恢复） */
    Pause: 'tour:pause',
    /** 恢复讲解 */
    Resume: 'tour:resume',
    /** 结束讲解 */
    End: 'tour:end',
    /** 讲解状态变更事件（主进程 → 渲染层） */
    StateChanged: 'tour:state-changed',
    /** 讲解数据推送（字幕等） */
    Data: 'tour:data',
  },
  Config: {
    Get: 'config:get',
    Set: 'config:set',
    SetMany: 'config:set-many',
    /** 配置变更事件 */
    Changed: 'config:changed',
  },
  Ppt: {
    Open: 'ppt:open',
    GoSlide: 'ppt:go-slide',
    Prev: 'ppt:prev',
    Next: 'ppt:next',
    Close: 'ppt:close',
    /** 打开 PPT 文件对应的讲解数据（演讲稿.json 自动发现） */
    LoadDeck: 'ppt:load-deck',
  },
  Phone: {
    /** 获取手机桥接信息（地址/二维码/连接数） */
    GetInfo: 'phone:get-info',
    /** 开关手机桥接服务 */
    SetEnabled: 'phone:set-enabled',
    /** 手机连接状态变化事件（主进程 → 渲染层） */
    Status: 'phone:status',
  },
  Clipboard: {
    /** 写入剪贴板（走主进程，绕开渲染进程 clipboard 权限限制） */
    WriteText: 'clipboard:write-text',
  },
  Subtitle: {
    /** 字幕窗口按内容高度自适应（字幕样式可调字号/行高，固定高度会裁剪） */
    Fit: 'subtitle:fit',
  },
  PptLib: {
    /** PPT 库列表（含 activeDeckId） */
    List: 'pptlib:list',
    /** 设置活动 PPT（讲解用） */
    SetActive: 'pptlib:set-active',
    /** 导入：打开文件对话框选 PDF/图片 → 转页面图（可选生成讲稿） */
    Import: 'pptlib:import',
    /** 删除 PPT */
    Delete: 'pptlib:delete',
    /** 重命名 */
    Rename: 'pptlib:rename',
    /** 大模型生成演讲稿（可带提示词） */
    GenScript: 'pptlib:gen-script',
    /** 读取演讲稿（编辑器用） */
    GetScript: 'pptlib:get-script',
    /** 保存演讲稿 */
    SaveScript: 'pptlib:save-script',
    /** 导入演讲稿 JSON（打开对话框选择） */
    ImportScript: 'pptlib:import-script',
    /** 取页面图片 dataURL（编辑器/缩略图） */
    SlideImage: 'pptlib:slide-image',
    /** 导出讲解视频 */
    ExportVideo: 'pptlib:export-video',
    /** 导入/生成/导出进度事件（主进程 → 渲染层） */
    Progress: 'pptlib:progress',
  },
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC][keyof (typeof IPC)[keyof typeof IPC]]
