#!/usr/bin/env node
/**
 * Snapshot everything the homepage needs from GitHub into data/github.json.
 *
 * Runs with zero dependencies. A token (GITHUB_TOKEN / GH_TOKEN) unlocks the
 * GraphQL contribution calendar and lifts the REST rate limit; without one we
 * fall back to the public contributions proxy so local runs still work.
 *
 * Each source is fetched independently. When one fails, its section is carried
 * over from the previous snapshot and keeps its old timestamp in `sync`, so a
 * flaky API never blanks a section and the page can tell what is stale.
 */

import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const USER = process.env.GH_USER || 'IchenDEV';
const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
const BLOG_URL = process.env.BLOG_URL || 'https://blogs.idevlab.dev';
// The blog is deployed by GitHub Actions straight to Pages, so the live site is
// the only place its built index is current (the old gh-pages branch froze on
// 2026-06-12 when the blog switched deploy methods).
const BLOG_INDEX_URL = process.env.BLOG_INDEX_URL || `${BLOG_URL.replace(/\/$/, '')}/`;
const BLOG_POSTS = 5;
const OUT = resolve(ROOT, 'data/github.json');
const MAX_BLOG_BYTES = 1_000_000;

/** Repos that are noise on a homepage even when they rank well. */
const EXCLUDE = new Set([USER, `${USER}.github.io`, 'test-wx-cloud', 'code-test']);

/** Hand-pinned repos always shown first, in this order. */
const PINNED = [
  'doubao-skin',
  'agent-plugin-mkt',
  'kite',
  'utter',
  'superman',
  'prompt-optimizer-plugins',
  'larkfs',
  'yemai',
];

const headers = {
  'accept': 'application/vnd.github+json',
  'user-agent': `${USER}-home-page`,
  ...(TOKEN ? { authorization: `Bearer ${TOKEN}` } : {}),
};

async function api(path) {
  const res = await fetch(`https://api.github.com${path}`, { headers });
  if (!res.ok) throw new Error(`GET ${path} -> ${res.status} ${await res.text()}`);
  return res.json();
}

async function graphql(query) {
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`graphql -> ${res.status}`);
  const json = await res.json();
  if (json.errors) throw new Error(`graphql -> ${JSON.stringify(json.errors)}`);
  return json.data;
}

/** Calendar via GraphQL when we have a token, else the public proxy. */
async function fetchContributions() {
  if (TOKEN) {
    try {
      const data = await graphql(`{
        user(login: "${USER}") {
          contributionsCollection {
            contributionCalendar {
              totalContributions
              weeks { contributionDays { date contributionCount } }
            }
          }
        }
      }`);
      const cal = data.user.contributionsCollection.contributionCalendar;
      return {
        total: cal.totalContributions,
        days: cal.weeks.flatMap((w) =>
          w.contributionDays.map((d) => ({ date: d.date, count: d.contributionCount }))),
      };
    } catch (err) {
      console.warn(`  contributions: graphql failed (${err.message}), trying proxy`);
    }
  }
  const res = await fetch(`https://github-contributions-api.jogruber.de/v4/${USER}?y=last`);
  if (!res.ok) throw new Error(`contributions proxy -> ${res.status}`);
  const json = await res.json();
  return {
    total: json.total?.lastYear ?? json.contributions.reduce((n, d) => n + d.count, 0),
    days: json.contributions.map((d) => ({ date: d.date, count: d.count })),
  };
}

/**
 * Share of repos per primary language. Counting repos rather than bytes on
 * purpose: repo `size` is dominated by committed build output (a single Hexo
 * site would read as "50% HTML"), which is not what the bar should say.
 */
function summarizeLanguages(repos) {
  const counts = new Map();
  for (const r of repos) {
    if (!r.language) continue;
    counts.set(r.language, (counts.get(r.language) || 0) + 1);
  }
  const total = [...counts.values()].reduce((a, b) => a + b, 0) || 1;
  return [...counts.entries()]
    .map(([name, n]) => ({ name, count: n, percent: +((n / total) * 100).toFixed(1) }))
    .sort((a, b) => b.percent - a.percent)
    .slice(0, 8);
}

/** Pinned first, then genuinely recent work — this section is "最近的项目". */
function rankRepos(repos) {
  const own = repos.filter((r) => !r.fork && !r.archived && !EXCLUDE.has(r.name) && r.description);
  const pinnedRank = (r) => {
    const i = PINNED.indexOf(r.name);
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  return own
    .sort((a, b) => {
      const p = pinnedRank(a) - pinnedRank(b);
      if (p !== 0) return p;
      return new Date(b.pushed_at) - new Date(a.pushed_at);
    })
    .slice(0, 12)
    .map((r) => ({
      name: r.name,
      description: r.description,
      language: r.language,
      stars: r.stargazers_count,
      forks: r.forks_count,
      topics: (r.topics || []).slice(0, 4),
      url: r.html_url,
      homepage: r.homepage || null,
      pushed_at: r.pushed_at,
      pinned: PINNED.includes(r.name),
    }));
}

/** Recent public activity, collapsed into one line per event. */
async function fetchActivity() {
  const events = await api(`/users/${USER}/events/public?per_page=100`);
  const verbs = {
    PushEvent: (e) => `pushed ${e.payload.size ?? e.payload.commits?.length ?? 1} commit(s) to`,
    CreateEvent: (e) => `created ${e.payload.ref_type} in`,
    WatchEvent: () => 'starred',
    ReleaseEvent: (e) => `released ${e.payload.release?.tag_name ?? ''} of`,
    PullRequestEvent: (e) => `${e.payload.action} a pull request in`,
    IssuesEvent: (e) => `${e.payload.action} an issue in`,
    ForkEvent: () => 'forked',
    PublicEvent: () => 'open-sourced',
  };
  const out = [];
  for (const e of events) {
    const verb = verbs[e.type];
    if (!verb) continue;
    out.push({ verb: verb(e), repo: e.repo.name, at: e.created_at, type: e.type });
    if (out.length >= 14) break;
  }
  return out;
}

function excerptFromSearchText(title, text) {
  let body = text.replace(/\s+/g, ' ').trim();
  if (body.startsWith(title)) body = body.slice(title.length).trim();
  const end = body.search(/[。！？!?](?:\s|$)/);
  const excerpt = end >= 0 && end < 180 ? body.slice(0, end + 1) : body.slice(0, 180);
  return excerpt.trim();
}

/** Latest posts from the blog's embedded structured search index. */
async function fetchBlog() {
  // Bust intermediate caches: Pages sits behind a CDN with a 10 minute TTL.
  const url = new URL(BLOG_INDEX_URL);
  url.searchParams.set('t', String(Date.now()));
  const res = await fetch(url, {
    headers: { 'user-agent': `${USER}-home-page`, 'cache-control': 'no-cache' },
  });
  if (!res.ok) throw new Error(`blog index -> ${res.status}`);
  const declared = Number(res.headers.get('content-length') || 0);
  if (declared > MAX_BLOG_BYTES) throw new Error('blog response is too large');
  const html = await res.text();
  if (Buffer.byteLength(html) > MAX_BLOG_BYTES) throw new Error('blog response is too large');
  const match = html.match(/<script[^>]*id=["']terminal-search-data["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!match?.[1]) throw new Error('blog search index not found');

  const all = JSON.parse(match[1]).filter((post) => post?.title && post?.url && post?.date);
  const posts = all
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, BLOG_POSTS)
    .map((post) => ({
      title: post.title,
      url: new URL(post.url, BLOG_URL).href,
      date: post.date,
      excerpt: excerptFromSearchText(post.title, post.text || ''),
      tags: Array.isArray(post.tags) ? post.tags.slice(0, 4) : [],
    }));

  if (!posts.length) throw new Error('blog search index contains no posts');
  return { url: BLOG_URL, total: all.length, posts };
}

async function readPrevious() {
  try {
    return JSON.parse(await readFile(OUT, 'utf8'));
  } catch {
    return null;
  }
}

/** Resolve a source, or carry the previous section over when it fails. */
async function settle(label, promise, fallback) {
  try {
    return { value: await promise, fresh: true };
  } catch (err) {
    console.warn(`  ${label} unavailable: ${err.message}`);
    if (fallback === undefined) throw err;
    console.warn(`  ${label}: keeping previous snapshot`);
    return { value: fallback, fresh: false };
  }
}

async function main() {
  console.log(`> fetching github data for ${USER}${TOKEN ? ' (authenticated)' : ' (anonymous)'}`);
  const prev = await readPrevious();
  const now = new Date().toISOString();

  const [core, contributions, activity, blog] = await Promise.all([
    // User + repos are the backbone of the page; without them there is nothing
    // new worth writing, so this one is allowed to fail the run.
    settle('github', Promise.all([
      api(`/users/${USER}`),
      Promise.all([
        api(`/users/${USER}/repos?per_page=100&sort=pushed&page=1`),
        api(`/users/${USER}/repos?per_page=100&sort=pushed&page=2`),
      ]).then((pages) => pages.flat()),
    ])),
    settle('contributions', fetchContributions().then((c) => {
      if (!c.days.length) throw new Error('empty calendar');
      return c;
    }), prev?.contributions),
    settle('activity', fetchActivity(), prev?.activity),
    settle('blog', fetchBlog(), prev?.blog),
  ]);

  const [user, repoPages] = core.value;
  const own = repoPages.filter((r) => !r.fork);
  const stamp = (res, key) => (res.fresh ? now : prev?.sync?.[key] || prev?.generated_at || null);
  const payload = {
    generated_at: now,
    sync: {
      github_at: now,
      contributions_at: stamp(contributions, 'contributions_at'),
      activity_at: stamp(activity, 'activity_at'),
      blog_at: stamp(blog, 'blog_at'),
    },
    user: {
      login: user.login,
      name: user.name,
      bio: user.bio,
      avatar: user.avatar_url,
      blog: user.blog,
      location: user.location,
      followers: user.followers,
      following: user.following,
      created_at: user.created_at,
      url: user.html_url,
    },
    stats: {
      public_repos: user.public_repos,
      own_repos: own.length,
      stars: own.reduce((n, r) => n + r.stargazers_count, 0),
      forks: own.reduce((n, r) => n + r.forks_count, 0),
      contributions: contributions.value?.total ?? 0,
      posts: blog.value?.total ?? null,
    },
    languages: summarizeLanguages(own),
    repos: rankRepos(repoPages),
    contributions: contributions.value || { total: 0, days: [] },
    activity: activity.value || [],
    blog: blog.value || { url: BLOG_URL, posts: [] },
  };

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, `${JSON.stringify(payload, null, 2)}\n`);

  console.log(`> wrote ${OUT}`);
  console.log(`  ${payload.repos.length} repos, ${payload.stats.stars} stars, ` +
    `${payload.contributions.days.length} days, ${payload.activity.length} events, ` +
    `${payload.blog.posts.length} posts (latest ${payload.blog.posts[0]?.date ?? 'n/a'})`);
  const stale = Object.entries(payload.sync).filter(([, at]) => at !== now).map(([k]) => k);
  if (stale.length) console.warn(`  stale sections: ${stale.join(', ')}`);
}

main().catch((err) => {
  console.error(`! fetch failed: ${err.message}`);
  // Never clobber a good snapshot with a failed run.
  console.error('  keeping existing data/github.json');
  process.exit(1);
});
