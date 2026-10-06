/* Cyanote 管理台 — Yuque-style Markdown editor with quick-toolbar.
   Hidden entry at /admin (never linked from the public site); token required. */
import { get, post, put, del, getToken, setToken, uploadImage } from './api.js';
import { renderMarkdown } from '/js/markdown.js';
import { escapeHtml, debounce, toast, slugify } from '/js/util.js';

const DRAFT_KEY = 'cyanote-editor-draft';
const MODE_KEY = 'cyanote-editor-mode';
const ICON = {
  bold: '<path d="M8 5h6.6a3.4 3.4 0 0 1 0 6.8H8zM8 11.8h7.4a3.4 3.4 0 0 1 0 6.8H8z"/>',
  italic: '<path d="M10.4 5h7.6v2h-3.2l-3.6 10h3.6v2H7.2v-2h3.2l3.6-10H10.4z"/>',
  underline: '<path d="M6 5h2v8a4 4 0 0 0 8 0V5h2v9a6 6 0 0 1-12 0zM6 19h12v2H6z"/>',
  strike: '<path d="M4.5 10.5h15v2.6h-15zM9 7.2c0-1.7 1.6-2.4 3-2.4 1.8 0 3 .8 3 2.1h2c0-2.5-2.3-4.1-5-4.1-2.8 0-5 1.5-5 4.4v.8h2zM15 16.4c0 1.7-1.6 2.4-3 2.4-1.9 0-3.2-.8-3.2-2.3h-2c0 2.7 2.4 4.3 5.2 4.3 2.9 0 5-1.5 5-4.4v-1h-2z"/>',
  h2: '<path d="M6 5h2v6h8V5h2v14h-2v-6H8v6H6z"/><path d="M18 13.5c.7-1.3 2-2 3.4-2 1.8 0 2.6 1 2.6 2.2 0 1-.6 1.7-1.8 2.8l-2.4 2.2v.3h4.5v1.6H17V19l3.4-3.2c.9-.8 1.1-1.2 1.1-1.7 0-.5-.4-.9-1-.9-.8 0-1.4.5-1.7 1.2z"/>',
  quote: '<path d="M7.5 6.5h5v6H9.6c0 2-1 3.2-2.9 3.6v-2.2c.8-.2 1.1-.6 1.1-1.4h-.3zM14.5 6.5h5v6h-2.9c0 2-1 3.2-2.9 3.6v-2.2c.8-.2 1.1-.6 1.1-1.4h-.3z"/>',
  ul: '<circle cx="5.2" cy="6.7" r="1.35"/><circle cx="5.2" cy="12" r="1.35"/><circle cx="5.2" cy="17.3" r="1.35"/><path d="M9.5 6.7H20M9.5 12H20M9.5 17.3H20" stroke-width="1.6"/>',
  ol: '<path d="M5 4.6h1.6v3.6H5V6.4H4.2V5.4H5zM5 9.6h2.4v1.1l-1.4 1.6h1.4v1.1H5v-1.2l1.4-1.6H5zM5 14.4h2.2v1.1H6.2v.4l1 .7v1l-1-.7-1.2.8v-1.1l1-.6v-.5H5zM9.8 6.2H20M9.8 11.5H20M9.8 16.8H20" stroke-width="1.6"/>',
  task: '<rect x="4" y="4.2" width="6" height="6" rx="1.6"/><path d="M5.5 7.2l1.3 1.3 2-2.4"/><path d="M12.5 6.4H20M12.5 11.5H20M12.5 16.6H20" stroke-width="1.6"/>',
  code: '<path d="M9.5 8.2L5.5 12l4 3.8M14.5 8.2l4 3.8-4 3.8"/>',
  codeblock: '<rect x="3.5" y="4.8" width="17" height="14.4" rx="2"/><path d="M8 9.2l-1.8 2L8 13.2M16 9.2l1.8 2-1.8 2M13.4 9l-2.8 6"/>',
  link: '<path d="M10 13.8a3.6 3.6 0 0 0 5.1 0l3-3a3.6 3.6 0 0 0-5.1-5.1l-1.2 1.2M14 10.2a3.6 3.6 0 0 0-5.1 0l-3 3a3.6 3.6 0 0 0 5.1 5.1l1.2-1.2"/>',
  image: '<rect x="4" y="4.8" width="16" height="14.4" rx="2"/><circle cx="9.2" cy="9.8" r="1.7"/><path d="M4.5 17l4.4-4.4 2.9 2.9 3.6-3.6 4.1 4.1"/>',
  table: '<rect x="4" y="4.8" width="16" height="14.4" rx="2"/><path d="M4 10h16M4 14h16M12 10v9.2"/>',
  undo: '<path d="M8 6.8L4.6 10l3.4 3.2V10.5h4.7a3.6 3.6 0 0 1 0 7.2h-.6v2h.6a5.6 5.6 0 0 0 0-11.2H8z"/>',
  redo: '<path d="M16 6.8L19.4 10 16 13.2v-2.7h-4.7a3.6 3.6 0 0 0 0 7.2h.6v2h-.6a5.6 5.6 0 0 1 0-11.2H16z"/>',
};

const TOOLBAR_GROUPS = [
  [
    { cmd: 'bold', title: '加粗', icon: ICON.bold },
    { cmd: 'italic', title: '斜体', icon: ICON.italic },
    { cmd: 'underline', title: '下划线', icon: ICON.underline },
    { cmd: 'strike', title: '删除线', icon: ICON.strike },
  ],
  [
    { cmd: 'h2', title: '二级标题', icon: ICON.h2 },
    { cmd: 'quote', title: '引用', icon: ICON.quote },
    { cmd: 'ul', title: '无序列表', icon: ICON.ul },
    { cmd: 'ol', title: '有序列表', icon: ICON.ol },
    { cmd: 'task', title: '任务列表', icon: ICON.task },
  ],
  [
    { cmd: 'code', title: '行内代码', icon: ICON.code },
    { cmd: 'codeblock', title: '代码块', icon: ICON.codeblock },
    { cmd: 'link', title: '链接', icon: ICON.link },
    { cmd: 'image', title: '上传图片', icon: ICON.image },
    { cmd: 'table', title: '表格', icon: ICON.table },
  ],
  [
    { cmd: 'undo', title: '撤销', icon: ICON.undo },
    { cmd: 'redo', title: '重做', icon: ICON.redo },
  ],
];

export async function renderEditor(app, slugParam) {
  await renderEditorBody(app, slugParam);
}

export function renderLogin(app, slugParam, onSuccess) {
  app.innerHTML = `
    <div class="editor-login">
      <h2>🔐 进入管理台</h2>
      <p>输入管理令牌以继续（令牌来自环境变量 CYANOTE_TOKEN，或首次启动时自动生成并保存在服务端 data/admin-token）</p>
      <input type="password" id="login-token" placeholder="管理令牌…" autocomplete="current-password" />
      <div class="error" id="login-error"></div>
      <button class="btn btn-primary" id="login-btn">进入管理台</button>
    </div>
  `;
  const input = app.querySelector('#login-token');
  const errEl = app.querySelector('#login-error');
  const doLogin = async () => {
    const v = input.value.trim();
    if (!v) return;
    setToken(v);
    try {
      await get('/api/auth/check');
      toast('身份验证通过，欢迎回来 ✨', 'ok');
      onSuccess?.();
    } catch (e) {
      setToken('');
      errEl.textContent = e.message || '令牌不正确';
    }
  };
  app.querySelector('#login-btn').addEventListener('click', doLogin);
  input.addEventListener('keydown', (e) => e.key === 'Enter' && doLogin());
  input.focus();
}

async function renderEditorBody(app, slugParam) {
  let article = null;
  if (slugParam) {
    try {
      article = await get(`/api/articles/${encodeURIComponent(slugParam)}`);
    } catch {
      article = null;
    }
  }

  const mode = localStorage.getItem(MODE_KEY) || 'split';
  const isNew = !article;

  let draft = null;
  if (isNew) {
    try {
      draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
    } catch {
      draft = null;
    }
  }

  const toolbarHTML = TOOLBAR_GROUPS.map(
    (group) => `
    <span class="tb-group">
      ${group
        .map(
          (b) =>
            `<button class="tb-btn" data-cmd="${b.cmd}" title="${b.title}" aria-label="${b.title}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${b.icon}</svg></button>`
        )
        .join('')}
    </span>`
  ).join('');

  app.innerHTML = `
    <div class="editor-wrap">
      <div class="editor-topbar">
        <a class="back-link" href="/">← 回到前台</a>
        <a class="back-link" href="/admin/">✏️ 新建</a>
        <div class="view-tabs" id="view-tabs">
          <button class="view-tab" data-mode="edit">编辑</button>
          <button class="view-tab" data-mode="split">双栏</button>
          <button class="view-tab" data-mode="preview">预览</button>
        </div>
        <span class="save-state" id="save-state" data-state="idle"><span class="pulse"></span><span>就绪</span></span>
        <span class="spacer"></span>
        <select id="post-status" class="field-select">
          <option value="draft">草稿</option>
          <option value="published">已发布</option>
        </select>
        <button class="btn btn-ghost btn-sm" id="btn-delete" ${isNew ? 'hidden' : ''}>删除</button>
        <button class="btn btn-ghost btn-sm" id="btn-save">保存 <kbd>⌘S</kbd></button>
        <button class="btn btn-primary btn-sm" id="btn-publish">🚀 发布</button>
      </div>

      <div class="editor-meta">
        <input class="editor-title-input" id="post-title" placeholder="输入文章标题…" value="${escapeHtml(article?.title || draft?.title || '')}" />
        <div class="meta-grid">
          <div class="field">
            <label>链接别名 (slug)</label>
            <input type="text" id="post-slug" placeholder="留空自动生成，如 hello-cyanote" value="${escapeHtml(article?.slug || draft?.slug || '')}" />
          </div>
          <div class="field">
            <label>摘要</label>
            <input type="text" id="post-excerpt" placeholder="留空则自动截取正文前 150 字" value="${escapeHtml(article?.excerpt || draft?.excerpt || '')}" />
          </div>
          <div class="field">
            <label>封面图 URL</label>
            <input type="url" id="post-cover" placeholder="https://… 或 /uploads/xxx.png" value="${escapeHtml(article?.cover || draft?.cover || '')}" />
          </div>
          <div class="field">
            <label>分类</label>
            ${chipsElement('cat', article?.categories || draft?.categories || [], '回车添加，如 技术')}
          </div>
          <div class="field">
            <label>标签</label>
            ${chipsElement('tag', article?.tags || draft?.tags || [], '回车添加，如 Node.js')}
          </div>
        </div>
      </div>

      <div class="editor-pane mode-${mode}" id="editor-pane">
        <div class="editor-input-card editor-dropzone" id="editor-input">
          <div class="editor-pane-head">MARKDOWN <span class="hint">💡 拖拽或粘贴图片，即时上传</span></div>
          <div class="md-toolbar" id="md-toolbar">${toolbarHTML}</div>
          <textarea id="editor-content" placeholder="开始书写… 支持 GFM：表格、任务列表、代码高亮与图片">${escapeHtml(article?.content || draft?.content || '')}</textarea>
          <div class="upload-queue" id="upload-queue" hidden></div>
          <div class="drop-overlay">⬇ 释放以上传图片</div>
          <input type="file" id="img-picker" accept="image/png,image/jpeg,image/gif,image/webp,image/avif" multiple hidden />
        </div>
        <div class="editor-preview-card" id="editor-preview">
          <div class="editor-pane-head">PREVIEW</div>
          <div class="editor-preview-body" id="editor-preview-body"></div>
        </div>
      </div>
    </div>
  `;

  const titleEl = app.querySelector('#post-title');
  const slugEl = app.querySelector('#post-slug');
  const excerptEl = app.querySelector('#post-excerpt');
  const coverEl = app.querySelector('#post-cover');
  const statusEl = app.querySelector('#post-status');
  const ta = app.querySelector('#editor-content');
  const previewBody = app.querySelector('#editor-preview-body');
  const pane = app.querySelector('#editor-pane');
  const queueEl = app.querySelector('#upload-queue');
  const saveStateEl = app.querySelector('#save-state');
  const dropzone = app.querySelector('#editor-input');
  const picker = app.querySelector('#img-picker');

  let currentSlug = article?.slug || '';
  if (article) statusEl.value = article.status;

  // ---- slug auto-fill from title (until user edits slug manually) ----
  let slugTouched = false;
  slugEl.addEventListener('input', () => {
    slugTouched = true;
  });
  titleEl.addEventListener('input', () => {
    if (!slugTouched) {
      slugEl.value = slugify(titleEl.value);
    }
  });

  // ---- view mode tabs ----
  const syncTabs = () => {
    app.querySelectorAll('.view-tab').forEach((t) => t.classList.toggle('active', t.dataset.mode === pane.dataset.mode));
  };
  pane.dataset.mode = mode;
  pane.classList.remove('mode-edit', 'mode-split', 'mode-preview');
  pane.classList.add(`mode-${mode}`);
  syncTabs();
  app.querySelectorAll('.view-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      const m = tab.dataset.mode;
      pane.dataset.mode = m;
      pane.classList.remove('mode-edit', 'mode-split', 'mode-preview');
      pane.classList.add(`mode-${m}`);
      localStorage.setItem(MODE_KEY, m);
      syncTabs();
      if (m !== 'edit') scheduleRender();
    });
  });

  // ---- live preview ----
  const renderPreview = () => {
    const { html } = renderMarkdown(ta.value, { forPreview: true });
    previewBody.innerHTML = html;
  };
  const scheduleRender = debounce(renderPreview, 250);
  ta.addEventListener('input', () => {
    scheduleRender();
    localDraft();
  });
  renderPreview();

  // ---- local autosave (new posts only) ----
  const localDraft = debounce(() => {
    if (currentSlug) return;
    try {
      localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({
          title: titleEl.value,
          slug: slugEl.value,
          excerpt: excerptEl.value,
          cover: coverEl.value,
          content: ta.value,
          categories: chipsValues('cat'),
          tags: chipsValues('tag'),
          savedAt: Date.now(),
        })
      );
    } catch {
      /* ignore */
    }
  }, 1500);

  // ---- save / publish ----
  const setSaveState = (state, text) => {
    saveStateEl.dataset.state = state;
    saveStateEl.lastElementChild.textContent = text;
  };

  const collect = (publish = false) => ({
    title: titleEl.value.trim(),
    slug: slugEl.value.trim(),
    excerpt: excerptEl.value.trim(),
    cover: coverEl.value.trim(),
    content: ta.value,
    categories: chipsValues('cat'),
    tags: chipsValues('tag'),
    status: publish ? 'published' : statusEl.value,
  });

  const doSave = async (publish = false) => {
    const payload = collect(publish);
    if (!payload.title && !payload.content) {
      toast('标题与正文都是空的呢', 'err');
      return;
    }
    setSaveState('saving', '保存中');
    try {
      const saved = currentSlug
        ? await put(`/api/articles/${encodeURIComponent(currentSlug)}`, payload)
        : await post('/api/articles', payload);
      currentSlug = saved.slug;
      history.replaceState(null, '', `/admin/?view=editor&slug=${encodeURIComponent(saved.slug)}`);
      statusEl.value = saved.status;
      slugEl.value = saved.slug;
      localStorage.removeItem(DRAFT_KEY);
      setSaveState('saved', publish ? '已发布' : saved.status === 'published' ? '已保存' : '已存草稿');
      toast(publish ? '🎉 文章已发布！' : saved.status === 'published' ? '💾 保存成功' : '💾 草稿已保存', 'ok');
    } catch (e) {
      setSaveState('error', '失败');
      toast(e.message || '保存失败', 'err');
    }
  };

  app.querySelector('#btn-save').addEventListener('click', () => doSave(false));
  app.querySelector('#btn-publish').addEventListener('click', () => doSave(true));
  const onKey = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      doSave(false);
    }
  };
  window.addEventListener('keydown', onKey);

  const delBtn = app.querySelector('#btn-delete');
  if (currentSlug) {
    delBtn.addEventListener('click', async () => {
      if (!confirm(`确定删除《${titleEl.value.trim() || '未命名'}》吗？此操作不可恢复。`)) return;
      try {
        await del(`/api/articles/${encodeURIComponent(currentSlug)}`);
        localStorage.removeItem(DRAFT_KEY);
        toast('已删除', 'ok');
        location.href = '/admin/?view=posts';
      } catch (e) {
        toast(e.message || '删除失败', 'err');
      }
    });
  }

  // ---- chips inputs ----
  initChips(app);

  // ---- image upload (paste + drop + toolbar picker) ----
  function enqueueUpload(files) {
    const imgs = [...files].filter((f) => f.type.startsWith('image/'));
    if (!imgs.length) return;
    let any = false;
    for (const f of imgs) {
      any = true;
      const item = document.createElement('div');
      item.className = 'upload-item';
      item.innerHTML = `<span class="u-ico" style="background:var(--accent-soft)"></span><span class="u-name">${escapeHtml(f.name || '粘贴的图片')}</span><span class="u-spin"></span><span class="u-status">上传中</span>`;
      queueEl.hidden = false;
      queueEl.appendChild(item);
      uploadImage(f)
        .then((res) => {
          const md = `![${escapeHtml(f.name || 'image')}](${res.url})`;
          pushHist();
          insertAtCursor(md);
          item.classList.add('done');
          item.querySelector('.u-spin')?.remove();
          item.querySelector('.u-status').textContent = '已插入';
          scheduleRender();
        })
        .catch((e) => {
          item.classList.add('fail');
          item.querySelector('.u-spin')?.remove();
          item.querySelector('.u-status').textContent = e.message || '上传失败';
        });
    }
    if (any) {
      setTimeout(() => {
        if (!queueEl.querySelector('.upload-item.fail')) queueEl.hidden = true;
        [...queueEl.querySelectorAll('.upload-item.done')].forEach((d) => d.remove());
      }, 4200);
    }
  }

  function insertAtCursor(md) {
    const start = ta.selectionStart ?? ta.value.length;
    const end = ta.selectionEnd ?? ta.value.length;
    ta.setRangeText(md, start, end, 'end');
    ta.focus();
  }

  ta.addEventListener('paste', (e) => {
    const files = [...(e.clipboardData?.items || [])]
      .filter((it) => it.kind === 'file')
      .map((it) => it.getAsFile())
      .filter(Boolean);
    if (files.length) {
      e.preventDefault();
      enqueueUpload(files);
    }
  });

  ['dragenter', 'dragover'].forEach((ev) =>
    dropzone.addEventListener(ev, (e) => {
      e.preventDefault();
      dropzone.classList.add('dragging');
    })
  );
  ['dragleave', 'drop'].forEach((ev) =>
    dropzone.addEventListener(ev, (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragging');
    })
  );
  dropzone.addEventListener('drop', (e) => {
    enqueueUpload(e.dataTransfer?.files || []);
  });

  // ---- Markdown toolbar (quick-format buttons) ----
  const hist = { undo: [], redo: [] };
  const snap = () => ({ v: ta.value, s: ta.selectionStart, e: ta.selectionEnd });
  function pushHist() {
    hist.undo.push(snap());
    if (hist.undo.length > 200) hist.undo.shift();
    hist.redo.length = 0;
  }
  const restore = (s) => {
    ta.value = s.v;
    ta.focus();
    ta.setSelectionRange(s.s, s.e);
    scheduleRender();
  };
  const undo = () => {
    const s = hist.undo.pop();
    if (!s) return;
    hist.redo.push(snap());
    restore(s);
  };
  const redo = () => {
    const s = hist.redo.pop();
    if (!s) return;
    hist.undo.push(snap());
    restore(s);
  };

  const wrapSelection = (before, after, placeholder) => {
    const s = ta.selectionStart;
    const e = ta.selectionEnd;
    const sel = ta.value.slice(s, e);
    if (sel) {
      ta.setRangeText(before + sel + after, s, e, 'end');
    } else {
      ta.setRangeText(before + placeholder + after, s, e, 'end');
      ta.setSelectionRange(s + before.length, s + before.length + placeholder.length);
    }
  };

  const toggleLinePrefix = (prefix) => {
    const s = ta.selectionStart;
    const e = ta.selectionEnd;
    const val = ta.value;
    const ls = val.lastIndexOf('\n', s - 1) + 1;
    let le = e;
    if (e > s) {
      const nl = val.indexOf('\n', e);
      le = nl === -1 ? val.length : nl;
    } else {
      le = s;
    }
    const block = val.slice(ls, le);
    const lines = block.split('\n');
    const allOn = lines.length > 0 && lines.every((l) => l.startsWith(prefix));
    const next = lines.map((l) => (allOn ? l.slice(prefix.length) : prefix + l)).join('\n');
    ta.setRangeText(next, ls, le, 'end');
  };

  const insertBlock = (text, selectFrom, selectTo) => {
    const s = ta.selectionStart;
    const lineStart = ta.value.lastIndexOf('\n', s - 1) + 1;
    const needNl = s === lineStart ? '' : '\n';
    const insert = needNl + text;
    ta.setRangeText(insert, s, ta.selectionEnd, 'end');
    if (selectFrom !== undefined) {
      const base = s + needNl.length;
      ta.setSelectionRange(base + selectFrom, base + selectTo);
    }
  };

  const COMMANDS = {
    bold: () => wrapSelection('**', '**', '加粗文字'),
    italic: () => wrapSelection('*', '*', '斜体文字'),
    underline: () => wrapSelection('<u>', '</u>', '下划线文字'),
    strike: () => wrapSelection('~~', '~~', '删除线文字'),
    h2: () => toggleLinePrefix('## '),
    quote: () => toggleLinePrefix('> '),
    ul: () => toggleLinePrefix('- '),
    ol: () => toggleLinePrefix('1. '),
    task: () => toggleLinePrefix('- [ ] '),
    code: () => wrapSelection('`', '`', 'code'),
    codeblock: () => {
      const s = ta.selectionStart;
      const e = ta.selectionEnd;
      const sel = ta.value.slice(s, e);
      if (sel) {
        ta.setRangeText('```js\n' + sel + '\n```\n', s, e, 'end');
      } else {
        insertBlock('```js\n\n```\n', 6, 6);
      }
    },
    link: () => {
      insertBlock('[链接文字](https://example.com)\n', 1, 5);
    },
    image: () => picker.click(),
    table: () => {
      insertBlock('| 列 1 | 列 2 | 列 3 |\n| --- | --- | --- |\n|  |  |  |\n', 3, 5);
    },
    undo,
    redo,
  };

  app.querySelectorAll('.tb-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const cmd = btn.dataset.cmd;
      if (cmd === 'undo') return undo();
      if (cmd === 'redo') return redo();
      pushHist();
      COMMANDS[cmd]?.();
      ta.focus();
      scheduleRender();
    });
  });

  picker.addEventListener('change', () => {
    if (picker.files?.length) enqueueUpload([...picker.files]);
    picker.value = '';
  });

  // ---- utility ----
  function chipsValues(role) {
    return [...app.querySelectorAll(`.chips[data-role="${role}"] .chip`)].map((c) => c.dataset.value).filter(Boolean);
  }

  if (!ta.value) titleEl.focus();
  else ta.focus();
}

function chipsElement(role, values, placeholder) {
  return `
    <div class="chips" data-role="${role}" tabindex="0">
      ${values
        .filter((v) => v)
        .map((v) => `<span class="chip" data-value="${escapeHtml(v)}">${escapeHtml(v)}<button type="button" aria-label="移除">✕</button></span>`)
        .join('')}
      <input type="text" placeholder="${placeholder}" />
    </div>`;
}

function initChips(app) {
  app.querySelectorAll('.chips').forEach((box) => {
    const input = box.querySelector('input');
    box.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (btn) {
        btn.closest('.chip').remove();
        return;
      }
      input.focus();
    });
    const commit = () => {
      const v = input.value.trim().replace(/[,，;#]+$/, '');
      if (!v) return;
      if (![...box.querySelectorAll('.chip')].some((c) => c.dataset.value === v)) {
        const span = document.createElement('span');
        span.className = 'chip';
        span.dataset.value = v;
        span.innerHTML = `${escapeHtml(v)}<button type="button" aria-label="移除">✕</button>`;
        box.insertBefore(span, input);
      }
      input.value = '';
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        commit();
      } else if (e.key === 'Backspace' && !input.value) {
        const chips = box.querySelectorAll('.chip');
        if (chips.length) chips[chips.length - 1].remove();
      }
    });
    input.addEventListener('blur', commit);
  });
}
