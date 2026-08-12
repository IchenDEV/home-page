#!/usr/bin/env node
/**
 * Snapshot everything the homepage needs from GitHub into data/github.json.
 *
 * Runs with zero dependencies. A token (GITHUB_TOKEN / GH_TOKEN) unlocks the
 * GraphQL contribution calendar and lifts the REST rate limit; without one we
 * fall back to the public contributions proxy so local runs still work.
 */

import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const USER = process.env.GH_USER || 'IchenDEV';
const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
const OUT = resolve(ROOT, 'data/github.json');

/** Repos that are noise on a homepage even when they rank well. */
const EXCLUDE = new Set([USER, `${USER}.github.io`, 'test-wx-cloud', 'code-test']);

/** Hand-pinned repos always shown first, in this order. */
const PINNED = ['kite', 'utter', 'superman', 'prompt-optimizer-plugins', 'larkfs', 'yemai'];

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

async function main() {
  console.log(`> fetching github data for ${USER}${TOKEN ? ' (authenticated)' : ' (anonymous)'}`);

  const [user, repoPages, contributions, activity] = await Promise.all([
    api(`/users/${USER}`),
    Promise.all([
      api(`/users/${USER}/repos?per_page=100&sort=pushed&page=1`),
      api(`/users/${USER}/repos?per_page=100&sort=pushed&page=2`),
    ]).then((pages) => pages.flat()),
    fetchContributions().catch((err) => {
      console.warn(`  contributions unavailable: ${err.message}`);
      return { total: 0, days: [] };
    }),
    fetchActivity().catch((err) => {
      console.warn(`  activity unavailable: ${err.message}`);
      return [];
    }),
  ]);

  const own = repoPages.filter((r) => !r.fork);
  const payload = {
    generated_at: new Date().toISOString(),
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
      contributions: contributions.total,
    },
    languages: summarizeLanguages(own),
    repos: rankRepos(repoPages),
    contributions,
    activity,
  };

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, `${JSON.stringify(payload, null, 2)}\n`);

  console.log(`> wrote ${OUT}`);
  console.log(`  ${payload.repos.length} repos, ${payload.stats.stars} stars, ` +
    `${payload.contributions.days.length} days, ${payload.activity.length} events`);
}

main().catch(async (err) => {
  console.error(`! fetch failed: ${err.message}`);
  // Never clobber a good snapshot with a failed run.
  try {
    await readFile(OUT);
    console.error('  keeping existing data/github.json');
    process.exit(0);
  } catch {
    process.exit(1);
  }
});
