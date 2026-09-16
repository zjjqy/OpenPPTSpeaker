/**
 * 品牌图标生成脚本（无需第三方依赖，使用 Electron 的 nativeImage 抗锯齿缩放）
 *
 * 图形：OpenPPTSpeaker 的能量球 mark —— 蓝紫径向渐变 + 中心高光，与 UI 强调色一致。
 * 产出：
 *   assets/icon.png          512×512  应用图标（备用）
 *   assets/icon.ico          多尺寸 ICO（256/128/64/48/32/24/16，PNG 压缩）
 *   assets/tray-icon.png     32×32    托盘图标
 *   assets/tray-icon@2x.png  64×64    高分屏托盘图标
 *
 * 运行：node_modules\.bin\electron.cmd assets\generate-icons.js
 */
const { nativeImage } = require('electron')
const fs = require('fs')
const path = require('path')

/** 品牌色（与 renderer tokens 一致）：高光 → 强调 → 深强调 */
const C_LIGHT = [143, 182, 255] // #8fb6ff
const C_ACCENT = [61, 126, 255] // #3d7eff
const C_DEEP = [42, 100, 232] // #2a64e8

/**
 * 以 4 倍超采样绘制能量球，再由 nativeImage 缩放到目标尺寸（得到平滑边缘）。
 * @param {number} size 输出边长（px）
 */
function renderOrb(size) {
  const SS = 4
  const S = size * SS
  const buf = Buffer.alloc(S * S * 4)
  const cx = S / 2
  const cy = S / 2
  const r = S / 2 - SS * 0.5
  const lx = cx - r * 0.36
  const ly = cy - r * 0.44

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy)
      if (d > r) continue // 圆外透明

      // 渐变：沿"高光中心"的距离
      const t = Math.min(1, Math.hypot(x + 0.5 - lx, y + 0.5 - ly) / (r * 1.6))
      let cr, cg, cb
      if (t < 0.5) {
        const k = t / 0.5
        cr = C_LIGHT[0] + (C_ACCENT[0] - C_LIGHT[0]) * k
        cg = C_LIGHT[1] + (C_ACCENT[1] - C_LIGHT[1]) * k
        cb = C_LIGHT[2] + (C_ACCENT[2] - C_LIGHT[2]) * k
      } else {
        const k = (t - 0.5) / 0.5
        cr = C_ACCENT[0] + (C_DEEP[0] - C_ACCENT[0]) * k
        cg = C_ACCENT[1] + (C_DEEP[1] - C_ACCENT[1]) * k
        cb = C_ACCENT[2] + (C_DEEP[2] - C_ACCENT[2]) * k
      }

      // 中心高光
      const hl = Math.max(0, 1 - Math.hypot(x + 0.5 - lx, y + 0.5 - ly) / (r * 0.72))
      const w = hl * hl * 0.55
      buf[i] = Math.round(cr + (255 - cr) * w)
      buf[i + 1] = Math.round(cg + (255 - cg) * w)
      buf[i + 2] = Math.round(cb + (255 - cb) * w)
      buf[i + 3] = 255
    }
  }

  const big = nativeImage.createFromBuffer(buf, { width: S, height: S })
  return big.resize({ width: size, height: size, quality: 'best' })
}

/** 拼装 ICO（ICONDIR + N×ICONDIRENTRY + PNG 数据，Vista+ 支持 PNG 压缩条目） */
function buildIco(entries) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(entries.length, 4)

  const dirs = []
  let offset = 6 + entries.length * 16
  const blobs = []
  for (const { size, data } of entries) {
    const e = Buffer.alloc(16)
    e.writeUInt8(size >= 256 ? 0 : size, 0)
    e.writeUInt8(size >= 256 ? 0 : size, 1)
    e.writeUInt8(0, 2)
    e.writeUInt8(0, 3)
    e.writeUInt16LE(1, 4)
    e.writeUInt16LE(32, 6)
    e.writeUInt32LE(data.length, 8)
    e.writeUInt32LE(offset, 12)
    dirs.push(e)
    blobs.push(data)
    offset += data.length
  }
  return Buffer.concat([header, ...dirs, ...blobs])
}

const outDir = __dirname
const icoSizes = [256, 128, 64, 48, 32, 24, 16]

const iconPng = renderOrb(512).toPNG()
const ico = buildIco(icoSizes.map((s) => ({ size: s, data: renderOrb(s).toPNG() })))
const tray = renderOrb(32).toPNG()
const tray2x = renderOrb(64).toPNG()

fs.writeFileSync(path.join(outDir, 'icon.png'), iconPng)
fs.writeFileSync(path.join(outDir, 'icon.ico'), ico)
fs.writeFileSync(path.join(outDir, 'tray-icon.png'), tray)
fs.writeFileSync(path.join(outDir, 'tray-icon@2x.png'), tray2x)

console.log('品牌图标已生成:')
console.log('  assets/icon.png          512x512', iconPng.length, 'bytes')
console.log('  assets/icon.ico          ', icoSizes.join('/'), 'px,', ico.length, 'bytes')
console.log('  assets/tray-icon.png     32x32', tray.length, 'bytes')
console.log('  assets/tray-icon@2x.png  64x64', tray2x.length, 'bytes')
process.exit(0)
