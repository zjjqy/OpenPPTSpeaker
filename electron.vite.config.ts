import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'node:path'
import { readFileSync } from 'node:fs'

/**
 * 应用版本号：唯一来源是 package.json，构建时注入为 __APP_VERSION__ 常量。
 * 主进程启动横幅、预加载层、设置页徽章三处共用，避免硬编码版本各自漂移。
 */
const appVersion = JSON.parse(
  readFileSync(resolve(__dirname, 'package.json'), 'utf-8')
).version as string
const define = { __APP_VERSION__: JSON.stringify(appVersion) }

export default defineConfig({
  main: {
    // mpg123-decoder 是纯 ESM 包，主进程产物为 CJS（require 会抛 ERR_REQUIRE_ESM），
    // 故排除外部化，由 Rollup 打包进 out/main（WASM 已内嵌 base64，无额外文件）
    plugins: [externalizeDepsPlugin({ exclude: ['mpg123-decoder', '@wasm-audio-decoders/common'] })],
    define,
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'shared')
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    define,
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'shared')
      }
    }
  },
  renderer: {
    plugins: [vue()],
    define,
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'shared'),
        '@renderer': resolve(__dirname, 'src/renderer/src')
      }
    },
    build: {
      rollupOptions: {
        input: {
          orb: resolve(__dirname, 'src/renderer/orb.html'),
          subtitle: resolve(__dirname, 'src/renderer/subtitle.html'),
          audio: resolve(__dirname, 'src/renderer/audio.html'),
          settings: resolve(__dirname, 'src/renderer/settings.html'),
          ppt: resolve(__dirname, 'src/renderer/ppt.html'),
          'pdf-render': resolve(__dirname, 'src/renderer/pdf-render.html'),
          'video-render': resolve(__dirname, 'src/renderer/video-render.html')
        }
      }
    }
  }
})
