#!/usr/bin/env node
/**
 * 把本地 release/ 下打包好的安装包发布到 Gitee 的「发行版」。
 *
 * 为什么不用 GitHub Actions 自动做：
 *   GitHub 的 runner 在海外，向 Gitee 上传 90 MB+ 安装包实测约 0.08 MB/s，
 *   一次要二十多分钟且容易失败。从国内本地上传是几 MB/s，几十秒就完事。
 *   （对应的备用工作流见 .github/workflows/mirror-release-to-gitee.yml）
 *
 * 用法：
 *   npm run publish:gitee              # 用最近一次 tag
 *   npm run publish:gitee -- v1.0.2    # 指定 tag
 *
 * 令牌来源（任选其一）：
 *   1. 环境变量 GITEE_TOKEN
 *   2. 项目根目录的 .gitee-token 文件（已加入 .gitignore）
 *   令牌需勾选 projects 权限。用户名/仓库名可用 GITEE_USER / GITEE_REPO 覆盖。
 */

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'

const OWNER = process.env.GITEE_USER || 'zjjqy'
const REPO = process.env.GITEE_REPO || 'open-pptspeaker'
const API = `https://gitee.com/api/v5/repos/${OWNER}/${REPO}`
const MAX_ATTACH = 100 * 1024 * 1024 // Gitee 单个附件上限

function readToken() {
  if (process.env.GITEE_TOKEN) return process.env.GITEE_TOKEN.trim()
  const file = join(process.cwd(), '.gitee-token')
  if (existsSync(file)) return readFileSync(file, 'utf8').trim()
  console.error('❌ 没有找到 Gitee 令牌。')
  console.error('   请设置环境变量 GITEE_TOKEN，或在项目根目录创建 .gitee-token 并写入令牌。')
  process.exit(1)
}

async function gitee(url, init) {
  const res = await fetch(url, init)
  const text = await res.text()
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`Gitee 返回了非 JSON 内容（HTTP ${res.status}）：${text.slice(0, 300)}`)
  }
}

const TOKEN = readToken()
const tag =
  process.argv[2] ||
  execFileSync('git', ['describe', '--tags', '--abbrev=0'], { encoding: 'utf8' }).trim()
const version = tag.replace(/^v/, '')
const auth = `access_token=${encodeURIComponent(TOKEN)}`

console.log(`同步 ${tag} → gitee.com/${OWNER}/${REPO}`)

// ---------- 1. 收集产物 ----------
const artifact = `OpenPPTSpeaker-${version}-setup.exe`
const files = [artifact, `${artifact}.blockmap`]
  .map((n) => join('release', n))
  .filter((p) => {
    if (existsSync(p)) return true
    console.warn(`  跳过（文件不存在）：${p}`)
    return false
  })

if (files.length === 0) {
  console.error(`❌ release/ 下没有 ${version} 的产物，请先运行：npm run package:win`)
  process.exit(1)
}

// ---------- 2. 找发行版，没有就创建 ----------
const notes = `RELEASE_NOTES_${tag}.md`
const body = existsSync(notes) ? readFileSync(notes, 'utf8') : `OpenPPTSpeaker ${tag}`

const list = await gitee(`${API}/releases?${auth}&per_page=100`)
let release = Array.isArray(list) ? list.find((r) => r.tag_name === tag) : undefined

if (release) {
  console.log(`复用 Gitee 上已有的发行版（id=${release.id}）`)
} else {
  console.log(`Gitee 上还没有 ${tag} 的发行版，创建中…`)
  release = await gitee(`${API}/releases`, {
    method: 'POST',
    body: new URLSearchParams({
      access_token: TOKEN,
      tag_name: tag,
      name: `OpenPPTSpeaker ${tag}`,
      body,
      target_commitish: 'main'
    })
  })
  if (!release?.id) {
    throw new Error(`创建发行版失败：${JSON.stringify(release).slice(0, 300)}`)
  }
}
const releaseId = release.id

// ---------- 3. 删掉同名旧附件 ----------
// 否则重复执行会在 Gitee 上堆出多份同名附件。
const existing = await gitee(`${API}/releases/${releaseId}/attach_files?${auth}&per_page=100`)
for (const f of files) {
  const name = basename(f)
  const dup = Array.isArray(existing) ? existing.find((a) => a.name === name) : undefined
  if (!dup) continue
  console.log(`删除 Gitee 上的同名旧附件 ${name}（id=${dup.id}）`)
  const res = await fetch(`${API}/releases/${releaseId}/attach_files/${dup.id}?${auth}`, {
    method: 'DELETE'
  })
  if (!res.ok) console.warn(`  删除失败（HTTP ${res.status}），继续`)
}

// ---------- 4. 上传 ----------
for (const f of files) {
  const name = basename(f)
  const size = statSync(f).size
  if (size > MAX_ATTACH) {
    console.warn(`跳过 ${name}：${(size / 1048576).toFixed(1)} MB，超过 Gitee 单附件 100 MB 上限`)
    continue
  }

  console.log(`上传 ${name}（${(size / 1048576).toFixed(1)} MB）…`)
  const started = Date.now()
  const form = new FormData()
  form.append('access_token', TOKEN)
  form.append('file', new Blob([readFileSync(f)]), name)

  const out = await gitee(`${API}/releases/${releaseId}/attach_files`, {
    method: 'POST',
    body: form
  })
  const secs = (Date.now() - started) / 1000

  if (out?.name) {
    console.log(`  ✅ ${out.name}（耗时 ${secs.toFixed(1)}s）`)
  } else {
    console.warn(`  ⚠️ 返回：${JSON.stringify(out).slice(0, 300)}`)
  }
}

console.log(`✅ 完成：https://gitee.com/${OWNER}/${REPO}/releases`)
