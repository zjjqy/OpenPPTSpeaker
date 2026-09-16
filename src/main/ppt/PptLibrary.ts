/**
 * PPT 库：维护用户导入的多份 PPT（每份 = 一个目录：页面图片 + 可控 index.html + 演讲稿.json）。
 *
 * 存储位置：userData/ppt-library/
 *   decks.json            列表 + activeDeckId
 *   <deckId>/slides/NNN.png  页面图片
 *   <deckId>/index.html      生成的可控演示页
 *   <deckId>/演讲稿.json      v2 演讲稿（可选）
 *   <deckId>/page-texts.json PDF 导入时提取的逐页文本（供讲稿生成/问答素材）
 *
 * 注意：userData 可写（resources/ 打包后在只读 asar 旁，不适合写），因此库不放 resourcesRoot。
 */

import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, readdirSync, copyFileSync } from 'fs'
import { join, basename } from 'path'
import type { PptDeckMeta, PptLibraryFile, DeckScriptV2 } from '@shared/ppt'

/** 内置演示（introduceProduction）在列表中的固定 id */
export const BUILTIN_DECK_ID = 'builtin'

class PptLibrary {
  private rootDir = ''
  private data: PptLibraryFile = { activeDeckId: null, decks: [] }

  init(): void {
    this.rootDir = join(app.getPath('userData'), 'ppt-library')
    mkdirSync(this.rootDir, { recursive: true })
    const file = join(this.rootDir, 'decks.json')
    if (existsSync(file)) {
      try {
        this.data = JSON.parse(readFileSync(file, 'utf-8')) as PptLibraryFile
      } catch {
        /* 损坏则重建 */
      }
    }
    // 内置演示始终存在且排最前
    if (!this.data.decks.some((d) => d.id === BUILTIN_DECK_ID)) {
      this.data.decks.unshift({
        id: BUILTIN_DECK_ID,
        name: '内置演示（智慧消防）',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        slideCount: 0,
        hasScript: true,
        source: 'builtin'
      })
    }
    if (!this.data.activeDeckId) this.data.activeDeckId = BUILTIN_DECK_ID
    this.persist()
  }

  private persist(): void {
    writeFileSync(join(this.rootDir, 'decks.json'), JSON.stringify(this.data, null, 2))
  }

  list(): PptDeckMeta[] {
    // 动态刷新 hasScript（外部可能直接改了文件）
    for (const d of this.data.decks) {
      if (d.source === 'builtin') continue
      d.hasScript = existsSync(this.scriptPath(d.id))
      d.slideCount = this.countSlides(d.id)
    }
    return this.data.decks
  }

  get(id: string): PptDeckMeta | undefined {
    return this.list().find((d) => d.id === id)
  }

  getActiveId(): string {
    return this.data.activeDeckId ?? BUILTIN_DECK_ID
  }

  setActive(id: string): void {
    if (!this.get(id)) throw new Error(`PPT 不存在: ${id}`)
    this.data.activeDeckId = id
    this.persist()
  }

  /** 创建新 PPT 条目并返回目录信息（图片由调用方写入） */
  create(name: string, source: 'pdf' | 'images'): PptDeckMeta {
    const id = `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
    mkdirSync(this.slidesDir(id), { recursive: true })
    const meta: PptDeckMeta = {
      id,
      name: name || '未命名演示',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      slideCount: 0,
      hasScript: false,
      source
    }
    this.data.decks.push(meta)
    this.persist()
    return meta
  }

  rename(id: string, name: string): void {
    const d = this.get(id)
    if (!d) throw new Error(`PPT 不存在: ${id}`)
    if (d.source === 'builtin') throw new Error('内置演示不可重命名')
    d.name = name.trim() || d.name
    d.updatedAt = new Date().toISOString()
    this.persist()
  }

  delete(id: string): void {
    const d = this.get(id)
    if (!d) throw new Error(`PPT 不存在: ${id}`)
    if (d.source === 'builtin') throw new Error('内置演示不可删除')
    rmSync(this.dir(id), { recursive: true, force: true })
    this.data.decks = this.data.decks.filter((x) => x.id !== id)
    if (this.data.activeDeckId === id) this.data.activeDeckId = BUILTIN_DECK_ID
    this.persist()
  }

  touch(id: string): void {
    const d = this.data.decks.find((x) => x.id === id)
    if (d) {
      d.updatedAt = new Date().toISOString()
      this.persist()
    }
  }

  // ---------- 路径 ----------
  dir(id: string): string {
    return join(this.rootDir, id)
  }
  slidesDir(id: string): string {
    return join(this.dir(id), 'slides')
  }
  htmlPath(id: string): string {
    return join(this.dir(id), 'index.html')
  }
  scriptPath(id: string): string {
    return join(this.dir(id), '演讲稿.json')
  }
  pageTextsPath(id: string): string {
    return join(this.dir(id), 'page-texts.json')
  }
  thumbPath(id: string): string {
    const p = join(this.slidesDir(id), '001.png')
    return existsSync(p) ? p : ''
  }

  slideImagePath(id: string, slideNo: number): string {
    return join(this.slidesDir(id), `${String(slideNo).padStart(3, '0')}.png`)
  }

  private countSlides(id: string): number {
    const dir = this.slidesDir(id)
    if (!existsSync(dir)) return 0
    return readdirSync(dir).filter((f) => /\.png$/i.test(f)).length
  }

  /** 写入一页图片（PNG buffer），并维护 slideCount */
  writeSlideImage(id: string, slideNo: number, png: Buffer): void {
    writeFileSync(this.slideImagePath(id, slideNo), png)
    this.touch(id)
  }

  /** 图片导入：把外部图片文件复制进库，返回页数 */
  importImages(id: string, files: string[]): number {
    files.forEach((f, i) => copyFileSync(f, this.slideImagePath(id, i + 1)))
    this.touch(id)
    return files.length
  }

  // ---------- 演讲稿读写 ----------
  readScript(id: string): DeckScriptV2 | null {
    const p = this.scriptPath(id)
    if (!existsSync(p)) return null
    try {
      const raw = JSON.parse(readFileSync(p, 'utf-8').replace(/^﻿/, ''))
      if (raw?.version === 2 && Array.isArray(raw.slides)) return raw as DeckScriptV2
      return null
    } catch {
      return null
    }
  }

  writeScript(id: string, script: DeckScriptV2): void {
    script.meta.updatedAt = new Date().toISOString()
    writeFileSync(this.scriptPath(id), JSON.stringify(script, null, 2))
    this.touch(id)
  }

  /** 逐页文本（PDF 文本层），供讲稿生成与问答素材 */
  writePageTexts(id: string, texts: string[]): void {
    writeFileSync(this.pageTextsPath(id), JSON.stringify(texts))
  }
  readPageTexts(id: string): string[] {
    const p = this.pageTextsPath(id)
    if (!existsSync(p)) return []
    try {
      return JSON.parse(readFileSync(p, 'utf-8')) as string[]
    } catch {
      return []
    }
  }

  writeHtml(id: string, html: string): void {
    writeFileSync(this.htmlPath(id), html)
    this.touch(id)
  }

  baseName(p: string): string {
    return basename(p)
  }
}

export const pptLibrary = new PptLibrary()
