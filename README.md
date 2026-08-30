# idevlab — home page

个人主页。终端风格（与 [blogs.idevlab.dev](https://blogs.idevlab.dev) 共用同一套设计变量），
Three.js 做 3D，项目 / 贡献 / 动态来自 GitHub，最新文章来自博客索引，由 GitHub Actions 每天同步并发布到 GitHub Pages。

## 有什么

- **3D 英雄区** — 线框地形 + 粒子场 + 呼吸中的多面体，跟随鼠标视差、随滚动推进镜头。
- **3D 贡献热力图** — 过去一年的 commit 拉成立体柱阵，可拖动旋转、悬停看当天数据。
- **项目卡片** — 鼠标追踪的 3D 倾斜与光泽，数据直接取自 GitHub API。
- **5 套配色** — green / amber / cyan / magenta / white，与博客同款，`t` 键循环；WebGL 图层会一起换色。
- **键盘操作** — `j`/`k` 滚动，`gg`/`G` 到顶/底，`t` 换主题。
- **本地 LLM 对话** — 导航栏 `_chat` 打开终端窗口，`/load` 后 Qwen3-0.6B 直接在访客浏览器里推理
  （WebLLM + WebGPU，引擎跑在 Web Worker 里）。权重从 Hugging Face 按需下载、进浏览器缓存，
  对话不出本机；GPU 不支持 f16 时自动换 f32 权重，`/model` 可切到 Qwen3.5-0.8B。
- 无框架、无构建步骤，Three.js 与 WebLLM 已 vendored 到 `vendor/`，页面本体离线可跑。

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

## 数据从哪来

`.github/workflows/deploy.yml` 在每天 **03:00 UTC（杭州 / 新加坡 11:00）**运行一次：

1. 读取 GitHub 用户、仓库、贡献和公开活动；
2. 从 `IchenDEV/IchenDEV.github.io` 仓库的 `gh-pages/index.html` 读取结构化文章索引，取最新 3 篇；
3. 更新并提交 `data/github.json` 到 `main`；
4. 页面优先读取这份静态快照，读取失败时才调用 GitHub 公开 API。

抓取任一数据源失败时，工作流会失败并保留仓库里的上一份快照，不会用空数据覆盖现有内容。

几个可调的地方，都在 `scripts/fetch-github.mjs` 顶部：

| 常量 | 作用 |
| --- | --- |
| `PINNED` | 置顶项目，按数组顺序排前面 |
| `EXCLUDE` | 不想出现在主页的仓库 |
| `USER` | GitHub 用户名（也可用环境变量 `GH_USER`） |
| `BLOG_REPO` | 博客 GitHub 仓库（也可用同名环境变量覆盖） |
| `BLOG_REF` | 博客发布分支（默认 `gh-pages`） |

友情链接在 `js/main.js` 顶部的 `LINKS` 数组里，加一项就行。

## 部署

### GitHub Actions（每日同步）

工作流已包含 `schedule` 与手动触发入口。默认 `GITHUB_TOKEN` 可以刷新公开数据并把快照提交回仓库；
想直接读取官方贡献日历，可以再添加 `PAT_GITHUB` secret（classic token，勾 `read:user`），
否则脚本会自动走公开代理。

> 默认的 `GITHUB_TOKEN` 读不到 contributions GraphQL，这是唯一需要 PAT 的地方。

### GitHub Pages

`.github/workflows/pages.yml` 在 `main` 分支有新提交时，将页面所需的静态文件打包并发布到 GitHub Pages。
每日同步产生的提交会自动触发 Pages 部署；也可以从 Actions 页面手动运行。

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
.github/workflows/deploy.yml  每日数据同步与快照提交
.github/workflows/pages.yml   GitHub Pages 静态发布
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
