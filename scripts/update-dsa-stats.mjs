import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_PATH = path.resolve(__dirname, '../static/data/dsa-stats.json');

const CF_HANDLE = 'vallabhvidy';
const LC_HANDLE = 'vallabhvidy';

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

// Direct LeetCode GraphQL queries
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
    contest: contestRes?.data?.userContestRanking
  };
}

async function updateStats() {
  console.log('🔄 Fetching DSA statistics from official APIs...');

  let existing = {
    updatedAt: new Date().toISOString(),
    leetcode: {},
    codeforces: {}
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
    codeforces: { ...(existing.codeforces || {}) }
  };

  let cfUpdated = false;
  let lcUpdated = false;

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
      data.codeforces.contestsCount = cfRatingRes.value.result.length;
      console.log(`✅ Codeforces contests: ${data.codeforces.contestsCount}`);
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
      lcUpdated = true;
      console.log(`✅ LeetCode contest: rating=${data.leetcode.contestRating}, topPercentage=${data.leetcode.contestTopPercentage}%, attended=${data.leetcode.contestAttended}`);
    }
  } catch (err) {
    console.warn('⚠️ LeetCode GraphQL fetch failed:', err.message);
  }

  // 3. Write back to dsa-stats.json
  if (cfUpdated || lcUpdated) {
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
