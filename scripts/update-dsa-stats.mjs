import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_PATH = path.resolve(__dirname, '../static/data/dsa-stats.json');
const GH_DATA_PATH = path.resolve(__dirname, '../static/data/github-stats.json');

const CF_HANDLE = 'vallabhvidy';
const LC_HANDLE = 'vallabhvidy';
const CC_HANDLE = 'vallabhvidy';

async function fetchJSON(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        ...(options.headers || {})
      }
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchText(url, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

// LeetCode official GraphQL queries
async function fetchLeetCodeGraphQL(username) {
  const profileQuery = `
    query userPublicProfile($username: String!) {
      matchedUser(username: $username) {
        submitStatsGlobal {
          acSubmissionNum {
            difficulty
            count
          }
        }
        profile {
          ranking
        }
        userCalendar {
          submissionCalendar
        }
      }
    }
  `;

  const contestQuery = `
    query userContestRankingInfo($username: String!) {
      userContestRanking(username: $username) {
        attendedContestsCount
        rating
        globalRanking
        topPercentage
        badge {
          name
        }
      }
      userContestRankingHistory(username: $username) {
        attended
        rating
        ranking
      }
    }
  `;

  const [profileRes, contestRes] = await Promise.all([
    fetchJSON('https://leetcode.com/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Referer: 'https://leetcode.com'
      },
      body: JSON.stringify({ query: profileQuery, variables: { username } })
    }),
    fetchJSON('https://leetcode.com/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Referer: 'https://leetcode.com'
      },
      body: JSON.stringify({ query: contestQuery, variables: { username } })
    })
  ]);

  return {
    profile: profileRes?.data?.matchedUser,
    contest: contestRes?.data?.userContestRanking,
    history: contestRes?.data?.userContestRankingHistory
  };
}

// CodeChef profile parser
async function fetchCodeChef(username) {
  const html = await fetchText(`https://www.codechef.com/users/${username}`);
  const mRating = html.match(/rating-number">([^<]+)/);
  const mHistory = html.match(/var all_rating\s*=\s*(\[[^;]+\]);/);

  let rating = mRating ? parseInt(mRating[1].trim(), 10) : null;
  let maxRating = rating;
  let bestRank = null;

  if (mHistory) {
    try {
      const list = JSON.parse(mHistory[1]);
      const ratings = list.map(c => parseInt(c.rating, 10)).filter(r => !isNaN(r));
      const ranks = list.map(c => parseInt(c.rank, 10)).filter(r => !isNaN(r) && r > 0);
      if (ratings.length) maxRating = Math.max(...ratings);
      if (ranks.length) bestRank = Math.min(...ranks);
      if (!rating && list.length) rating = parseInt(list[list.length - 1].rating, 10);
    } catch (e) {
      console.warn('⚠️ Could not parse CodeChef history array:', e.message);
    }
  }

  let stars = '1★';
  if (rating >= 2500) stars = '7★';
  else if (rating >= 2200) stars = '6★';
  else if (rating >= 2000) stars = '5★';
  else if (rating >= 1800) stars = '4★';
  else if (rating >= 1600) stars = '3★';
  else if (rating >= 1400) stars = '2★';

  return { rating, maxRating, stars, bestRank };
}

async function updateStats() {
  console.log('🔄 Fetching DSA statistics from official APIs...');

  let existing = {
    updatedAt: new Date().toISOString(),
    leetcode: {},
    codeforces: {},
    codechef: {}
  };

  try {
    if (fs.existsSync(DATA_PATH)) {
      existing = JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));
    }
  } catch (err) {
    console.warn('⚠️ Could not parse existing dsa-stats.json:', err.message);
  }

  const data = {
    ...existing,
    leetcode: { ...(existing.leetcode || {}) },
    codeforces: { ...(existing.codeforces || {}) },
    codechef: { ...(existing.codechef || {}) }
  };

  let cfUpdated = false;
  let lcUpdated = false;
  let ccUpdated = false;

  // 1. Codeforces APIs
  try {
    const [cfInfoRes, cfRatingRes, cfStatusRes] = await Promise.allSettled([
      fetchJSON(`https://codeforces.com/api/user.info?handles=${CF_HANDLE}`),
      fetchJSON(`https://codeforces.com/api/user.rating?handle=${CF_HANDLE}`),
      fetchJSON(`https://codeforces.com/api/user.status?handle=${CF_HANDLE}&from=1&count=10000`)
    ]);

    if (cfInfoRes.status === 'fulfilled' && cfInfoRes.value.status === 'OK' && cfInfoRes.value.result?.[0]) {
      const u = cfInfoRes.value.result[0];
      if (u.rating !== undefined) data.codeforces.rating = u.rating;
      if (u.maxRating !== undefined) data.codeforces.maxRating = u.maxRating;
      if (u.rank) data.codeforces.rank = u.rank;
      if (u.maxRank) data.codeforces.maxRank = u.maxRank;
      cfUpdated = true;
      console.log(`✅ Codeforces profile: rating=${u.rating}, maxRating=${u.maxRating}, rank=${u.rank}`);
    }

    if (cfRatingRes.status === 'fulfilled' && cfRatingRes.value.status === 'OK') {
      const results = cfRatingRes.value.result || [];
      data.codeforces.contestsCount = results.length;
      const ranks = results.map(c => c.rank).filter(r => typeof r === 'number' && r > 0);
      if (ranks.length) {
        data.codeforces.bestRank = Math.min(...ranks);
      }
      console.log(`✅ Codeforces contests: ${data.codeforces.contestsCount}, bestRank: #${data.codeforces.bestRank}`);
      cfUpdated = true;
    }

    if (cfStatusRes.status === 'fulfilled' && cfStatusRes.value.status === 'OK') {
      const cfCalendar = {};
      const cfSolved = new Set();
      for (const sub of cfStatusRes.value.result) {
        const d = new Date(sub.creationTimeSeconds * 1000);
        const dateStr = d.toISOString().split('T')[0];
        cfCalendar[dateStr] = (cfCalendar[dateStr] || 0) + 1;
        if (sub.verdict === 'OK' && sub.problem) {
          cfSolved.add(`${sub.problem.contestId}-${sub.problem.index}`);
        }
      }
      data.codeforces.calendar = cfCalendar;
      data.codeforces.problemsSolved = cfSolved.size;
      console.log(`✅ Codeforces solved: ${cfSolved.size}, active days: ${Object.keys(cfCalendar).length}`);
      cfUpdated = true;
    }
  } catch (err) {
    console.warn('⚠️ Codeforces update error:', err.message);
  }

  // 2. LeetCode official GraphQL
  try {
    console.log('Fetching LeetCode via official GraphQL...');
    const lc = await fetchLeetCodeGraphQL(LC_HANDLE);

    if (lc.profile) {
      const stats = lc.profile.submitStatsGlobal?.acSubmissionNum || [];
      for (const item of stats) {
        if (item.difficulty === 'All') data.leetcode.totalSolved = item.count;
        if (item.difficulty === 'Easy') data.leetcode.easySolved = item.count;
        if (item.difficulty === 'Medium') data.leetcode.mediumSolved = item.count;
        if (item.difficulty === 'Hard') data.leetcode.hardSolved = item.count;
      }
      if (lc.profile.profile?.ranking) {
        data.leetcode.ranking = lc.profile.profile.ranking;
      }
      if (lc.profile.userCalendar?.submissionCalendar) {
        const cal = typeof lc.profile.userCalendar.submissionCalendar === 'string'
          ? JSON.parse(lc.profile.userCalendar.submissionCalendar)
          : lc.profile.userCalendar.submissionCalendar;

        const lcCalendar = {};
        for (const [ts, count] of Object.entries(cal)) {
          const d = new Date(parseInt(ts, 10) * 1000);
          const dateStr = d.toISOString().split('T')[0];
          lcCalendar[dateStr] = (lcCalendar[dateStr] || 0) + count;
        }
        data.leetcode.calendar = lcCalendar;
      }
      lcUpdated = true;
      console.log(`✅ LeetCode profile: totalSolved=${data.leetcode.totalSolved} (E:${data.leetcode.easySolved} M:${data.leetcode.mediumSolved} H:${data.leetcode.hardSolved})`);
    }

    if (lc.contest) {
      if (lc.contest.rating !== undefined) data.leetcode.contestRating = Math.round(lc.contest.rating);
      if (lc.contest.topPercentage !== undefined) data.leetcode.contestTopPercentage = lc.contest.topPercentage;
      if (lc.contest.attendedContestsCount !== undefined) data.leetcode.contestAttended = lc.contest.attendedContestsCount;
      if (lc.contest.badge?.name) {
        data.leetcode.level = lc.contest.badge.name;
      } else if (data.leetcode.contestRating >= 2150) {
        data.leetcode.level = 'Guardian';
      } else if (data.leetcode.contestRating >= 1850) {
        data.leetcode.level = 'Knight';
      }

      // True peak and best rank from contest history
      if (lc.history && Array.isArray(lc.history)) {
        const attended = lc.history.filter(h => h.attended);
        if (attended.length) {
          const ratings = attended.map(h => Math.round(h.rating)).filter(r => !isNaN(r));
          const ranks = attended.map(h => h.ranking).filter(r => typeof r === 'number' && r > 0);
          if (ratings.length) data.leetcode.contestPeak = Math.max(...ratings);
          if (ranks.length) data.leetcode.contestBestRank = Math.min(...ranks);
        }
      }
      lcUpdated = true;
      console.log(`✅ LeetCode contest: rating=${data.leetcode.contestRating}, peak=${data.leetcode.contestPeak}, bestRank=#${data.leetcode.contestBestRank}, level=${data.leetcode.level || '—'}`);
    }
  } catch (err) {
    console.warn('⚠️ LeetCode GraphQL fetch failed:', err.message);
  }

  // 3. CodeChef stats
  try {
    console.log('Fetching CodeChef profile...');
    const cc = await fetchCodeChef(CC_HANDLE);
    if (cc && cc.rating) {
      data.codechef = {
        rating: cc.rating,
        maxRating: cc.maxRating || cc.rating,
        stars: cc.stars,
        bestRank: cc.bestRank || (data.codechef?.bestRank ?? 35)
      };
      ccUpdated = true;
      console.log(`✅ CodeChef profile: rating=${cc.rating}, maxRating=${data.codechef.maxRating}, stars=${cc.stars}, bestRank=#${data.codechef.bestRank}`);
    }
  } catch (err) {
    console.warn('⚠️ CodeChef fetch failed:', err.message);
  }

  // 4. GitHub contributions
  try {
    console.log('Fetching GitHub contributions...');
    const ghData = await fetchJSON('https://github-contributions-api.jogruber.de/v4/vallabhvidy');
    if (ghData && ghData.contributions) {
      fs.mkdirSync(path.dirname(GH_DATA_PATH), { recursive: true });
      fs.writeFileSync(GH_DATA_PATH, JSON.stringify(ghData, null, 2) + '\n', 'utf-8');
      console.log(`🎉 Successfully updated ${GH_DATA_PATH}`);
    }
  } catch (err) {
    console.warn('⚠️ GitHub fetch failed:', err.message);
  }

  // 5. Write back to dsa-stats.json
  if (cfUpdated || lcUpdated || ccUpdated) {
    data.updatedAt = new Date().toISOString();
    fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
    fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2) + '\n', 'utf-8');
    console.log(`🎉 Successfully updated ${DATA_PATH}`);
  } else {
    console.log('ℹ️ No updates retrieved; kept previous stats.');
  }
}

updateStats().catch(err => {
  console.error('❌ Update script error:', err);
  process.exit(1);
});
