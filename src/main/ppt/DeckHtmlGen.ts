/**
 * 由页面图片生成可控演示 HTML（规范见 introduceProduction/控制接口.md）。
 * 结构：#deck > .slide > .stage > img
 *   - .stage 按图片原始比例在视口内最大化（留边居中），聚光百分比坐标相对 stage 计算，
 *     与编辑器/视频导出的坐标系一致。
 * 对外接口：
 *   window.huashunDeck            标准翻页控制（页码 1 起）
 *   window.huashunSpotlight(rect) 聚光遮罩：rect={x,y,w,h}（0~100），null 清除
 */

import { t } from '@shared/i18n'

/** 生成演示 HTML。slideFiles 为 slides/ 下的图片文件名（有序）。 */
export function generateDeckHtml(title: string, slideFiles: string[]): string {
  const slides = slideFiles
    .map(
      (f, i) =>
        `  <div class="slide${i === 0 ? ' active' : ''}" data-title="${t('deck.slideTitle', { n: i + 1 })}" name="slide"><div class="stage"><img src="slides/${f}" alt=""><div class="spot"></div></div></div>`
    )
    .join('\n')

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<style>
  html, body { margin: 0; padding: 0; height: 100%; background: #000; overflow: hidden; }
  #deck { position: fixed; inset: 0; }
  .slide { position: absolute; inset: 0; display: none; align-items: center; justify-content: center; }
  .slide.active { display: flex; }
  /* stage: JS 按图片比例计算尺寸的容器，聚光坐标基于它 */
  .stage { position: relative; }
  .stage img { display: block; width: 100%; height: 100%; }
  /* 聚光：box-shadow 形成"洞"，其余区域压暗 */
  .spot {
    position: absolute; display: none; pointer-events: none;
    box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.55);
    border: 2px solid rgba(255, 170, 60, 0.95);
    border-radius: 6px;
    box-sizing: border-box;
  }
  #pageinfo {
    position: fixed; right: 14px; bottom: 10px; z-index: 50;
    color: rgba(255,255,255,.55); font: 13px/1.4 "Microsoft YaHei", sans-serif;
    background: rgba(0,0,0,.35); padding: 2px 10px; border-radius: 10px;
    user-select: none; pointer-events: none;
  }
</style>
</head>
<body>
<div id="deck">
${slides}
</div>
<div id="pageinfo"></div>
<script>
(function () {
  var slides = Array.prototype.slice.call(document.getElementById('deck').querySelectorAll('.slide'));
  var total = slides.length;
  var current = 0; // 内部 0 起
  var pageinfo = document.getElementById('pageinfo');

  // 按图片原始比例把 stage 适配到视口（letterbox），聚光坐标才有稳定基准
  function fitStage(slide) {
    var img = slide.querySelector('img');
    var stage = slide.querySelector('.stage');
    var nw = img.naturalWidth, nh = img.naturalHeight;
    if (!nw || !nh) return;
    var vw = window.innerWidth, vh = window.innerHeight;
    var scale = Math.min(vw / nw, vh / nh);
    stage.style.width = Math.round(nw * scale) + 'px';
    stage.style.height = Math.round(nh * scale) + 'px';
  }
  function fitAll() { slides.forEach(fitStage); }
  window.addEventListener('resize', fitAll);
  slides.forEach(function (slide) {
    var img = slide.querySelector('img');
    if (img.complete) fitStage(slide);
    else img.addEventListener('load', function () { fitStage(slide); });
  });
  fitAll();

  function render() {
    for (var i = 0; i < slides.length; i++) slides[i].classList.toggle('active', i === current);
    pageinfo.textContent = (current + 1) + ' / ' + total;
  }
  function goTo(i) {
    if (i < 0) i = 0;
    if (i > total - 1) i = total - 1;
    current = i; render();
  }
  function next() { goTo(current + 1); }
  function prev() { goTo(current - 1); }
  document.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') next();
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') prev();
  });

  // ---- OpenPPTSpeaker · 标准翻页控制接口（页码 1 起） ----
  window.speakerDeck = {
    goTo: function (page) {
      var i = Math.round(Number(page)) - 1;
      if (isNaN(i) || i < 0 || i > total - 1) return false;
      goTo(i);
      return true;
    },
    next: next,
    prev: prev,
    current: function () { return current + 1; },
    count: function () { return total; }
  };

  // ---- 聚光遮罩：rect = {x,y,w,h}（相对页面图片的百分比 0~100），null 清除 ----
  window.speakerSpotlight = function (rect) {
    var spot = slides[current].querySelector('.spot');
    if (!rect) { spot.style.display = 'none'; return true; }
    spot.style.display = 'block';
    spot.style.left = rect.x + '%';
    spot.style.top = rect.y + '%';
    spot.style.width = rect.w + '%';
    spot.style.height = rect.h + '%';
    return true;
  };

  render();
})();
</script>
</body>
</html>
`
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
