/** PPT 操控模块（Windows PowerShell COM）—— 迁移自旧版 src/ppt-control.js */

import { execSync } from 'node:child_process'
import { resolve } from 'node:path'
import { t } from '@shared/i18n'

export interface PptResult {
  success: boolean
  slideCount?: number
  current?: number
  total?: number
  error?: string
}

let slideCount = 0
let currentSlide = 0

function run(script: string, timeout = 10000): string {
  return execSync(`powershell -NoProfile -Command "${script}"`, {
    encoding: 'utf-8',
    timeout,
    windowsHide: true
  })
}

/** 打开 PPT 并获取幻灯片数量 */
export function openPPT(filePath: string): PptResult {
  try {
    const absPath = resolve(filePath)
    const script = `
      $ppt = New-Object -ComObject PowerPoint.Application;
      $ppt.Visible = 1;
      $pres = $ppt.Presentations.Open('${absPath.replace(/'/g, "''")}');
      $count = $pres.Slides.Count;
      Write-Output $count;
    `
    const result = run(script, 15000)
    slideCount = parseInt(result.trim())
    currentSlide = 1
    return { success: true, slideCount }
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
}

/** 跳转到指定幻灯片（1 起） */
export function goToSlide(slideNum: number): PptResult {
  try {
    const script = `
      $ppt = [Runtime.InteropServices.Marshal]::GetActiveObject('PowerPoint.Application');
      if ($ppt.Presentations.Count -gt 0) {
        $pres = $ppt.Presentations(1);
        if ($pres.Slides.Count -ge ${slideNum}) {
          $pres.SlideShowWindow.View.GotoSlide(${slideNum});
          Write-Output 'ok';
        }
      }
    `
    run(script)
    currentSlide = slideNum
    return { success: true, current: slideNum, total: slideCount }
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
}

export function prevSlide(): PptResult {
  if (currentSlide <= 1) return { success: false, error: t('ctrl.firstSlide') }
  return goToSlide(currentSlide - 1)
}

export function nextSlide(): PptResult {
  if (currentSlide >= slideCount) return { success: false, error: t('ctrl.lastSlide') }
  return goToSlide(currentSlide + 1)
}

export function getSlideTitle(slideNum: number): { success: boolean; title?: string } {
  try {
    const script = `
      $ppt = [Runtime.InteropServices.Marshal]::GetActiveObject('PowerPoint.Application');
      if ($ppt.Presentations.Count -gt 0) {
        $pres = $ppt.Presentations(1);
        $slide = $pres.Slides(${slideNum});
        if ($slide.Shapes.Title.TextFrame.TextRange.Text) {
          Write-Output $slide.Shapes.Title.TextFrame.TextRange.Text;
        }
      }
    `
    const result = run(script, 8000).trim()
    return { success: true, title: result || t('deck.slideTitle', { n: slideNum }) }
  } catch {
    return { success: true, title: t('deck.slideTitle', { n: slideNum }) }
  }
}

export function closePPT(): PptResult {
  try {
    const script = `
      $ppt = [Runtime.InteropServices.Marshal]::GetActiveObject('PowerPoint.Application');
      if ($ppt.Presentations.Count -gt 0) {
        $ppt.Presentations(1).Close();
      }
    `
    run(script)
    slideCount = 0
    currentSlide = 0
    return { success: true }
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
}
