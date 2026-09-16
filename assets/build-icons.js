/**
 * 图标构建脚本（用 Electron 的 nativeImage 处理 PNG，无需额外依赖）
 * 用法: node_modules\.bin\electron.cmd assets\build-icons.js <源图路径>
 * 产出:
 *   assets/icon.ico      多尺寸 ICO（16/24/32/48/64/128/256，PNG 压缩，Vista+ 通用）
 *   assets/icon.png      256x256（备用）
 *   assets/tray-icon.png 32x32 托盘图标
 */
const { nativeImage } = require('electron')
const fs = require('fs')
const path = require('path')

const src = process.argv[2]
if (!src || !fs.existsSync(src)) {
  console.error('用法: electron assets/build-icons.js <源图路径>')
  process.exit(1)
}

let img = nativeImage.createFromPath(src)
if (img.isEmpty()) {
  console.error('源图加载失败:', src)
  process.exit(1)
}

// 居中裁剪 87.5%：去掉边缘（AI 生成图右下角常带水印），主体保持居中
const { width, height } = img.getSize()
const side = Math.floor(Math.min(width, height) * 0.875)
img = img.crop({
  x: Math.floor((width - side) / 2),
  y: Math.floor((height - side) / 2),
  width: side,
  height: side
})

// 1) 各尺寸 PNG
const sizes = [256, 128, 64, 48, 32, 24, 16]
const pngs = sizes.map((s) => ({ size: s, data: img.resize({ width: s, height: s, quality: 'best' }).toPNG() }))

// 2) 拼装 ICO：ICONDIR + N×ICONDIRENTRY + PNG 数据（PNG 压缩条目，Vista+ 支持）
const header = Buffer.alloc(6)
header.writeUInt16LE(0, 0) // reserved
header.writeUInt16LE(1, 2) // type = icon
header.writeUInt16LE(pngs.length, 4)

const entries = []
let offset = 6 + pngs.length * 16
const blobs = []
for (const { size, data } of pngs) {
  const e = Buffer.alloc(16)
  e.writeUInt8(size >= 256 ? 0 : size, 0) // 0 表示 256
  e.writeUInt8(size >= 256 ? 0 : size, 1)
  e.writeUInt8(0, 2) // 调色板
  e.writeUInt8(0, 3) // reserved
  e.writeUInt16LE(1, 4) // planes
  e.writeUInt16LE(32, 6) // bpp
  e.writeUInt32LE(data.length, 8)
  e.writeUInt32LE(offset, 12)
  entries.push(e)
  blobs.push(data)
  offset += data.length
}
const ico = Buffer.concat([header, ...entries, ...blobs])

const outDir = __dirname
fs.writeFileSync(path.join(outDir, 'icon.ico'), ico)
fs.writeFileSync(path.join(outDir, 'icon.png'), pngs[0].data)
fs.writeFileSync(path.join(outDir, 'tray-icon.png'), img.resize({ width: 32, height: 32, quality: 'best' }).toPNG())

console.log('已生成:')
console.log('  assets/icon.ico     ', ico.length, 'bytes,', sizes.join('/'), 'px')
console.log('  assets/icon.png      256x256')
console.log('  assets/tray-icon.png 32x32')
process.exit(0)
