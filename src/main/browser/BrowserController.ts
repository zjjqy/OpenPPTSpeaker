/** 讲解浏览器窗口控制：打开 / 高亮 / 滚动 / 翻页 / 文本提取 */

import { windowManager } from '../windows/WindowManager'
import type { BrowserWindow } from 'electron'
import type { SpotlightRect } from '@shared/ppt'
import { t } from '@shared/i18n'

export interface SpotlightResult {
  success: boolean
  error?: string
}

export class BrowserController {
  /** 打开讲解目标（本地 HTML 演示文件） */
  async open(target: { file?: string }): Promise<boolean> {
    if (target.file) {
      await windowManager.openBrowser(target.file)
      this.hookExitButton()
      return true
    }
    return false
  }

  /**
   * 在讲解窗口顶部中间挂一个悬浮「退出演讲」按钮。
   * 采用页面内注入而非独立窗口：不参与全屏窗口的 z-order 竞争，且对 PPT 页与网页讲解通用。
   */
  private hookExitButton(): void {
    const win = this.win
    if (!win) return
    const wc = win.webContents as Electron.WebContents & { __opsExitHooked?: boolean }
    void this.injectExitButton()
    if (wc.__opsExitHooked) return
    wc.__opsExitHooked = true
    // 页面跳转/刷新后 DOM 被清空，需重新注入
    wc.on('did-finish-load', () => {
      void this.injectExitButton()
    })
  }

  /** 注入/重建悬浮退出按钮（幂等） */
  private async injectExitButton(): Promise<void> {
    const win = this.win
    if (!win) return
    await win.webContents
      .executeJavaScript(
        `(() => {
          try {
            if (window.__opsExitBtn) return true;
            if (!document.body) return false;
            var btn = document.createElement('div');
            btn.setAttribute('data-ops', 'exit-talk');
            btn.title = ${JSON.stringify(t('browser.exitPresenting'))};
            // 与客户端 UI 一致：深色玻璃胶囊 + 品牌强调蓝（#3d7eff）
            btn.style.cssText = 'position:fixed;top:14px;left:50%;transform:translateX(-50%) translateY(-6px);z-index:2147483647;'
              + 'display:flex;align-items:center;gap:8px;padding:8px 16px 8px 13px;border-radius:999px;'
              + 'background:rgba(16,20,26,0.62);color:#fff;font:600 13px/1 "Microsoft YaHei","PingFang SC",system-ui,sans-serif;'
              + 'border:1px solid rgba(255,255,255,0.16);cursor:pointer;user-select:none;'
              + 'backdrop-filter:blur(14px) saturate(1.4);-webkit-backdrop-filter:blur(14px) saturate(1.4);'
              + 'box-shadow:0 10px 30px -12px rgba(0,0,0,.7);'
              + 'opacity:0;pointer-events:none;'
              + 'transition:opacity .18s cubic-bezier(.25,.6,.3,1),transform .18s cubic-bezier(.25,.6,.3,1),background .18s ease,border-color .18s ease;';
            btn.innerHTML = '<span style="display:inline-flex;width:18px;height:18px;align-items:center;justify-content:center;'
              + 'border-radius:50%;background:rgba(61,126,255,.22);color:#8fb6ff;font-size:11px;line-height:1">\\u2715</span>'
              + '<span>' + ${JSON.stringify(t('browser.exitPresenting'))} + '</span>';
            var hover = false;
            var hideTimer = 0;
            var show = function (on) {
              btn.style.opacity = on ? '1' : '0';
              btn.style.pointerEvents = on ? 'auto' : 'none';
              btn.style.transform = on ? 'translateX(-50%) translateY(0)' : 'translateX(-50%) translateY(-6px)';
            };
            // 显形后若鼠标静止一段时间则自动淡出（悬停在按钮上时不隐藏），避免长期压住画面
            var armHide = function () {
              clearTimeout(hideTimer);
              hideTimer = setTimeout(function () { if (!hover) show(false); }, 1600);
            };
            var near = function (e) {
              var cx = window.innerWidth / 2;
              return e.clientX > cx - 130 && e.clientX < cx + 130 && e.clientY < 86;
            };
            document.addEventListener('mousemove', function (e) {
              if (near(e)) { show(true); armHide(); }
              else if (!hover) { clearTimeout(hideTimer); show(false); }
            }, { passive: true });
            document.addEventListener('mouseleave', function () { clearTimeout(hideTimer); if (!hover) show(false); });
            btn.addEventListener('mouseenter', function () {
              hover = true; clearTimeout(hideTimer); show(true);
              btn.style.background = 'rgba(61,126,255,.92)';
              btn.style.borderColor = 'rgba(61,126,255,.92)';
            });
            btn.addEventListener('mouseleave', function () {
              hover = false; armHide();
              btn.style.background = 'rgba(16,20,26,0.62)';
              btn.style.borderColor = 'rgba(255,255,255,0.16)';
            });
            btn.addEventListener('click', function (e) {
              e.stopPropagation();
              e.preventDefault();
              try {
                // 桥接名已迁移为 window.ops，保留旧名兜底
                var api = window.ops || window.huashun;
                if (api && api.tour && api.tour.end) api.tour.end();
              } catch (err) { /* ignore */ }
            });
            document.body.appendChild(btn);
            window.__opsExitBtn = btn;
            return true;
          } catch (err) { return false; }
        })()`
      )
      .catch(() => undefined)
  }

  private get win(): BrowserWindow | null {
    return windowManager.browserWindow && !windowManager.browserWindow.isDestroyed()
      ? windowManager.browserWindow
      : null
  }

  /**
   * 坐标聚光（v2）：rect = {x,y,w,h}（相对页面图片的百分比 0~100），null 清除。
   * 依赖演示页暴露的 window.speakerSpotlight（生成的 PPT HTML 内置；旧页面无此函数时静默跳过）。
   */
  async spotlightRect(rect: SpotlightRect | null): Promise<void> {
    const win = this.win
    if (!win) return
    await win.webContents
      .executeJavaScript(
        `window.speakerSpotlight ? window.speakerSpotlight(${JSON.stringify(rect)}) : false`
      )
      .catch(() => undefined)
  }

  /** 聚光灯：聚焦目标元素，其余区域变暗（SVG mask 挖空 + 白色描边，600ms 收敛动画） */
  async spotlight(selector: string, color = '#FFFFFF', dimOpacity = 0.5): Promise<SpotlightResult> {
    const win = this.win
    if (!win) return { success: false, error: t('browser.noWindow') }
    try {
      const result = await win.webContents.executeJavaScript(
        `(() => {
          document.querySelectorAll('.ops-spot').forEach(el => el.remove());
          const el = document.querySelector(${JSON.stringify(selector)});
          if (!el) return { success: false, error: ${JSON.stringify(t('browser.noElement'))} };
          const r = el.getBoundingClientRect();
          const x = r.left + window.scrollX, y = r.top + window.scrollY, w = r.width, h = r.height;
          const ov = document.createElement('div');
          // 类名必须与上方预清理、以及 clearSpotlight 里的 .ops-spot 选择器一致。
          // 此处曾残留旧品牌名 huashun-spot：查询用的是 .ops-spot，永远匹配不到新建的元素
          // → 旧遮罩删不掉，每句聚光都叠加一层 50% 压暗，画面越来越黑且挖空失效。
          ov.className = 'ops-spot';
          ov.style.cssText = 'position:fixed;inset:0;z-index:99997;pointer-events:none;';
          ov.innerHTML = '<svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" style="position:absolute;inset:0">'
            + '<defs><mask id="ops-spot-mask">'
            + '<rect x="0" y="0" width="100" height="100" fill="white"/>'
            + '<rect id="ops-spot-cut" x="0" y="0" width="0" height="0" rx="1" fill="black"/>'
            + '</mask></defs>'
            + '<rect width="100" height="100" fill="rgba(0,0,0,' + ${JSON.stringify(dimOpacity)} + ')" mask="url(#ops-spot-mask)" style="opacity:0;transition:opacity .3s"/>'
            + '<rect id="ops-spot-border" x="0" y="0" width="0" height="0" rx="1" fill="none" stroke="' + ${JSON.stringify(color)} + '" stroke-width="1.2" vector-effect="non-scaling-stroke" style="opacity:0;transition:opacity .5s .05s"/>'
            + '</svg>';
          document.body.appendChild(ov);
          const vbW = 100, vbH = 100;
          const vw = Math.max(1, window.innerWidth), vh = Math.max(1, window.innerHeight);
          const cx = x / vw * vbW, cy = y / vh * vbH, cw = w / vw * vbW, ch = h / vh * vbH;
          // 先从放大的位置收敛到精确位置（600ms expo-out）
          // 用 ov 作用域查找而非 document.getElementById：遮罩内 id 在整页唯一，
          // 万一出现多个遮罩，全局查找会命中前一个，导致新遮罩的挖空停在 0×0、整屏被压暗
          const cut = ov.querySelector('#ops-spot-cut');
          const border = ov.querySelector('#ops-spot-border');
          cut.style.transition = 'all .6s cubic-bezier(0.16,1,0.3,1)';
          border.style.transition = 'all .5s cubic-bezier(0.16,1,0.3,1) .05s';
          cut.setAttribute('x', String(cx - 8)); cut.setAttribute('y', String(cy - 8));
          cut.setAttribute('width', String(cw + 16)); cut.setAttribute('height', String(ch + 16));
          border.setAttribute('x', String(cx - 4)); border.setAttribute('y', String(cy - 4));
          border.setAttribute('width', String(cw + 8)); border.setAttribute('height', String(ch + 8));
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              cut.setAttribute('x', String(cx - 0.4)); cut.setAttribute('y', String(cy - 0.6));
              cut.setAttribute('width', String(cw + 0.8)); cut.setAttribute('height', String(ch + 1.2));
              border.setAttribute('x', String(cx - 0.4)); border.setAttribute('y', String(cy - 0.6));
              border.setAttribute('width', String(cw + 0.8)); border.setAttribute('height', String(ch + 1.2));
              const dim = ov.querySelector('rect[mask]'); if (dim) dim.style.opacity = '1';
              border.style.opacity = '1';
            });
          });
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          return { success: true };
        })()`
      )
      return result
    } catch (e) {
      return { success: false, error: (e as Error).message }
    }
  }

  /**
   * 清除聚光效果：元素聚光灯遮罩（SVG 挖空）+ 坐标聚光（v2）。
   * 说明：本项目只保留聚光灯效果，不再使用矩形高亮框 / 激光点。
   */
  async clearSpotlight(): Promise<void> {
    const win = this.win
    if (!win) return
    await win.webContents.executeJavaScript(
      `document.querySelectorAll('.ops-spot').forEach(el => el.remove());
       if (window.speakerSpotlight) window.speakerSpotlight(null);`
    ).catch(() => undefined)
  }

  /**
   * 切换 PPT 页。
   * @param n 1 起的页码（1 = 第一页）。
   *
   * 调用链（按优先级降级，兼容各代 PPT HTML 结构）：
   * 1. window.speakerDeck.goTo(n) —— 标准控制接口（新结构，规范见 introduceProduction/控制接口.md）
   * 2. window.PPT.goTo(n-1)       —— 旧版接口（0 起索引）
   * 3. 点击目录(TOC)项            —— 更老结构（触发其真实翻页逻辑）
   * 4. 直接操作 DOM 切 active 类  —— 兜底（不同步页面内部状态，仅保底显示）
   */
  async showSlide(n: number): Promise<boolean> {
    const win = this.win
    if (!win) return false
    const idx = Math.max(0, n - 1) // 1 起页码 → 0 起索引
    const ok = await win.webContents
      .executeJavaScript(
        `(() => {
          const target = ${JSON.stringify(idx)};
          const page = target + 1;
          // 1) 标准控制接口（1 起页码，内部走完整翻页逻辑，状态全同步）
          if (window.speakerDeck && typeof window.speakerDeck.goTo === 'function') {
            return window.speakerDeck.goTo(page) === true;
          }
          // 1.5) 旧品牌接口名兼容（社区早期生成的演示页）
          if (window.huashunDeck && typeof window.huashunDeck.goTo === 'function') {
            return window.huashunDeck.goTo(page) === true;
          }
          // 2) 旧版 window.PPT 接口（0 起索引）
          if (window.PPT && typeof window.PPT.goTo === 'function') {
            window.PPT.goTo(target);
            return true;
          }
          // 3) 更老结构：点击 TOC 目录项
          const li = document.querySelector('#tocList li[data-idx="'+target+'"]');
          if (li) { li.click(); return true; }
          // 4) 兜底：直接操作 DOM 切换 active（页面内部计数不同步，仅保底）
          const slides = document.querySelectorAll('#deck .slide');
          if (!slides[target]) return false;
          slides.forEach(s => s.classList.remove('active'));
          slides[target].classList.add('active');
          const pi = document.getElementById('pageinfo');
          if (pi) pi.innerHTML = '<b>'+(target+1)+'</b> / '+slides.length;
          return true;
        })()`
      )
      .catch(() => false)
    return Boolean(ok)
  }

  /** 提取指定选择器的文本内容 */
  async extractText(selector: string): Promise<string> {
    const win = this.win
    if (!win) return ''
    try {
      const text = await win.webContents.executeJavaScript(
        `(() => {
          const el = document.querySelector(${JSON.stringify(selector)});
          if (!el) return '';
          return (el.innerText || el.textContent || '').trim().slice(0, 4000);
        })()`
      )
      return String(text ?? '')
    } catch {
      return ''
    }
  }

  /** 提取整页结构摘要（标题/主要文本） */
  async extractPageSummary(): Promise<string> {
    const win = this.win
    if (!win) return ''
    try {
      const summary = await win.webContents.executeJavaScript(
        `(() => {
          const title = document.title || '';
          const h1s = [...document.querySelectorAll('h1')].map(e => e.innerText.trim()).filter(Boolean).slice(0,5);
          const h2s = [...document.querySelectorAll('h2')].map(e => e.innerText.trim()).filter(Boolean).slice(0,10);
          const nav = document.querySelector('nav, header')?.innerText.trim().slice(0,500) || '';
          return JSON.stringify({ title, h1s, h2s, nav });
        })()`
      )
      const parsed = JSON.parse(String(summary))
      return [
        t('browser.pageTitle', { v: parsed.title }),
        parsed.h1s.length ? t('browser.h1s', { v: parsed.h1s.join(t('list.semi')) }) : '',
        parsed.h2s.length ? t('browser.h2s', { v: parsed.h2s.join(t('list.semi')) }) : '',
        parsed.nav ? t('browser.nav', { v: parsed.nav }) : ''
      ]
        .filter(Boolean)
        .join('\n')
    } catch {
      return ''
    }
  }
}

export const browserController = new BrowserController()
