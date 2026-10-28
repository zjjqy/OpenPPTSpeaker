#!/usr/bin/env node
/**
 * Edge「大声朗读」连通性探针 —— 维护工具，不打进安装包（electron-builder 的 files 不含 scripts/）。
 *
 * 什么时候用：
 *   微软会不定时收紧鉴权（换 Chromium 版本号、换 Sec-MS-GEC 算法），表现都是
 *   **合成不出音频 / 报 403**。改完 src/main/speech/TtsEngine.ts 里的常量或算法后，
 *   先跑这个脚本确认能建连并真的收到音频，再去动应用代码。
 *
 * 用法：
 *   node scripts/edge-tts-probe.cjs                    # 用默认版本号
 *   node scripts/edge-tts-probe.cjs 2-143.0.3650.96    # 指定 Sec-MS-GEC-Version
 *
 * 判定：
 *   ✅ 建连成功 + 收到音频  → 常量与算法都对
 *   ❌ 握手被拒 HTTP 403    → 版本号或令牌算法过期，去对比：
 *        - https://github.com/rany2/edge-tts (src/edge_tts/constants.py + drm.py)
 *        - https://github.com/Migushthe2nd/MsEdgeTTS (dist/SecMsGec.js)
 *   ⌛ 超时                 → 网络不通，不是鉴权问题
 */
const WebSocket = require('ws')
const { createHash, randomUUID } = require('crypto')

const TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4'
const VERSION = process.argv[2] || '2-143.0.3650.96'
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0'

// ==================== v2 令牌算法 ====================
// 与 src/main/speech/TtsEngine.ts 保持一致；哈希输入前的版权声明是 v2 的关键。
const EDGE_COPYRIGHT = 'Copyright (C) Microsoft Corporation. All rights reserved.'
const SWAP_FIRST = { word: 0xef0569fb, sum: 0x76f50f34, product: 0xc3efea97 }
const SWAP_SECOND = { word: 0xc31713db, sum: 0x1881ce3c, product: 0x35bd1ec9 }
const MIX_FIRST = [0xcf98b111, 0x87085b9f, 0x12ceb96d, 0x257e1d83]
const MIX_SECOND = [0xa27416f5, 0xd38396ff, 0x7c932b89, 0xbfa49f69]

const swapHalves = (v) => ((v << 16) | (v >>> 16)) >>> 0

function swapTerm(word, key, m) {
  const sum = Math.imul(word, key) + Math.imul(swapHalves(word), m.word)
  const product = Math.imul(swapHalves(sum), m.sum) >>> 0
  return (Math.imul(swapHalves(product), m.product) + product) >>> 0
}

function swapAndMultiply(value, multipliers) {
  let v = value
  for (const m of multipliers) v = Math.imul(swapHalves(v), m) >>> 0
  return v
}

function cs64(message, digest) {
  const keyA = (digest.readUInt32LE(0) | 1) >>> 0
  const keyB = (digest.readUInt32LE(4) | 1) >>> 0
  const padded = Buffer.alloc(Math.ceil(message.length / 8) * 8)
  message.copy(padded)
  let swapSum = 0
  let lastSwap = 0
  let mix = 0
  let mixSum = 0
  for (let off = 0; off < padded.length; off += 8) {
    const w0 = padded.readUInt32LE(off)
    const w1 = padded.readUInt32LE(off + 4)
    lastSwap = swapTerm(w1, keyB, SWAP_SECOND)
    swapSum = (swapSum + swapTerm(w0, keyA, SWAP_FIRST) + lastSwap) >>> 0
    mix = swapAndMultiply(Math.imul((mix + w0) | 0, keyA), MIX_FIRST)
    mixSum = (mixSum + mix) >>> 0
    mix = swapAndMultiply(Math.imul((mix + w1) | 0, keyB), MIX_SECOND)
    mixSum = (mixSum + mix) >>> 0
  }
  const out = Buffer.alloc(8)
  out.writeUInt32LE((lastSwap ^ mix) >>> 0, 0)
  out.writeUInt32LE((swapSum ^ mixSum) >>> 0, 4)
  return out
}

function secMsGecV2() {
  const ticks = Math.floor(Date.now() / 1000) + 11644473600
  const rounded = ticks - (ticks % 300)
  const windowsTicks = rounded * 10000000
  const message = Buffer.from(`${EDGE_COPYRIGHT}${windowsTicks}${TOKEN}`, 'utf8')
  const digest = createHash('sha256').update(message).digest()
  return `${cs64(message, digest).toString('hex').toUpperCase()}-${digest.toString('hex').toUpperCase()}`
}

// ==================== 建连 + 真实合成 ====================
const gec = secMsGecV2()
const url =
  'wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1' +
  `?TrustedClientToken=${TOKEN}&Sec-MS-GEC=${gec}&Sec-MS-GEC-Version=${VERSION}` +
  `&ConnectionId=${randomUUID().replace(/-/g, '')}`

console.log('Sec-MS-GEC-Version:', VERSION)
console.log('GEC:', gec.slice(0, 20) + '…（长度 ' + gec.length + '）')

let audioBytes = 0
const ws = new WebSocket(url, {
  headers: {
    'User-Agent': UA,
    Origin: 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
    Pragma: 'no-cache',
    'Cache-Control': 'no-cache',
    'Accept-Encoding': 'gzip, deflate, br, zstd',
    'Accept-Language': 'en-US,en;q=0.9'
  }
})

ws.on('open', () => {
  console.log('✅ 建连成功（101）')

  // 1) speech.config
  ws.send(
    'X-Timestamp:' + new Date().toISOString() + '\r\n' +
      'Content-Type:application/json; charset=utf-8\r\n' +
      'Path:speech.config\r\n\r\n' +
      JSON.stringify({
        context: {
          synthesis: {
            audio: {
              metadataoptions: { sentenceBoundaryEnabled: 'false', wordBoundaryEnabled: 'false' },
              outputFormat: 'audio-24khz-48kbitrate-mono-mp3'
            }
          }
        }
      })
  )

  // 2) SSML
  const ssml =
    `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xmlns:mstts='https://www.w3.org/2001/mstts' xml:lang='zh-CN'>` +
    `<voice name='zh-CN-XiaoxiaoNeural'><prosody pitch='+0Hz' rate='+0%' volume='+0%'>你好，这是一次语音合成连通性测试。</prosody></voice></speak>`
  ws.send(
    'X-RequestId:' + randomUUID().replace(/-/g, '') + '\r\n' +
      'Content-Type:application/ssml+xml\r\n' +
      'X-Timestamp:' + new Date().toISOString() + '\r\n' +
      'Path:ssml\r\n\r\n' + ssml
  )
})

ws.on('message', (data, isBinary) => {
  if (isBinary) {
    // 二进制帧：2 字节大端头长 + 文本头 + MP3 载荷
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data)
    const headerLen = buf.readUInt16BE(0)
    audioBytes += Math.max(0, buf.length - 2 - headerLen)
    return
  }
  const txt = data.toString()
  if (txt.includes('Path:turn.end')) {
    if (audioBytes > 0) {
      console.log(`✅ 合成成功，收到音频 ${audioBytes} 字节（${(audioBytes / 1024).toFixed(1)} KB MP3）`)
    } else {
      console.log('⚠️ 协议走通了，但没有收到音频数据')
    }
    ws.close()
    process.exit(0)
  }
})

ws.on('unexpected-response', (_req, res) => {
  console.log('❌ 握手被拒：HTTP', res.statusCode)
  let body = ''
  res.on('data', (d) => (body += d))
  res.on('end', () => {
    console.log('响应体:', (body || '(空)').slice(0, 400))
    process.exit(0)
  })
})

ws.on('error', (e) => {
  console.log('❌ 连接错误:', e.message)
  process.exit(0)
})

setTimeout(() => {
  console.log('⌛ 30 秒超时（已收音频 ' + audioBytes + ' 字节）')
  process.exit(0)
}, 30000)
