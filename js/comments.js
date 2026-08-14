/* 评论区：自托管评论 API（Cloudflare Workers + KV）的前端组件。
   文章页单线程（#blog-comments，输入框默认展开）；
   动态页多线程（moments.js 经 window.momentsCommentsAttach 挂载，输入框默认收起），
   线程数据批量拉取：同一轮渲染的所有线程合并为一个 GET 请求。 */
(function () {
  'use strict';

  var cfg = window.BLOG_COMMENTS_CFG;
  if (!cfg || !cfg.api) return;

  var api = cfg.api.replace(/\/+$/, '');
  var L = {
    write: cfg.writeLabel || '写评论',
    collapse: cfg.collapseLabel || '收起',
    reply: cfg.replyLabel || '回复',
    submit: cfg.submitLabel || '提交',
    nick: cfg.nickLabel || '昵称',
    empty: cfg.emptyLabel || '暂无评论',
    deleted: cfg.deletedLabel || '该评论已删除',
    failed: cfg.failedLabel || '提交失败，请稍后再试',
    bodyRequired: cfg.bodyRequiredLabel || '内容不能为空',
  };

  /* ---------------- 工具 ---------------- */

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  function fmtTime(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return '';
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
      ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  // 纯文本渲染：转义 + 自动链接 + 保留换行
  function fmtBody(text) {
    return esc(text)
      .replace(/(https?:\/\/[^\s<]+)/g, function (m) {
        return '<a href="' + m + '" target="_blank" rel="nofollow noopener">' + m + '</a>';
      })
      .replace(/\n/g, '<br>');
  }

  /* ---------------- 批量拉取 ---------------- */

  var pending = {}; // key -> [widget]
  var flushTimer = null;

  function flush() {
    flushTimer = null;
    var keys = Object.keys(pending);
    if (!keys.length) return;
    var q = keys.map(encodeURIComponent).join(',');
    var xhr = new XMLHttpRequest();
    xhr.open('GET', api + '/threads?keys=' + q, true);
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;
      var threads = {};
      if (xhr.status >= 200 && xhr.status < 300) {
        try { threads = (JSON.parse(xhr.responseText).threads) || {}; } catch (e) { /* 保持空 */ }
      }
      keys.forEach(function (key) {
        (pending[key] || []).forEach(function (w) {
          w.fill(threads[key] || { comments: [] });
        });
        delete pending[key];
      });
    };
    xhr.send(null);
  }

  function requestThread(w) {
    (pending[w.key] = pending[w.key] || []).push(w);
    if (!flushTimer) flushTimer = setTimeout(flush, 30);
  }

  /* ---------------- 线程组件 ---------------- */

  function visibleCount(list) {
    return list.filter(function (c) { return !c.deleted; }).length;
  }

  function createThread(container, key, opts) {
    opts = opts || {};
    var w = { key: key, comments: [] };

    var host = el('div', 'mc-host');
    var head = el('div', 'mc-head');
    var toggle = el('button', 'mc-toggle');
    toggle.type = 'button';
    toggle.appendChild(el('span', 'mc-count', '评论 0'));
    head.appendChild(toggle);
    var listEl = el('div', 'mc-list');
    var form = buildForm(w, null);
    if (opts.collapsedInput) form.classList.add('mc-hidden');
    host.appendChild(head);
    host.appendChild(listEl);
    host.appendChild(form);
    container.appendChild(host);

    w.listEl = listEl;
    w.form = form;
    w.countEl = toggle.querySelector('.mc-count');
    w.fill = function (thread) { fillThread(w, thread); };

    toggle.addEventListener('click', function () {
      var hidden = form.classList.toggle('mc-hidden');
      toggle.classList.toggle('mc-active', !hidden);
    });

    requestThread(w);
    return w;
  }

  function buildForm(w, parent) {
    var form = el('form', parent ? 'mc-form mc-form-reply' : 'mc-form');
    var nick = el('input', 'mc-nick');
    nick.type = 'text';
    nick.placeholder = L.nick + '(可留空)';
    nick.maxLength = 40;
    var area = el('textarea', 'mc-textarea');
    area.placeholder = parent ? L.reply + ' @' + parent.nick : '';
    area.maxLength = 2000;
    var hp = el('input', 'mc-hp'); // 蜜罐：真实用户不可见，机器人填了会被服务端静默丢弃
    hp.type = 'text';
    hp.name = 'website';
    hp.tabIndex = -1;
    hp.autocomplete = 'off';
    var submit = el('button', 'mc-submit', L.submit);
    submit.type = 'submit';
    var err = el('div', 'mc-error');
    form.appendChild(nick);
    form.appendChild(area);
    form.appendChild(hp);
    form.appendChild(submit);
    form.appendChild(err);

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var body = area.value.trim();
      if (!body) { err.textContent = L.bodyRequired; return; }
      submit.disabled = true;
      var payload = { nick: nick.value.trim(), body: body, website: hp.value };
      if (parent) payload.parent = parent.id;
      var xhr = new XMLHttpRequest();
      xhr.open('POST', api + '/comments?key=' + encodeURIComponent(w.key), true);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4) return;
        submit.disabled = false;
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            var thread = JSON.parse(xhr.responseText).thread;
            if (thread) {
              w.fill(thread);
              area.value = '';
              nick.value = '';
              err.textContent = '';
            }
          } catch (ex) { err.textContent = L.failed; }
        } else {
          var msg = L.failed;
          try { msg = JSON.parse(xhr.responseText).error || msg; } catch (ex) { /* keep */ }
          err.textContent = msg;
        }
      };
      xhr.send(JSON.stringify(payload));
    });
    return form;
  }

  function renderTree(w) {
    var map = {}, children = {}, roots = [];
    w.comments.forEach(function (c) { map[c.id] = c; });
    w.comments.forEach(function (c) {
      var p = c.parent && map[c.parent];
      if (p) { (children[p.id] = children[p.id] || []).push(c); }
      else roots.push(c);
    });

    function renderNode(c) {
      var item = el('div', 'mc-item');
      var head = el('div', 'mc-item-head');
      var nick;
      if (c.deleted) {
        nick = el('span', 'mc-nick-text mc-muted', L.deleted);
      } else if (c.link) {
        nick = el('a', 'mc-nick-text');
        nick.href = c.link;
        nick.target = '_blank';
        nick.rel = 'nofollow noopener';
        nick.textContent = c.nick;
      } else {
        nick = el('span', 'mc-nick-text', c.nick);
      }
      head.appendChild(nick);
      head.appendChild(el('span', 'mc-time', fmtTime(c.createdAt)));
      var body = el('div', 'mc-body');
      if (c.deleted) {
        body.classList.add('mc-muted');
        body.textContent = L.deleted;
      } else {
        body.innerHTML = fmtBody(c.body);
      }
      var foot = el('div', 'mc-item-foot');
      var replyBtn = el('button', 'mc-reply', L.reply);
      replyBtn.type = 'button';
      foot.appendChild(replyBtn);
      item.appendChild(head);
      item.appendChild(body);
      item.appendChild(foot);

      (children[c.id] || []).forEach(function (k) {
        var box = item.querySelector('.mc-children') || (function () {
          var b = el('div', 'mc-children');
          item.appendChild(b);
          return b;
        })();
        box.appendChild(renderNode(k));
      });

      replyBtn.addEventListener('click', function () {
        var existing = item.querySelector('.mc-form-reply');
        if (existing) { existing.parentNode.removeChild(existing); return; }
        var f = buildForm(w, c);
        item.appendChild(f);
        f.querySelector('.mc-textarea').focus();
      });
      return item;
    }

    w.listEl.innerHTML = '';
    if (!w.comments.length) {
      w.listEl.appendChild(el('div', 'mc-empty', L.empty));
      return;
    }
    roots.forEach(function (c) { w.listEl.appendChild(renderNode(c)); });
  }

  function fillThread(w, thread) {
    w.comments = thread.comments || [];
    w.countEl.textContent = '评论 ' + visibleCount(w.comments);
    renderTree(w);
  }

  /* ---------------- 模式 ---------------- */

  if (cfg.mode === 'moments') {
    // 供 moments.js 在渲染每条动态时调用：card 上挂一个该动态的评论线程
    window.momentsCommentsAttach = function (card, key) {
      var box = el('div', 'mc-slot');
      card.appendChild(box);
      createThread(box, key, { collapsedInput: true });
    };
  }

  if (cfg.mode === 'post') {
    var host = document.getElementById('blog-comments');
    if (host) createThread(host, 'post:' + location.pathname, { collapsedInput: false });
  }

  window.blogCommentsApi = { api: api }; // 调试用
})();
