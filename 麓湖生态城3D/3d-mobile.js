/* ===========================================================================
 * 麓湖生态城 3D 数字沙盘 · 移动端抽屉交互
 * ---------------------------------------------------------------------------
 * <900px 时打包 CSS 会把 #panel-left / #panel-right 隐藏，手机上无法再打开
 * 「地块筛选」与「图层/图例」。这里把两者改造成底部抽屉，并在底部状态栏的
 * #mv-tools 里提供「筛选 / 图层」开关；遮罩点击、收起按钮、Esc 均可关闭。
 * 不改动打包产物，也不干预其按 id 绑定的内部逻辑。
 * =========================================================================== */
(function () {
  'use strict';
  if (window.__mv3dReady) return;
  window.__mv3dReady = true;

  var MQ = window.matchMedia('(max-width: 767px)');
  var PANEL_IDS = ['panel-left', 'panel-right'];

  var backdrop = document.createElement('div');
  backdrop.id = 'mv-backdrop';
  document.body.appendChild(backdrop);

  var panels = PANEL_IDS
    .map(function (id) { return document.getElementById(id); })
    .filter(Boolean);

  panels.forEach(function (panel) {
    var head = panel.querySelector('.panel-head');
    if (!head || head.querySelector('.mv-close')) return;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ghost mv-close';
    btn.textContent = '收起';
    btn.setAttribute('aria-label', '收起面板');
    btn.addEventListener('click', closeAll);
    head.appendChild(btn);
  });

  var tools = document.getElementById('mv-tools');

  function toggles() {
    return tools ? tools.querySelectorAll('button[data-mv-panel]') : [];
  }

  function closeAll() {
    panels.forEach(function (p) { p.classList.remove('mv-open'); });
    backdrop.classList.remove('show');
    document.body.classList.remove('mv-drawer');
    Array.prototype.forEach.call(toggles(), function (b) {
      b.classList.remove('on');
      b.setAttribute('aria-expanded', 'false');
    });
  }

  function open(id, btn) {
    closeAll();
    var panel = document.getElementById(id);
    if (!panel) return;
    panel.classList.add('mv-open');
    backdrop.classList.add('show');
    document.body.classList.add('mv-drawer');
    if (btn) {
      btn.classList.add('on');
      btn.setAttribute('aria-expanded', 'true');
    }
    var body = panel.querySelector('.panel-body');
    if (body) body.scrollTop = 0;
  }

  if (tools) {
    tools.addEventListener('click', function (event) {
      var btn = event.target.closest ? event.target.closest('button[data-mv-panel]') : null;
      if (!btn) return;
      var id = btn.getAttribute('data-mv-panel');
      var panel = document.getElementById(id);
      if (panel && panel.classList.contains('mv-open')) closeAll();
      else open(id, btn);
    });
  }

  backdrop.addEventListener('click', closeAll);
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' || event.keyCode === 27) closeAll();
  });

  var onChange = function () { if (!MQ.matches) closeAll(); };
  if (MQ.addEventListener) MQ.addEventListener('change', onChange);
  else if (MQ.addListener) MQ.addListener(onChange);

  window.addEventListener('orientationchange', function () {
    if (!MQ.matches) closeAll();
  });
})();
