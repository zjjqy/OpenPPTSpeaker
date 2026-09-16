/**
 * 手机桥接服务（方案 A：手机 = 无线麦克风 / 扬声器）
 *
 * 电脑端启动局域网 HTTPS + WebSocket 服务：
 *  - 上行：手机浏览器 getUserMedia 采集 PCM → WebSocket → 电脑 ASR（含 VAD/唤醒）
 *  - 下行：电脑 TTS 音频帧 → WebSocket → 手机 AudioContext 播放
 *
 * 注意：getUserMedia 要求安全上下文，故使用自签名 HTTPS（首次访问需在手机浏览器
 * 确认"继续访问"）。自签名证书生成一次后缓存于 userData，避免频繁换证导致信任失效。
 */

import { app } from 'electron'
import https from 'node:https'
import os from 'node:os'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { WebSocketServer, WebSocket } from 'ws'
import { generate as generateCert } from 'selfsigned'
import QRCode from 'qrcode'
import { configStore } from '../config/ConfigStore'
import { getLang, t } from '@shared/i18n'
import { speechSession } from '../speech/SpeechSession'
import { tourEngine } from '../tour/TourEngine'
import { windowManager } from '../windows/WindowManager'
import { IPC } from '@shared/ipc'

const TARGET_SAMPLE_RATE = 16000

/** 手机音频 VAD（RMS 能量检测，驱动 ASR 启动与打断） */
class PhoneVad {
  private active = false
  private idleFrames = 0
  private readonly activeThreshold = 0.012
  private readonly idleLimit = 12
  private readonly onActivity: () => void
  private readonly onIdle: () => void

  constructor(onActivity: () => void, onIdle: () => void) {
    this.onActivity = onActivity
    this.onIdle = onIdle
  }

  feed(int16: Int16Array): void {
    let sum = 0
    for (let i = 0; i < int16.length; i++) {
      const v = int16[i] / 32768
      sum += v * v
    }
    const rms = Math.sqrt(sum / (int16.length || 1))
    if (rms > this.activeThreshold) {
      if (!this.active) {
        this.active = true
        this.idleFrames = 0
        this.onActivity()
      } else {
        this.idleFrames = 0
      }
    } else if (this.active) {
      this.idleFrames++
      if (this.idleFrames >= this.idleLimit) {
        this.active = false
        this.onIdle()
      }
    }
  }
}

export class PhoneBridgeServer {
  private httpServer: https.Server | null = null
  private wss: WebSocketServer | null = null
  private clients = new Set<WebSocket>()
  /** 发言锁：当前持有"按住说话"发言权的手机（多手机并发协调，先到先得） */
  private activeTalker: WebSocket | null = null
  private vad: PhoneVad

  // 环形缓冲：缓存手机最近 ~3 秒 PCM，ASR 就绪后补发
  private ring: Buffer[] = []
  private ringBytes = 0
  private readonly ringMaxBytes = TARGET_SAMPLE_RATE * 2 * 3

  // 最近一次二维码生成错误（暴露给 UI 排查）
  private lastQrError: string | null = null

  /** 最近一次二维码生成错误（供 UI/日志排查） */
  getQrError(): string | null {
    return this.lastQrError
  }

  constructor() {
    this.vad = new PhoneVad(
      () => speechSession.onAudioEvent({ type: 'vad-activity' }, 'phone'),
      () => speechSession.onAudioEvent({ type: 'vad-idle' }, 'phone')
    )
    // 订阅语音会话：ASR 就绪补发 / TTS 帧与控制转发到手机
    speechSession.onAsrReady(() => this.resendRing())
    speechSession.onTtsFrame((pcm, sampleRate, seq) =>
      this.broadcastAudio(pcm, sampleRate, seq)
    )
    speechSession.onTtsControl((msg) => this.broadcastControl(msg.action))
    // 讲解状态同步到手机（供播放/暂停/翻页按钮的可用性切换；message 携带准备进度等提示）
    tourEngine.onState((ev) => {
      this.broadcastJson({ type: 'tour-state', state: ev.state, message: ev.message })
    })
    // 悬浮球可见性同步到手机（供"隐藏/显示托盘"按钮文案切换）
    windowManager.onOrbVisibilityChanged = (visible) => {
      this.broadcastJson({ type: 'orb-visible', visible })
    }
    // 模块自检：确认 qrcode 能正常 require
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const qrLib = require('qrcode') as { toDataURL: (t: string, o?: unknown) => Promise<string> }
      console.log(
        `[手机桥接] qrcode 模块就绪，toDataURL 类型=${typeof qrLib?.toDataURL}`
      )
    } catch (e) {
      console.error('[手机桥接] qrcode 模块加载失败:', e)
    }
  }

  get enabled(): boolean {
    return configStore.get('phoneBridgeEnabled')
  }

  get connected(): boolean {
    return this.clients.size > 0
  }

  get connectedCount(): number {
    return this.clients.size
  }

  get port(): number {
    return configStore.get('phonePort')
  }

  // ==================== 生命周期 ====================
  async start(): Promise<void> {
    if (this.httpServer) return
    if (!this.enabled) return

    // 手机页面
    let pageHtml = ''
    try {
      pageHtml = readFileSync(
        join(app.getAppPath(), 'resources', 'phone', 'index.html'),
        'utf-8'
      )
    } catch (e) {
      console.error('[手机桥接] 读取手机页面失败:', e)
    }

    // 自签名证书（缓存于 userData，复用）
    const cert = await this.ensureCert()

    this.httpServer = https.createServer({ key: cert.private, cert: cert.cert }, (req, res) => {
      if (req.url === '/') {
        // 禁止缓存，确保手机每次拿到最新页面（否则改了"按住说话"逻辑后手机仍用旧缓存）
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
          'Pragma': 'no-cache',
          'Expires': '0'
        })
        // 语言在每次请求时注入（而不是启动时写死）：切换语言后手机刷新页面即可生效，
        // 无需重启桥接服务
        res.end(pageHtml.replace('__OPS_LANG__', getLang()))
      } else {
        res.writeHead(404)
        res.end()
      }
    })

    this.wss = new WebSocketServer({ server: this.httpServer, path: '/ws' })
    this.wss.on('connection', (ws) => this.handleConnection(ws))

    await new Promise<void>((resolve, reject) => {
      const onError = (e: Error): void => reject(e)
      this.httpServer!.once('error', onError)
      this.httpServer!.listen(this.port, '0.0.0.0', () => {
        this.httpServer!.removeListener('error', onError)
        resolve()
      })
    })
    console.log(
      `[手机桥接] 🚀 已启动 https://${this.getLanIps()[0] ?? 'localhost'}:${this.port}（手机浏览器打开并信任证书）`
    )
    // 每次启动都重新生成最新手机地址与二维码，并广播给设置面板刷新
    this.refreshAndBroadcast()
  }

  /** 重新生成最新手机地址与二维码并广播给所有窗口（设置面板收到后刷新展示） */
  private refreshAndBroadcast(): void {
    void this.getInfo()
      .then((info) => {
        this.notifyStatus(info)
      })
      .catch(() => this.notifyStatus())
  }

  stop(): void {
    try {
      this.wss?.close()
    } catch {
      /* ignore */
    }
    try {
      this.httpServer?.close()
    } catch {
      /* ignore */
    }
    this.wss = null
    this.httpServer = null
    this.clients.clear()
    this.activeTalker = null
  }

  // ==================== 连接处理 ====================
  private handleConnection(ws: WebSocket): void {
    this.clients.add(ws)
    console.log(`[手机桥接] 📱 手机已连接（当前 ${this.clients.size} 台）`)
    // 手机在线：ASR 收的是用户主动"按住说话"，打断不需要回声过滤
    speechSession.setPhoneActive(true)
    ws.send(this.welcomeMsg())
    this.notifyStatus()

    ws.on('message', (data, isBinary) => {
      if (isBinary) {
        const buf = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer)
        this.onPhonePcm(buf, ws)
      } else {
        // 预留：文本协议（hello / ping 等）
        try {
          const msg = JSON.parse(data.toString())
          if (msg.type === 'hello') {
            ws.send(this.welcomeMsg())
          } else if (msg.type === 'ping') {
            ws.send(JSON.stringify({ type: 'pong', t: Date.now() }))
          } else if (msg.type === 'barge-in') {
            // 用户按住说话：发言锁协调后转发（按下即打断讲解）
            this.handleBargeIn(ws, msg.active === true)
          } else if (msg.type === 'remote') {
            // 手机遥控（播放/暂停/翻页/网页跳转）
            this.handleRemote(msg as { cmd?: string; index?: number })
          }
        } catch {
          /* ignore */
        }
      }
    })

    ws.on('close', () => {
      this.clients.delete(ws)
      this.releaseTalkerIfHeld(ws, '掉线')
      console.log(`[手机桥接] 📱 手机已断开（剩余 ${this.clients.size} 台）`)
      if (this.clients.size === 0) speechSession.setPhoneActive(false)
      this.notifyStatus()
    })
    ws.on('error', () => {
      this.clients.delete(ws)
      this.releaseTalkerIfHeld(ws, '出错')
      if (this.clients.size === 0) speechSession.setPhoneActive(false)
      this.notifyStatus()
    })
  }

  // ==================== 发言锁（多手机协调） ====================
  /**
   * 发言锁（先到先得）：多台手机同时按下时，第一台获得发言权并打断讲解；
   * 其他手机的按下被拒绝（下发 busy 提示），其松开与音频上行均被忽略。
   * 只有持锁者的松开才结束输入；持锁者掉线自动释放（防死锁）。
   */
  private handleBargeIn(ws: WebSocket, active: boolean): void {
    if (active) {
      if (this.activeTalker && this.activeTalker !== ws) {
        console.log('[手机桥接] ⛔ 发言权被占用，拒绝一台手机的按下')
        this.safeSend(ws, { type: 'busy' })
        return
      }
      if (this.activeTalker === ws) return // 重复按下（手机端 mousedown/touchstart 可能各触发一次）
      this.activeTalker = ws
      console.log(`[手机桥接] 🎙️ 一台手机获得发言权（在线 ${this.clients.size} 台）`)
      speechSession.bargeInFromButton(true)
      return
    }
    // 松开：只有持锁者的松开才结束输入；非持锁者的松开直接忽略
    if (this.activeTalker !== ws) return
    this.releaseTalkerIfHeld(ws, '松开')
  }

  /** 若 ws 持有发言锁则释放：视为输入结束，并通知其他手机"可以发言了" */
  private releaseTalkerIfHeld(ws: WebSocket, reason: string): void {
    if (this.activeTalker !== ws) return
    this.activeTalker = null
    console.log(`[手机桥接] 🎙️ 发言权释放（${reason}）`)
    speechSession.bargeInFromButton(false)
    this.broadcastJson({ type: 'free' })
  }

  private safeSend(ws: WebSocket, obj: unknown): void {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj))
  }

  /** 向所有在线手机广播 JSON 消息（不受音频输出开关影响，用于 busy/free 等协调信令） */
  private broadcastJson(obj: unknown): void {
    const s = JSON.stringify(obj)
    for (const ws of this.clients) {
      if (ws.readyState === WebSocket.OPEN) ws.send(s)
    }
  }

  // ==================== 手机遥控（播放/暂停/翻页） ====================
  /** 手机连接欢迎消息：采样率 + 当前讲解状态 */
  private welcomeMsg(): string {
    return JSON.stringify({
      type: 'welcome',
      sampleRate: TARGET_SAMPLE_RATE,
      state: tourEngine.state,
      orbVisible: !!windowManager.orbWindow?.isVisible()
    })
  }

  private handleRemote(msg: { cmd?: string; index?: number }): void {
    const cmd = msg.cmd
    if (cmd === 'pause') {
      tourEngine.remotePause()
    } else if (cmd === 'play') {
      tourEngine.remotePlay()
    } else if (cmd === 'next' || cmd === 'prev') {
      tourEngine.remoteSlide(cmd === 'next' ? 1 : -1)
    } else if (cmd === 'end') {
      // 结束播报：停止播报、关闭播报页面、回到初始化状态
      tourEngine.end()
    } else if (cmd === 'hidetray') {
      // 悬浮球托盘切换：显示时隐藏到托盘，隐藏时唤出主界面。
      // 讲解过程中禁止"隐藏"（讲解中断/观众找不到界面），但允许"唤出主界面"
      const tourActive = tourEngine.state !== 'idle' && tourEngine.state !== 'ended'
      if (tourActive && windowManager.orbWindow && !windowManager.orbWindow.isDestroyed() && windowManager.orbWindow.isVisible()) return
      windowManager.toggleOrbTray()
    }
  }

  // ==================== 上行（手机 → ASR） ====================
  private onPhonePcm(buf: Buffer, ws: WebSocket): void {
    // 发言锁：只接收持锁手机的音频，防止多人同时说话混进同一条 ASR 流
    if (this.activeTalker && this.activeTalker !== ws) return
    // 环形缓冲
    this.ring.push(buf)
    this.ringBytes += buf.length
    while (this.ringBytes > this.ringMaxBytes && this.ring.length > 0) {
      this.ringBytes -= this.ring.shift()!.length
    }
    // VAD 驱动 ASR 启动/打断
    this.vad.feed(new Int16Array(buf.buffer, buf.byteOffset, buf.length >> 1))
    // 喂给 ASR
    speechSession.onAudioFrame(buf)
  }

  /** ASR 就绪后补发手机缓冲（唤醒词等早期语音不丢失） */
  resendRing(): void {
    for (const b of this.ring.slice()) {
      speechSession.onAudioFrame(b)
    }
  }

  // ==================== 下行（TTS → 手机） ====================
  /**
   * 手机端语音输出开关。关闭时手机只作无线麦克风（上行采集照常），
   * 不再接收 TTS 音频帧与播放控制（不播电脑的语音回复）。
   */
  private get audioOutputEnabled(): boolean {
    return configStore.get('phoneAudioOutput')
  }

  private broadcastAudio(pcm: Buffer, sampleRate: number, seq: number): void {
    if (!this.audioOutputEnabled) return
    if (!this.clients.size) return
    const meta = JSON.stringify({ type: 'audio', sampleRate, seq })
    for (const ws of this.clients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(meta)
        ws.send(pcm)
      }
    }
  }

  private broadcastControl(action: string): void {
    if (!this.audioOutputEnabled) return
    if (!this.clients.size) return
    const msg = JSON.stringify({ type: 'control', action })
    for (const ws of this.clients) {
      if (ws.readyState === WebSocket.OPEN) ws.send(msg)
    }
  }

  // ==================== 信息查询 ====================
  /**
   * 局域网 IPv4 地址列表（去重；过滤虚拟网桥/链路本地）
   * 192.168.207.x / 192.168.233.x 这类通常是 WSL/Hyper-V/Docker 虚拟网桥，
   * 本机浏览器或真手机根本访问不到，必须过滤掉。
   */
  getLanIps(): string[] {
    const all = this.collectAllIps()
    if (all.length === 0) return []

    // 1. 优先取"看起来像真实网卡"的（白名单）
    const preferred = all.filter((x) => this.isPhysicalIface(x.name))
    if (preferred.length > 0) {
      return preferred.map((x) => x.ip)
    }

    // 2. 白名单没命中时，退回到"过滤掉所有虚拟/容器接口"
    return all.filter((x) => !this.isVirtualIface(x.name)).map((x) => x.ip)
  }

  /** 抓取所有非内部、非链路本地的 IPv4 */
  private collectAllIps(): { name: string; ip: string }[] {
    const out: { name: string; ip: string }[] = []
    const seen = new Set<string>()
    const ifaces = os.networkInterfaces()
    for (const name of Object.keys(ifaces)) {
      for (const iface of ifaces[name] ?? []) {
        if (iface.family !== 'IPv4' || iface.internal) continue
        if (iface.address.startsWith('169.254.')) continue
        if (seen.has(iface.address)) continue
        seen.add(iface.address)
        out.push({ name, ip: iface.address })
      }
    }
    return out
  }

  /** 判断是否像真实物理网卡（Windows: WLAN / Wi-Fi / 以太网；Linux: wlan* / eth* / en*） */
  private isPhysicalIface(name: string): boolean {
    const n = name.toLowerCase()
    // Windows 真实物理网卡常见名
    if (n.startsWith('wlan')) return true
    if (n.startsWith('wi-fi') || n.startsWith('wifi')) return true
    if (n.startsWith('wireless')) return true
    if (n.startsWith('以太网') && !/以太网\s*[2-9]/.test(name)) return true
    // Linux/macOS
    if (n.startsWith('eth') || n.startsWith('en') || n.startsWith('wl')) return true
    return false
  }

  /** 判断是否为虚拟网桥 / 容器接口（真手机不可达） */
  private isVirtualIface(name: string): boolean {
    const n = name.toLowerCase()
    // Windows 虚拟接口：Hyper-V 生成的"以太网 2/3/4..."通常是 WSL/Docker 桥
    if (/以太网\s*[2-9]/.test(name)) return true
    if (/以太网\s*\d{2,}/.test(name)) return true
    // 英文虚拟名
    if (n.includes('vethernet')) return true // Hyper-V 虚拟交换机
    if (n.includes('hyper-v')) return true
    if (n.includes('wsl')) return true
    if (n.includes('virtualbox')) return true
    if (n.includes('vmware')) return true
    if (n.includes('docker')) return true
    if (n.includes('veth')) return true // 容器虚拟网卡
    if (n.includes('br-')) return true // 网桥
    if (n.includes('bridge')) return true
    if (n.includes('tailscale')) return true
    if (n.includes('zerotier')) return true
    if (n.includes('wireguard')) return true
    if (n.includes('nordlynx')) return true
    if (n.startsWith('vmnet')) return true // VMware NAT
    if (n.startsWith('ppp')) return true
    if (n.startsWith('loopback')) return true
    if (n.startsWith('npcap')) return true
    if (n.startsWith('npf')) return true
    return false
  }

  /**
   * 计算最终要展示给用户的 URL 列表
   *  1. 127.0.0.1（首位，方便本机浏览器测试）
   *  2. 用户手动配置的 phoneHost（最高优先级，确认真实 Wi-Fi IP）
   *  3. 自动检测到的局域网 IP（已过滤虚拟接口）
   */
  buildDisplayUrls(): string[] {
    const list: string[] = []
    const seen = new Set<string>()
    const push = (ip: string): void => {
      if (!ip || seen.has(ip)) return
      seen.add(ip)
      list.push(`https://${ip}:${this.port}`)
    }
    push('127.0.0.1')
    const manual = (configStore.get('phoneHost') ?? '').trim()
    if (manual) push(manual)
    for (const ip of this.getLanIps()) push(ip)
    return list
  }

  /** 设置面板展示信息（含二维码） */
  async getInfo(): Promise<{
    enabled: boolean
    audioOutput: boolean
    port: number
    urls: string[]
    qrDataUrl: string
    connected: number
    error: string | null
    detectedIps: string[]
  }> {
    const detectedIps = this.getLanIps()
    const urls = this.buildDisplayUrls()
    let qrDataUrl = ''
    let error: string | null = null

    if (urls.length <= 1 && detectedIps.length === 0) {
      // 只有 127.0.0.1 时，提示用户
      error =
        t('phone.noLanIp')
      this.lastQrError = error
    } else {
      // 用第一个"真"IP（不是 127.0.0.1）做二维码
      const qrTarget = urls.find((u) => !u.includes('127.0.0.1')) ?? urls[0]
      try {
        qrDataUrl = await QRCode.toDataURL(qrTarget, {
          width: 240,
          margin: 1,
          errorCorrectionLevel: 'M',
          color: { dark: '#000000ff', light: '#ffffffff' }
        })
        this.lastQrError = null
        console.log(
          `[手机桥接] 二维码生成成功，url=${qrTarget} length=${qrDataUrl.length}`
        )
      } catch (e) {
        error = (e as Error).message ?? String(e)
        this.lastQrError = error
        console.error('[手机桥接] 二维码生成失败:', e)
      }
    }

    return {
      enabled: this.enabled,
      audioOutput: this.audioOutputEnabled,
      port: this.port,
      urls,
      qrDataUrl,
      connected: this.clients.size,
      error,
      detectedIps
    }
  }

  private notifyStatus(info?: {
    enabled: boolean
    audioOutput: boolean
    port: number
    urls: string[]
    qrDataUrl: string
    connected: number
    error: string | null
    detectedIps: string[]
  }): void {
    const { BrowserWindow } = require('electron') as typeof import('electron')
    const payload = info ?? { connected: this.clients.size }
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send(IPC.Phone.Status, payload)
      }
    }
  }

  // ==================== 证书 ====================
  private async ensureCert(): Promise<{ private: string; cert: string }> {
    const dir = app.getPath('userData')
    const file = join(dir, 'phone-cert.json')
    try {
      if (existsSync(file)) {
        const cached = JSON.parse(readFileSync(file, 'utf-8')) as {
          private: string
          cert: string
        }
        if (cached.private && cached.cert) return cached
      }
    } catch {
      /* 证书损坏则重新生成 */
    }
    const pems = await generateCert(
      [{ name: 'commonName', value: 'huashun-phone' }],
      { keySize: 2048, algorithm: 'sha256' }
    )
    const result = { private: pems.private, cert: pems.cert }
    try {
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
      writeFileSync(file, JSON.stringify(result), 'utf-8')
    } catch (e) {
      console.error('[手机桥接] 证书缓存失败（不影响本次运行）:', e)
    }
    return result
  }
}

export const phoneBridgeServer = new PhoneBridgeServer()
