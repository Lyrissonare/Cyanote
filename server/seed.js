import { db, createArticle } from './db.js';

const force = process.argv.includes('--force');

const { n } = db.prepare('SELECT COUNT(*) AS n FROM articles').get();
if (n > 0 && !force) {
  console.log(`数据库中已有 ${n} 篇文章，跳过种子数据（使用 --force 重新初始化）`);
  process.exit(0);
}
if (force) db.exec('DELETE FROM articles');

const iso = (y, m, d, h = 9) => new Date(Date.UTC(y, m - 1, d, h)).toISOString();

const svgCover = (from, to) =>
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="480"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs><rect width="1200" height="480" fill="url(#g)"/><circle cx="1000" cy="80" r="160" fill="#ffffff22"/><circle cx="180" cy="420" r="120" fill="#ffffff18"/><text x="70" y="260" font-family="system-ui,Segoe UI,sans-serif" font-size="64" font-weight="700" fill="#ffffffec">Cyanote</text><text x="72" y="330" font-family="system-ui,Segoe UI,sans-serif" font-size="28" fill="#ffffffb0">Render ideas in blue.</text></svg>`
  );

const posts = [
  {
    slug: 'hello-cyanote',
    title: '你好，Cyanote — 从零搭建一个蓝色博客',
    status: 'published',
    categories: ['技术'],
    tags: ['Cyanote', 'Node.js', '博客'],
    pinned: 1,
    published_at: iso(2025, 1, 6),
    cover: svgCover('#0b3bbf', '#3b82f6'),
    excerpt: 'Cyanote 是我为自己打造的博客系统：Hexo 式的阅读体验、语雀式的写作体验，以及一抹贯穿始终的蓝。',
    content: `# 你好，Cyanote

这是一篇「关于本站」的文章，也是系统自我介绍的演示稿。

## 为什么是蓝色

> 蓝色是天空、是海洋，也是代码高亮里最安详的颜色。
> —— 本站的信条

全局特征色为蓝色：链接、徽章、按钮、代码块边框……一切皆蓝。

## 特性一览

- **阅读**：首页、文章列表、分类、标签、归档，布局参照 Hexo 等成熟博客
- **写作**：语雀式的 Markdown 编辑器，实时预览，可拖拽 / 粘贴上传图片
- **外观**：暗色 / 亮色主题一键切换；首页可开启「未来主义」先锋风格
- **管理**：草稿与发布、目录（slug）、置顶、浏览计数，全部通过 REST API

## 技术选型

| 层 | 技术 |
| --- | --- |
| 后端 | Node.js + Express + 内置 SQLite |
| 前端 | 原生 JS 单页应用（无构建步骤） |
| 渲染 | marked + DOMPurify + Prism 高亮 |

\`\`\`js
// 一段表白的代码
const cyanote = async (idea) => {
  const draft = await writer.start(idea);
  return publisher.note(draft).withColor('blue');
};
cyanote('Hello, Blue');
\`\`\`

祝你和你的博客都保持明亮 🌊
`,
  },
  {
    slug: 'node-sqlite-guide',
    title: 'Node.js 内置 SQLite 使用指南',
    status: 'published',
    categories: ['技术'],
    tags: ['Node.js', 'SQLite', '后端'],
    published_at: iso(2025, 2, 14),
    excerpt: '从 Node 22.5 开始，node:sqlite 成为内置模块。这篇文章记录它的 API 与最佳实践。',
    content: `# Node.js 内置 SQLite 使用指南

从 \`node:sqlite\` 进入稳定性航道后，我们不再需要 \`better-sqlite3\` 的原生编译。

## 快速上手

\`\`\`js
import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync('blog.db');
db.exec('CREATE TABLE IF NOT EXISTS posts (id INTEGER PRIMARY KEY, title TEXT)');
db.prepare('INSERT INTO posts (title) VALUES (?)').run('第一篇');
console.log(db.prepare('SELECT * FROM posts').all());
\`\`\`

## 三个要点

1. **同步 API**：与 better-sqlite3 一样同步、直接、快
2. **预处理语句**：始终用 \`?\` 占位符，杜绝注入
3. **WAL 模式**：读多写少的博客场景，并发收益明显

> 小技巧：\`PRAGMA journal_mode = WAL\` 应该在建表之前执行。
`,
  },
  {
    slug: 'design-a-blog-in-blue',
    title: '用「蓝」设计一个博客：从色板到氛围',
    status: 'published',
    categories: ['设计'],
    tags: ['设计', 'CSS', '色彩'],
    published_at: iso(2025, 3, 22),
    excerpt: '蓝色博客的设计语言：一套色板、两套主题、一种“先锋”可能。',
    content: `# 用「蓝」设计一个博客

## 一套色板

\`\`\`css
:root {
  --accent: #3b82f6;        /* 主蓝 */
  --accent-strong: #2563eb; /* 深蓝 */
  --accent-soft: #dbeafe;   /* 淡蓝底色 */
}
\`\`\`

暗色模式下把主蓝微微调亮，让它在深底上依旧清澈：

\`\`\`css
[data-theme='dark'] {
  --accent: #60a5fa;
  --accent-strong: #3b82f6;
  --accent-soft: #1e3a5f;
}
\`\`\`

## 两种性格

- **经典模式**：白纸黑字、留白与衬线标题 —— 安静地阅读
- **未来主义**：动态网格、霓虹描边、玻璃拟态 —— 先锋地登场

未来主义不是默认，而是一种可选的情绪。首页右上角的大门，随时为它敞开。
`,
  },
  {
    slug: 'markdown-editor-notes',
    title: '语雀式编辑器是怎样炼成的：实时预览与图片上传',
    status: 'published',
    categories: ['技术'],
    tags: ['Markdown', '编辑器', '前端'],
    published_at: iso(2025, 4, 2),
    excerpt: '拆解 Cyanote 编辑器：防抖渲染、视图切换、拖拽粘贴上传的完整链路。',
    content: `# 语雀式编辑器是怎样炼成的

## 实时预览的关键：防抖

\`\`\`js
let timer;
textarea.addEventListener('input', () => {
  clearTimeout(timer);
  timer = setTimeout(render, 250); // 输入停顿 250ms 后渲染
});
\`\`\`

## 三种视图

- **编辑**：沉浸写作
- **双栏**：左写右看，语雀默认
- **预览**：只看成稿

## 图片上传链路

1. 拖拽或粘贴图片到编辑器
2. \`FormData\` 上传到 \`POST /api/uploads\`
3. 服务端落盘 \`data/uploads\`，返回 URL
4. 光标处插入 \`![图片](url)\`，预览立即呈现成图

> 多图连贴？一次排队上传，逐个插入，成功一个展示一个。
`,
  },
  {
    slug: 'spring-reading-list',
    title: '三月书单：读完这五本，春天才算完整',
    status: 'published',
    categories: ['生活'],
    tags: ['阅读', '随笔'],
    published_at: iso(2025, 3, 8),
    excerpt: '春天适合读一点闲书。这个书单里既有技术史，也有小说与随笔。',
    content: `# 三月书单

春天适合读一点闲书。这个书单里既有技术史，也有小说与随笔。

1. 《编码：隐匿在计算机软硬件背后的语言》
2. 《设计中的设计》
3. 《夜晚的潜水艇》
4. 《克拉拉与太阳》
5. 《把时间当作朋友》

## 为什么读书

> 我们读的书，最终都会在某个下午，成为我们说出的话。

配一杯绿茶，页边有晨光，这就是理想的周末。
`,
  },
  {
    slug: 'waltz-of-blue',
    title: '蓝色圆舞曲：写给代码的十四行',
    status: 'published',
    categories: ['随笔'],
    tags: ['随笔', '诗'],
    published_at: iso(2025, 5, 20),
    excerpt: '一首关于程序员与蓝色的短诗。',
    content: `# 蓝色圆舞曲

在屏幕的深海里，指针是发光的鱼。
一路潜行，捕获注释般漂浮的念头，
把它们放回合适的洞穴，然后
让主循环安静地，一遍遍，跳起圆舞。

> 半成品，经过四十五次提交，
> 终于长成它该有的样子。
> 你问它为什么这么蓝？
> 因为蓝色，是最诚实的颜色。

---

*写于一个深夜，服务器绿灯闪烁的时分。*
`,
  },
  {
    slug: 'refactor-plan-draft',
    title: '博客重构规划（草稿）',
    status: 'draft',
    categories: ['技术'],
    tags: ['规划'],
    published_at: null,
    excerpt: '这是一篇未发布的草稿：记录下一阶段的重构想法。',
    content: `# 博客重构规划（草稿）

## 想法清单

- [ ] 全文检索：加入 FTS5 索引
- [ ] 评论：基于 GitHub Issues 方案
- [ ] RSS 订阅输出
- [ ] 图片自动生成 WebP 缩略图

> 未完成的想法，像没发酵完的咖啡豆 —— 先放心上，不急着磨。
`,
  },
];

for (const p of posts) {
  const { published_at, ...rest } = p;
  const article = createArticle(rest);
  db.prepare('UPDATE articles SET published_at = ?, updated_at = ? WHERE slug = ?').run(
    published_at || new Date().toISOString(),
    published_at || new Date().toISOString(),
    article.slug
  );
}

console.log(`种子数据完成：${posts.length} 篇文章已写入（含 1 篇草稿）`);
console.log('管理令牌：设置环境变量 CYANOTE_TOKEN；未设置时服务首次启动会自动生成并保存到 data/admin-token');
