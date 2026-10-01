# idevlab — home page

个人主页。与 [blogs.idevlab.dev](https://blogs.idevlab.dev) 同一套「终端邮箱」风格（同名设计变量与组件类名），
Three.js 做 3D，项目 / 贡献 / 动态来自 GitHub，最新文章来自博客线上索引，由 GitHub Actions 每小时抓取并发布到 GitHub Pages。

## 有什么

- **博客同款布局** — 顶部 masthead + 左侧 `_home` 式导航；项目和文章用博客的 From / Subject / Date 邮件行，
  标题与元数据用 Fusion Pixel 像素字体（OFL，已放在 `assets/fonts/`）。
- **3D 英雄区** — 线框地形 + 粒子场 + 呼吸中的多面体，跟随鼠标视差、随滚动推进镜头。
- **3D 贡献热力图** — 过去一年的 commit 拉成立体柱阵，可拖动旋转、悬停看当天数据。
- **同步状态** — 侧栏显示 GitHub / 博客数据各自最后一次刷新时间，数据过期一眼可见。
- **5 套配色** — green / amber / cyan / magenta / white，与博客同款，右上角圆点或 `t` 键循环；WebGL 图层会一起换色。
- **键盘操作** — 与博客一致：`j`/`k` 翻页，`gg`/`G` 到顶/底，`g` 加 `p`/`b`/`a`/`l` 跳到项目 / 文章 / 动态 / 链接，`t` 换主题，`c` 打开对话。
- **本地 LLM 对话** — 导航栏 `_chat` 打开终端窗口，`/load` 后 Qwen3-0.6B 直接在访客浏览器里推理
  （WebLLM + WebGPU，引擎跑在 Web Worker 里）。权重从 Hugging Face 按需下载、进浏览器缓存，
  对话不出本机；GPU 不支持 f16 时自动换 f32 权重，`/model` 可切到 Qwen3.5-0.8B。
- 无框架、无构建步骤，Three.js 与 WebLLM 已 vendored 到 `vendor/`，页面本体离线可跑。
- 像素字体 `font-display: swap`，正文与交互不等待字体或 3D 模块；3D 场景在对应区域接近视口时加载。
- 西湖页脚随深浅主题切换 WebP 插画，以低优先级延迟加载。

## 改版设计稿（designs/，已归档）

2026-08 曾做过 4 版「非终端风」的候选设计（杂志编辑风 / 暗夜极光 / Bento 便当盒 / 新粗野主义），
最终决定**保留终端风格**，线上页面未做替换。`designs/` 仅供日后参考：

| 文件 | 风格 |
| --- | --- |
| `a-editorial.html` | 杂志编辑风（浅色、衬线大标题） |
| `b-aurora.html` | 暗夜极光 · 玻璃拟态（深色） |
| `c-bento.html` | Bento 便当盒（浅色、彩色卡片） |
| `d-brutalist.html` | 新粗野主义（描边硬投影、撞色） |
| `index.html` | 对比选择页（含四版缩略图） |

它们是独立静态稿，数据取自当时的 `data/github.json` 快照并直接写在页面里，
本地看：`npm run dev` 后访问 <http://localhost:4173/designs/>。
Pages 工作流只打包 `index.html` 与 `assets/css/data/js/vendor`，`designs/` 不会被发布到线上；
不需要时直接删掉这个目录即可。

## 本地开发

```bash
npm run fetch   # 抓取 GitHub + 最新博客 → data/github.json
npm run dev     # http://localhost:4173
```

`npm run fetch` 不带 token 也能跑（走公开 API + 贡献图代理），只是会受匿名速率限制。
带 token 更稳，也能拿到官方的贡献日历：

```bash
GITHUB_TOKEN="$(gh auth token)" npm run fetch
```

## 浏览器回归测试

运行 `npm install` 和 `npx playwright install chromium` 准备测试工具，然后在
`npm run dev` 启动后运行 `npm test`。测试覆盖像素字体 / Three.js 请求停滞时的内容与
主题交互、文章与同步状态渲染、页脚图片切换及贡献图按需加载。可用 `TEST_URL` 指定其他预览地址。
Playwright 仅用于开发测试，不参与网页运行或静态发布。

## 数据从哪来

`.github/workflows/pages.yml` 在**每小时**（第 23 分钟）、`main` 有新提交、手动触发，
以及收到 `blog-published` 的 `repository_dispatch` 时运行：

1. 以「仓库里的快照」和「线上 `www.idevlab.dev/data/github.json`」中较新的一份作为上一份快照；
2. 读取 GitHub 用户、仓库、贡献和公开活动；
3. 从博客**线上首页** `https://blogs.idevlab.dev/` 内嵌的 `terminal-search-data` 索引取最新 5 篇和文章总数；
4. 生成 `data/github.json` 并和页面一起发布，不再往 `main` 提交数据。

每个数据源单独失败时，只沿用上一份快照里的对应区块，`sync.*_at` 保留旧时间，侧栏会显示它有多久没更新；
GitHub 主数据失败时整份沿用旧快照照常发布，并在 Actions 里给出 warning。

> 之前文章停在 2026-05：博客改成 Actions 直接部署 Pages 后，`gh-pages` 分支在 2026-06-12 就不再更新，
> 而旧脚本一直读的是它。现在改读线上站点，并对 CDN 缓存加了 cache-busting。

想让博客发文后立刻刷新主页，可以在博客的部署工作流最后加一步（需要一个对本仓库有 `contents: write` 的 token）：

```yaml
- run: gh api repos/IchenDEV/home-page/dispatches -f event_type=blog-published
  env:
    GH_TOKEN: ${{ secrets.HOME_PAGE_DISPATCH_TOKEN }}
```

几个可调的地方，都在 `scripts/fetch-github.mjs` 顶部：

| 常量 | 作用 |
| --- | --- |
| `PINNED` | 置顶项目，按数组顺序排前面 |
| `EXCLUDE` | 不想出现在主页的仓库 |
| `USER` | GitHub 用户名（也可用环境变量 `GH_USER`） |
| `BLOG_URL` / `BLOG_INDEX_URL` | 博客地址 / 读取文章索引的页面（环境变量可覆盖） |
| `BLOG_POSTS` | 主页显示的文章数 |

友情链接在 `js/main.js` 顶部的 `LINKS` 数组里，加一项就行；描述里写 `{posts}` 会替换成博客当前文章数。

## 部署

`.github/workflows/pages.yml` 一个工作流完成抓取 + 打包 + 发布。默认 `GITHUB_TOKEN` 就能抓公开数据；
想直接读取官方贡献日历，可以再添加 `PAT_GITHUB` secret（classic token，勾 `read:user`），
否则脚本会自动走公开代理。

> 默认的 `GITHUB_TOKEN` 读不到 contributions GraphQL，这是唯一需要 PAT 的地方。

仓库里的 `data/github.json` 只是本地开发和抓取失败时的兜底，需要时 `npm run fetch` 后手动提交即可。

自定义域名使用 `www.idevlab.dev`。Cloudflare DNS 应保持一条仅 DNS 的
`CNAME www -> ichendev.github.io`，GitHub Pages 中启用自定义域名并强制 HTTPS。

## 结构

```
index.html            页面骨架
css/style.css         设计变量（与博客同步）+ 全部样式
js/main.js            数据加载、各区块渲染、主题 / 键盘 / 交互
js/scene.js           英雄区 WebGL 场景
js/contrib3d.js       3D 贡献热力图
js/chat.js            本地 LLM 终端（命令、流式输出、加载进度）
js/chat-worker.js     WebLLM 引擎宿主（Web Worker，推理不阻塞页面）
scripts/fetch-github.mjs   构建期抓取 GitHub 数据
scripts/serve.mjs     本地静态服务器（零依赖）
.github/workflows/pages.yml   每小时抓取数据 + GitHub Pages 发布
assets/fonts/         Fusion Pixel 像素字体（与博客同款）及许可证
vendor/three.module.js     Three.js r169
vendor/web-llm.module.js   WebLLM 0.2.84（按需 dynamic import，首屏不加载）
data/github.json      GitHub + 最新博客的静态快照（已提交）
```

## 无障碍与降级

- 尊重 `prefers-reduced-motion`：关掉打字机、倾斜、自动旋转，动画大幅放缓。
- 没有 WebGL 也不会白屏——两个 3D 场景都会静默跳过，内容照常显示。
- 没有 WebGPU 时 `_chat` 会在窗口里说明原因并降级，页面其它功能不受影响；
  模型权重必须用户输入 `/load` 显式触发才开始下载，打开页面不会偷偷拉几百 MB。
- 标签页隐藏 / 图表滚出视口时暂停渲染，不空耗 GPU。
