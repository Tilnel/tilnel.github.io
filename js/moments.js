/* Moments（动态）前端：渲染、无限滚动、时间筛选、图片灯箱。零依赖。 */
(function () {
  'use strict';

  var cfg = window.MOMENTS_CFG;
  if (!cfg) return;

  var rootUrl = cfg.dataUrl.replace(/moments\/moments\.json.*$/, '');
  // 评论区仅在 Moments 页启用，且要求已配置 giscus 的 repo_id/category_id
  var commentsOn = cfg.mode === 'page' && cfg.comments &&
    cfg.comments.repo_id && cfg.comments.category_id;

  /* ---------------- 灯箱 ---------------- */

  var lb = null, lbImages = [], lbIndex = 0;

  function buildLightbox() {
    if (lb) return lb;
    lb = document.createElement('div');
    lb.className = 'moment-lightbox';
    lb.innerHTML =
      '<span class="mlb-close">&times;</span>' +
      '<span class="mlb-nav mlb-prev">&#10094;</span>' +
      '<img class="mlb-img" alt="">' +
      '<span class="mlb-nav mlb-next">&#10095;</span>' +
      '<span class="mlb-counter"></span>';
    document.body.appendChild(lb);

    lb.querySelector('.mlb-close').addEventListener('click', closeLightbox);
    lb.querySelector('.mlb-prev').addEventListener('click', function (e) { e.stopPropagation(); stepLightbox(-1); });
    lb.querySelector('.mlb-next').addEventListener('click', function (e) { e.stopPropagation(); stepLightbox(1); });
    lb.addEventListener('click', function (e) { if (e.target === lb) closeLightbox(); });

    var tx = 0;
    lb.addEventListener('touchstart', function (e) { tx = e.changedTouches[0].clientX; }, { passive: true });
    lb.addEventListener('touchend', function (e) {
      var dx = e.changedTouches[0].clientX - tx;
      if (dx < -50) stepLightbox(1);
      else if (dx > 50) stepLightbox(-1);
    }, { passive: true });

    document.addEventListener('keydown', function (e) {
      if (!lb || lb.style.display !== 'flex') return;
      if (e.key === 'Escape') closeLightbox();
      else if (e.key === 'ArrowLeft') stepLightbox(-1);
      else if (e.key === 'ArrowRight') stepLightbox(1);
    });
    return lb;
  }

  function showLightbox() {
    var img = lb.querySelector('.mlb-img');
    img.src = lbImages[lbIndex];
    var multi = lbImages.length > 1;
    lb.querySelector('.mlb-prev').style.display = multi ? '' : 'none';
    lb.querySelector('.mlb-next').style.display = multi ? '' : 'none';
    lb.querySelector('.mlb-counter').textContent = multi ? (lbIndex + 1) + ' / ' + lbImages.length : '';
  }

  function openLightbox(images, index) {
    buildLightbox();
    lbImages = images;
    lbIndex = index;
    showLightbox();
    lb.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }

  function closeLightbox() {
    lb.style.display = 'none';
    document.body.style.overflow = '';
  }

  function stepLightbox(d) {
    if (lbImages.length <= 1) return;
    lbIndex = (lbIndex + d + lbImages.length) % lbImages.length;
    showLightbox();
  }

  /* ---------------- 动态卡片渲染 ---------------- */

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  function renderMoment(m) {
    var card = el('article', 'moment');
    card.id = 'm-' + m.id;

    var meta = el('div', 'moment-meta');
    meta.appendChild(el('span', 'moment-time', m.date_str || m.id));
    card.appendChild(meta);

    if (m.text) {
      card.appendChild(el('div', 'moment-text', m.text));
    }

    var imgs = (m.images || []).map(function (r) { return rootUrl + r; });
    if (imgs.length) {
      var n = imgs.length;
      var gridCls = (n === 1) ? 'grid-1' : (n === 2 || n === 4) ? 'grid-2' : 'grid-3';
      var grid = el('div', 'moment-grid nofancybox ' + gridCls);
      imgs.forEach(function (src, i) {
        var im = el('img');
        im.src = src;
        im.loading = 'lazy';
        im.alt = '';
        im.addEventListener('click', function () { openLightbox(imgs, i); });
        grid.appendChild(im);
      });
      card.appendChild(grid);
    }

    if (commentsOn) attachComments(card, m);
    return card;
  }

  /* ---------------- 评论区（giscus 懒加载，单线程手风琴） ---------------- */
  /* giscus client.js 总是挂载到页面第一个 .giscus 容器，因此同一时刻只保留一个
     实例：展开某条动态的评论时收起其他已展开的，且只在首次点击时才加载脚本。 */

  var giscusBox = null;

  function loadGiscus(term) {
    if (!giscusBox) {
      giscusBox = document.createElement('div');
      giscusBox.className = 'giscus';
    }
    // 上一轮的 script 已随容器移出 DOM；重建一个以更新 data-term
    var old = document.getElementById('giscus-moments');
    if (old) old.parentNode.removeChild(old);
    var gc = cfg.comments;
    var s = document.createElement('script');
    s.id = 'giscus-moments';
    s.src = 'https://giscus.app/client.js';
    s.async = true;
    s.setAttribute('data-repo', gc.repo);
    s.setAttribute('data-repo-id', gc.repo_id);
    s.setAttribute('data-category', gc.category);
    s.setAttribute('data-category-id', gc.category_id);
    s.setAttribute('data-mapping', 'specific');
    s.setAttribute('data-term', term);
    s.setAttribute('data-lang', gc.lang);
    s.setAttribute('data-theme', gc.theme);
    s.setAttribute('data-input-position', gc.input_position);
    s.setAttribute('data-reactions-enabled', '1');
    s.setAttribute('data-emit-metadata', '0');
    giscusBox.appendChild(s); // script 执行时会清空容器并注入 iframe
    return giscusBox;
  }

  function closeComments(foot) {
    var wrap = foot.querySelector('.moment-comments');
    if (!wrap.classList.contains('open')) return;
    wrap.classList.remove('open');
    foot.querySelector('.moment-comments-toggle').classList.remove('active');
    if (giscusBox && giscusBox.parentNode === wrap) wrap.removeChild(giscusBox);
  }

  function attachComments(card, m) {
    var label = cfg.commentsLabel || 'Comments';
    var foot = el('div', 'moment-foot');
    var wrap = el('div', 'moment-comments');
    var btn = el('button', 'moment-comments-toggle');
    btn.type = 'button';
    btn.innerHTML = '<i class="fa fa-comments-o"></i>';
    btn.appendChild(document.createTextNode(' ' + label));
    btn.addEventListener('click', function () {
      if (wrap.classList.contains('open')) { closeComments(foot); return; }
      // 手风琴：先收起其他动态已展开的评论区
      var list = card.parentNode;
      for (var i = 0; i < list.children.length; i++) {
        var other = list.children[i].querySelector('.moment-foot');
        if (other && other !== foot) closeComments(other);
      }
      wrap.classList.add('open');
      btn.classList.add('active');
      wrap.appendChild(loadGiscus('moment-' + m.id));
    });
    foot.appendChild(btn);
    foot.appendChild(wrap);
    card.appendChild(foot);
  }

  /* ---------------- 数据加载与分发 ---------------- */

  function fetchData(cb) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', cfg.dataUrl, true);
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;
      if (xhr.status >= 200 && xhr.status < 300) {
        try { cb(JSON.parse(xhr.responseText)); return; } catch (e) { /* fallthrough */ }
      }
      cb({ moments: [] });
    };
    xhr.send(null);
  }

  function initHome(data) {
    var list = document.getElementById('home-moments-list');
    if (!list) return;
    (data.moments || []).slice(0, cfg.homeCount || 3).forEach(function (m) {
      list.appendChild(renderMoment(m));
    });
  }

  function initPage(data) {
    var all = data.moments || [];
    var list = document.getElementById('moments-list');
    var sentinel = document.getElementById('moments-sentinel');
    var emptyTip = document.getElementById('moments-empty');
    var filter = document.getElementById('moments-filter');
    var batch = cfg.firstBatch || data.first_batch || 20;

    // 时间筛选选项（按 YYYY-MM 去重，数据本身已按时间倒序）
    if (filter) {
      var seen = {};
      all.forEach(function (m) {
        if (!seen[m.ym]) {
          seen[m.ym] = true;
          var opt = el('option', null, m.ym);
          opt.value = m.ym;
          filter.appendChild(opt);
        }
      });
    }

    var filtered = all;
    var rendered = 0;
    var anchorId = (cfg.anchor && window.location.hash) ? window.location.hash.slice(1) : null;

    function renderBatch() {
      var end = Math.min(rendered + batch, filtered.length);
      for (; rendered < end; rendered++) {
        list.appendChild(renderMoment(filtered[rendered]));
      }
      if (emptyTip) emptyTip.style.display = filtered.length ? 'none' : '';
      if (rendered >= filtered.length && sentinel) sentinel.style.display = 'none';
    }

    function reset() {
      list.innerHTML = '';
      rendered = 0;
      if (sentinel) sentinel.style.display = '';
      renderBatch();
    }

    if (filter) {
      filter.addEventListener('change', function () {
        filtered = filter.value ? all.filter(function (m) { return m.ym === filter.value; }) : all;
        reset();
      });
    }

    renderBatch();

    // 滚动到底自动加载更旧的动态
    var ticking = false;
    window.addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(function () {
        ticking = false;
        if (rendered >= filtered.length || !sentinel) return;
        if (sentinel.getBoundingClientRect().top < window.innerHeight + 400) renderBatch();
      });
    });

    // 从全局搜索跳入时：渲染到目标动态并定位
    if (anchorId) {
      var idx = -1;
      for (var i = 0; i < all.length; i++) if (all[i].id === anchorId) { idx = i; break; }
      if (idx >= 0) {
        if (filter) filter.value = '';
        filtered = all;
        reset();
        while (rendered <= idx && rendered < filtered.length) renderBatch();
        var target = document.getElementById('m-' + anchorId);
        if (target) {
          target.scrollIntoView({ block: 'start' });
          target.classList.add('moment-highlight');
        }
      }
    }
  }

  fetchData(function (data) {
    if (cfg.mode === 'home') initHome(data);
    else initPage(data);
  });
})();
