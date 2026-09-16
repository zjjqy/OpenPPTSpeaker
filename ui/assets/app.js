/* ============================================================
   OpenPPTSpeaker · prototype runner —— 主题 / 强调色 / 工具栏注入 / 演示小工具
   ============================================================ */
(function () {
  'use strict'

  var ACCENTS = [
    { id: 'ocean', label: '海蓝（默认）', css: '#3d7eff' },
    { id: 'sky', label: '晴蓝', css: '#22a9e0' },
    { id: 'violet', label: '星紫', css: '#8b5cf6' },
    { id: 'emerald', label: '松绿', css: '#10b981' },
    { id: 'amber', label: '日橙', css: '#f5a623' },
    { id: 'rose', label: '玫红', css: '#f4537a' }
  ]
  // CSS 默认（无 data-accent）即 ocean，故内部存储 ocean 时映射为删除属性

  function toAttr(id) {
    return id === 'ocean' ? '' : id
  }

  function resolveTheme() {
    var t = localStorage.getItem('vd.theme') || 'auto'
    if (t === 'auto') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    }
    return t
  }

  function apply() {
    var theme = localStorage.getItem('vd.theme') || 'auto'
    var accent = localStorage.getItem('vd.accent') || 'ocean'
    var el = document.documentElement
    el.dataset.theme = resolveTheme()
    var a = toAttr(accent)
    if (a) el.dataset.accent = a
    else delete el.dataset.accent

    if (theme === 'auto') {
      var mq = window.matchMedia('(prefers-color-scheme: dark)')
      var h = function () {
        if ((localStorage.getItem('vd.theme') || 'auto') === 'auto') apply()
      }
      try { mq.removeEventListener('change', h) } catch (e) {}
      mq.addEventListener('change', h)
    }

    var i
    var ctrls = document.querySelectorAll('[data-theme-ctl]')
    for (i = 0; i < ctrls.length; i++) {
      ctrls[i].classList.toggle('on', ctrls[i].getAttribute('data-theme-ctl') === theme)
    }
    var sws = document.querySelectorAll('.swatch')
    for (i = 0; i < sws.length; i++) {
      sws[i].classList.toggle('on', (sws[i].getAttribute('data-accent') || 'ocean') === accent)
    }
  }

  window.VoxUI = {
    setTheme: function (t) { localStorage.setItem('vd.theme', t); apply() },
    setAccent: function (a) { localStorage.setItem('vd.accent', a); apply() },
    accentList: ACCENTS
  }

  function el(html) {
    var d = document.createElement('div')
    d.innerHTML = html.trim()
    return d.firstChild
  }

  /* ---------- 演示工具栏注入 ---------- */
  function initToolbars() {
    var slots = document.querySelectorAll('.toolbar-slot')
    if (!slots.length) return
    for (var i = 0; i < slots.length; i++) {
      var slot = slots[i]
      var pageLabel = slot.getAttribute('data-page') || ''
      var isHome = slot.getAttribute('data-home') === '1'
      var brand = slot.getAttribute('data-brand') || 'OpenPPTSpeaker'
      slot.classList.add('demo-toolbar')
      slot.innerHTML = ''

      var left = el(
        '<div class="tb-left">' +
          '<span class="win-badge"><span class="dot"></span>' + (isHome ? 'Design Hub' : 'UI 原型') + '</span>' +
          '<span class="tb-title">' +
            (isHome ? '' : '<a href="../index.html" title="返回设计首页" style="color:var(--vd-text-3);font-size:15px;text-decoration:none;">‹</a>') +
            '<span>' + brand + '</span>' +
            (pageLabel ? '<span class="tb-sub">' + pageLabel + '</span>' : '') +
          '</span></div>'
      )

      var right = el('<div class="tb-right"></div>')
      var swWrap = el('<div class="swatches"></div>')
      ACCENTS.forEach(function (a) {
        var b = el('<button class="swatch" title="' + a.label + '"><span class="inner" style="--s:' + a.css + '"></span></button>')
        b.setAttribute('data-accent', a.id)
        b.addEventListener('click', function () { window.VoxUI.setAccent(a.id) })
        swWrap.appendChild(b)
      })
      right.appendChild(swWrap)

      var seg = el('<div class="seg"></div>')
      var themes = [['light', '浅色'], ['dark', '深色'], ['auto', '跟随']]
      themes.forEach(function (t) {
        var b = el('<button>' + t[1] + '</button>')
        b.setAttribute('data-theme-ctl', t[0])
        b.addEventListener('click', function () { window.VoxUI.setTheme(t[0]) })
        seg.appendChild(b)
      })
      right.appendChild(seg)
      slot.appendChild(left)
      slot.appendChild(right)
    }
  }

  /* ---------- 辅助：让 [data-set] 元素支持输入 demo 参数映射（预留） ---------- */

  document.addEventListener('DOMContentLoaded', function () {
    apply()
    initToolbars()
    document.documentElement.classList.add('theme-anim')
  })
})()
