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
    var cur = lbImages[lbIndex];
    // 先用缩略图占位，原图加载完成后再替换（用户翻页后过期回调直接丢弃）
    img.src = cur.thumb800 || cur.thumb400 || cur.full;
    var idx = lbIndex;
    var full = new Image();
    full.onload = function () { if (lbIndex === idx) img.src = cur.full; };
    full.src = cur.full;
    // 预取相邻原图，减少翻页等待
    [-1, 1].forEach(function (d) {
      var next = lbImages[lbIndex + d];
      if (next) { (new Image()).src = next.full; }
    });
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

    var imgs = (m.images || []).map(function (r) {
      if (typeof r === 'string') return { full: rootUrl + r }; // 旧 moments.json 兼容
      var thumb400 = r.thumbs && r.thumbs['400'] ? rootUrl + r.thumbs['400'] : '';
      var thumb800 = r.thumbs && r.thumbs['800'] ? rootUrl + r.thumbs['800'] : '';
      return { full: rootUrl + r.route, thumb400: thumb400, thumb800: thumb800 };
    });
    if (imgs.length) {
      var n = imgs.length;
      var MAX_GRID = 9;
      var gridCls = (n === 1) ? 'grid-1' : (n === 2 || n === 4) ? 'grid-2' : 'grid-3';
      var sizesAttr = gridCls === 'grid-1'
        ? '(max-width: 767px) 240px, 320px'
        : '(max-width: 767px) 100px, 150px';
      var grid = el('div', 'moment-grid nofancybox ' + gridCls);
      var more = n - MAX_GRID;
      imgs.slice(0, MAX_GRID).forEach(function (imgData, i) {
        var item = el('div', 'moment-grid-item');
        var im = el('img');
        if (imgData.thumb400) {
          im.src = imgData.thumb400;
          im.srcset = imgData.thumb400 + ' 400w, ' + imgData.thumb800 + ' 800w';
          im.sizes = sizesAttr;
        } else {
          im.src = imgData.full;
        }
        im.loading = 'lazy';
        im.alt = '';
        im.addEventListener('click', function () { openLightbox(imgs, i); });
        item.appendChild(im);
        if (more > 0 && i === MAX_GRID - 1) {
          item.classList.add('moment-more');
          im.classList.add('moment-more-img');
          item.appendChild(el('span', 'moment-more-count', '+' + more));
        }
        grid.appendChild(item);
      });
      card.appendChild(grid);
    }

    if (commentsOn) attachComments(card, m);
    return card;
  }

  /* ---------------- 评论区（giscus 多实例） ---------------- */
  /* giscus client.js 只支持单实例（总是挂载到页面第一个 .giscus 容器），因此按
     widget URL 直接挂 iframe：每条动态一个线程（origin 以 #m-<id> 区分，会话
     共享 localStorage），iframe 原生懒加载。输入框默认隐藏（自定义主题 CSS），
     点「写评论」通过 postMessage setConfig 切回内置主题，无需重载。 */

  var GC_ORIGIN = 'https://giscus.app';
  var gcHiddenTheme = location.origin + rootUrl + 'css/giscus-moments.css';

  // 会话与 giscus client.js 一致：OAuth 回调带 ?giscus= 参数 → 存 localStorage
  var gcSearch = new URLSearchParams(location.search);
  var gcSession = gcSearch.get('giscus') || '';
  var gcPageUrl = location.origin + location.pathname +
    (gcSearch.toString() ? '?' + gcSearch.toString() : '');
  if (gcSession) {
    localStorage.setItem('giscus-session', JSON.stringify(gcSession));
    gcSearch.delete('giscus');
    gcPageUrl = location.origin + location.pathname +
      (gcSearch.toString() ? '?' + gcSearch.toString() : '');
    history.replaceState(null, document.title, gcPageUrl + location.hash);
  } else {
    try { gcSession = JSON.parse(localStorage.getItem('giscus-session') || 'null') || ''; }
    catch (e) { gcSession = ''; }
  }

  var gcFrames = {}; // m.id -> { frame, term, writing, loaded }

  function giscusSrc(term, theme) {
    var q = {
      origin: gcPageUrl + '#m-' + term,
      session: gcSession,
      theme: theme,
      reactionsEnabled: '1',
      emitMetadata: '0',
      inputPosition: cfg.comments.input_position || 'top',
      repo: cfg.comments.repo,
      repoId: cfg.comments.repo_id,
      category: cfg.comments.category,
      categoryId: cfg.comments.category_id,
      strict: '0',
      term: term,
    };
    return GC_ORIGIN + (cfg.comments.lang ? '/' + cfg.comments.lang : '') +
      '/widget?' + new URLSearchParams(q).toString();
  }

  function giscusReloadAll() {
    for (var id in gcFrames) {
      var st = gcFrames[id];
      st.frame.src = giscusSrc(st.term, st.writing ? (cfg.comments.theme || 'light') : gcHiddenTheme);
    }
  }

  window.addEventListener('message', function (e) {
    if (e.origin !== GC_ORIGIN) return;
    var g = e.data && e.data.giscus;
    if (!g) return;
    if (g.resizeHeight) { // 调整对应 iframe 高度
      for (var id in gcFrames) {
        if (gcFrames[id].frame.contentWindow === e.source) {
          gcFrames[id].frame.style.height = g.resizeHeight + 'px';
          break;
        }
      }
    } else if (g.signOut) {
      localStorage.removeItem('giscus-session');
      gcSession = '';
      giscusReloadAll();
    } else if (g.error && (g.error.indexOf('Bad credentials') !== -1 ||
        g.error.indexOf('Invalid state value') !== -1 ||
        g.error.indexOf('State has expired') !== -1)) {
      localStorage.removeItem('giscus-session');
      gcSession = '';
      giscusReloadAll();
    }
  });

  function attachComments(card, m) {
    var writeLabel = cfg.commentsWriteLabel || 'Write a comment';
    var collapseLabel = cfg.commentsCollapseLabel || 'Collapse';
    var term = 'moment-' + m.id;
    var wrap = el('div', 'moment-comments');
    var head = el('div', 'moment-comments-head');
    var btn = el('button', 'moment-comments-toggle');
    btn.type = 'button';
    head.appendChild(btn);
    wrap.appendChild(head);

    var frame = document.createElement('iframe');
    frame.className = 'giscus-frame';
    frame.title = 'Comments';
    frame.setAttribute('scrolling', 'no');
    frame.setAttribute('allow', 'clipboard-write');
    frame.loading = 'lazy';
    frame.src = giscusSrc(term, gcHiddenTheme);
    wrap.appendChild(frame);

    var st = { frame: frame, term: term, writing: false, loaded: false };
    gcFrames[m.id] = st;
    frame.addEventListener('load', function () { st.loaded = true; });

    var setLabel = function () {
      btn.innerHTML = '<i class="fa fa-pencil-square-o"></i>';
      btn.appendChild(document.createTextNode(' ' + (st.writing ? collapseLabel : writeLabel)));
    };
    setLabel();
    btn.addEventListener('click', function () {
      st.writing = !st.writing;
      btn.classList.toggle('active', st.writing);
      setLabel();
      var theme = st.writing ? (cfg.comments.theme || 'light') : gcHiddenTheme;
      if (st.loaded) {
        frame.contentWindow.postMessage({ giscus: { setConfig: { theme: theme } } }, GC_ORIGIN);
      } else {
        frame.src = giscusSrc(term, theme); // iframe 尚未就绪，直接换 src
      }
    });

    card.appendChild(wrap);
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
