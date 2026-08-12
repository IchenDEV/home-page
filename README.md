# idevlab — home page

个人主页。终端风格（与 [blogs.idevlab.dev](https://blogs.idevlab.dev) 共用同一套设计变量），
Three.js 做 3D，项目 / 贡献 / 动态全部来自 GitHub，自动更新。

## 有什么

- **3D 英雄区** — 线框地形 + 粒子场 + 呼吸中的多面体，跟随鼠标视差、随滚动推进镜头。
- **3D 贡献热力图** — 过去一年的 commit 拉成立体柱阵，可拖动旋转、悬停看当天数据。
- **项目卡片** — 鼠标追踪的 3D 倾斜与光泽，数据直接取自 GitHub API。
- **5 套配色** — green / amber / cyan / magenta / white，与博客同款，`t` 键循环；WebGL 图层会一起换色。
- **键盘操作** — `j`/`k` 滚动，`gg`/`G` 到顶/底，`t` 换主题。
- 无框架、无构建步骤，Three.js 已 vendored 到 `vendor/`，离线可跑。

## 本地开发

```bash
npm run fetch   # 抓取 GitHub 数据 → data/github.json
npm run dev     # http://localhost:4173
```

`npm run fetch` 不带 token 也能跑（走公开 API + 贡献图代理），只是会受匿名速率限制。
带 token 更稳，也能拿到官方的贡献日历：

```bash
GITHUB_TOKEN="$(gh auth token)" npm run fetch
```

## 数据从哪来

`scripts/fetch-github.mjs` 在构建时把资料快照进 `data/github.json`，页面读的是这个文件——
所以访客不会消耗 GitHub 的匿名速率限制，首屏也不用等 API。万一文件缺失，前端会退回直接调用
GitHub API，页面不会空着。

抓取失败时脚本**不会**覆盖已有快照，构建仍然用上一次的好数据。

几个可调的地方，都在 `scripts/fetch-github.mjs` 顶部：

| 常量 | 作用 |
| --- | --- |
| `PINNED` | 置顶项目，按数组顺序排前面 |
| `EXCLUDE` | 不想出现在主页的仓库 |
| `USER` | GitHub 用户名（也可用环境变量 `GH_USER`） |

友情链接在 `js/main.js` 顶部的 `LINKS` 数组里，加一项就行。

## 部署

> **当前状态：未部署。** 仓库是私有的，而免费版 GitHub **不支持私有仓库使用 Pages**
> （API 原话：`Your current plan does not support GitHub Pages for this repository.`）。
> 所以 `.github/workflows/deploy.yml` 目前只保留手动触发（`workflow_dispatch`），
> push 和每天定时都注释掉了——否则每天定时跑都会失败并发报错邮件。

### GitHub Pages

前提是**把仓库改成 public**，或者账号升级到 GitHub Pro。满足之后：

1. 取消注释 `deploy.yml` 里的 `push` 和 `schedule` 两个触发器。
2. Settings → Pages → Source 选 **GitHub Actions**。
3. 想要官方贡献日历的话，加一个 `PAT_GITHUB` secret（classic token，勾 `read:user`）。
   不加也能跑，脚本会自动走公开代理。

> 默认的 `GITHUB_TOKEN` 读不到 contributions GraphQL，这是唯一需要 PAT 的地方。

仓库里有 `.nojekyll`，Jekyll 不会去处理 `vendor/`、`js/` 这些目录。

### Vercel

Vercel 对私有仓库没有限制，所以这条路现在就能走：导入仓库即可，`vercel.json` 已经写好，
构建命令跑抓取脚本，输出目录是仓库根。
想让 Vercel 也定时刷新数据，在项目里开一个 Cron Job 打 Deploy Hook，或者直接依赖
GitHub Actions 每天的 push。

## 结构

```
index.html            页面骨架
css/style.css         设计变量（与博客同步）+ 全部样式
js/main.js            数据加载、各区块渲染、主题 / 键盘 / 交互
js/scene.js           英雄区 WebGL 场景
js/contrib3d.js       3D 贡献热力图
scripts/fetch-github.mjs   构建期抓取 GitHub 数据
scripts/serve.mjs     本地静态服务器（零依赖）
vendor/three.module.js     Three.js r169
data/github.json      生成的数据快照（已提交）
```

## 无障碍与降级

- 尊重 `prefers-reduced-motion`：关掉打字机、倾斜、自动旋转，动画大幅放缓。
- 没有 WebGL 也不会白屏——两个 3D 场景都会静默跳过，内容照常显示。
- 标签页隐藏 / 图表滚出视口时暂停渲染，不空耗 GPU。
