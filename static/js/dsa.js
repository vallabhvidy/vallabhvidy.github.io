// DSA Dynamic Stats & Heatmap Engine
(function () {
  'use strict';

  const CACHE_KEY = 'dsa_stats_cache_v4';
  const CACHE_TTL = 30 * 60 * 1000; // 30 minutes cache

  let currentYear = 'latest'; // 'latest' | '2026' | '2025' | '2024'
  let currentPlatform = 'all'; // 'all' | 'leetcode' | 'codeforces'
  let globalData = null;

  // Format number with commas
  function fmt(n) {
    if (n === null || n === undefined || isNaN(n)) return '—';
    return Number(n).toLocaleString('en-US');
  }

  // Load stats from cache, local JSON, or live APIs
  async function init() {
    setupEventListeners();

    // 1. Check localStorage
    let cached = null;
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Date.now() - (parsed._cachedAt || 0) < CACHE_TTL) {
          cached = parsed;
        }
      }
    } catch (e) {}

    if (cached) {
      globalData = cached;
      applyStats(globalData);
      renderHeatmap();
    } else {
      // 2. Fetch static data file
      try {
        const res = await fetch('/static/data/dsa-stats.json');
        if (res.ok) {
          globalData = await res.json();
          applyStats(globalData);
          renderHeatmap();
        }
      } catch (err) {
        console.warn('[DSA] Failed to load local stats JSON:', err);
      }
    }

    // 3. Background live synchronization with Codeforces & LeetCode APIs
    syncLiveAPIs();
  }

  // Live API Fetcher
  async function syncLiveAPIs() {
    try {
      const fetchWithTimeout = (url, timeoutMs = 8000) => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        return fetch(url, { signal: controller.signal })
          .then(res => res.json())
          .finally(() => clearTimeout(timeout));
      };

      const [cfInfoRes, cfRatingRes, cfStatusRes, lcProfileRes, lcContestRes] = await Promise.allSettled([
        fetchWithTimeout('https://codeforces.com/api/user.info?handles=vallabhvidy'),
        fetchWithTimeout('https://codeforces.com/api/user.rating?handle=vallabhvidy'),
        fetchWithTimeout('https://codeforces.com/api/user.status?handle=vallabhvidy&from=1&count=10000'),
        fetchWithTimeout('https://alfa-leetcode-api.onrender.com/userProfile/vallabhvidy', 15000),
        fetchWithTimeout('https://alfa-leetcode-api.onrender.com/vallabhvidy/contest', 15000)
      ]);

      let hasNewData = false;
      const data = globalData ? JSON.parse(JSON.stringify(globalData)) : { leetcode: {}, codeforces: {} };

      // Process Codeforces data
      if (cfInfoRes.status === 'fulfilled' && cfInfoRes.value.status === 'OK' && cfInfoRes.value.result[0]) {
        const u = cfInfoRes.value.result[0];
        data.codeforces.rating = u.rating;
        data.codeforces.maxRating = u.maxRating;
        data.codeforces.rank = u.rank;
        data.codeforces.maxRank = u.maxRank;
        hasNewData = true;
      }

      if (cfRatingRes.status === 'fulfilled' && cfRatingRes.value.status === 'OK') {
        data.codeforces.contestsCount = cfRatingRes.value.result.length;
        hasNewData = true;
      }

      if (cfStatusRes.status === 'fulfilled' && cfStatusRes.value.status === 'OK') {
        const cfCalendar = {};
        const cfSolved = new Set();
        cfStatusRes.value.result.forEach(sub => {
          const d = new Date(sub.creationTimeSeconds * 1000);
          const dateStr = d.toISOString().split('T')[0];
          cfCalendar[dateStr] = (cfCalendar[dateStr] || 0) + 1;
          if (sub.verdict === 'OK' && sub.problem) {
            cfSolved.add(sub.problem.contestId + '-' + sub.problem.index);
          }
        });
        data.codeforces.calendar = cfCalendar;
        data.codeforces.problemsSolved = cfSolved.size;
        hasNewData = true;
      }

      // Process LeetCode data
      if (lcProfileRes.status === 'fulfilled' && lcProfileRes.value.totalSolved !== undefined) {
        const p = lcProfileRes.value;
        data.leetcode.totalSolved = p.totalSolved;
        data.leetcode.easySolved = p.easySolved;
        data.leetcode.mediumSolved = p.mediumSolved;
        data.leetcode.hardSolved = p.hardSolved;
        data.leetcode.ranking = p.ranking;

        if (p.submissionCalendar) {
          const cal = typeof p.submissionCalendar === 'string' ? JSON.parse(p.submissionCalendar) : p.submissionCalendar;
          const lcCalendar = {};
          for (const [ts, count] of Object.entries(cal)) {
            const d = new Date(parseInt(ts) * 1000);
            const dateStr = d.toISOString().split('T')[0];
            lcCalendar[dateStr] = (lcCalendar[dateStr] || 0) + count;
          }
          data.leetcode.calendar = lcCalendar;
        }
        hasNewData = true;
      }

      if (lcContestRes.status === 'fulfilled' && lcContestRes.value.contestRating !== undefined) {
        const c = lcContestRes.value;
        data.leetcode.contestRating = Math.round(c.contestRating);
        data.leetcode.contestTopPercentage = c.contestTopPercentage;
        data.leetcode.contestAttended = c.contestAttend;
        hasNewData = true;
      }

      if (hasNewData) {
        data._cachedAt = Date.now();
        globalData = data;
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify(data));
        } catch (e) {}

        applyStats(globalData);
        renderHeatmap();
      }
    } catch (e) {
      console.warn('[DSA] Live sync completed with fallback:', e);
    }
  }

  // Update DOM elements with live numbers
  function applyStats(data) {
    if (!data) return;

    // --- LEETCODE ---
    if (data.leetcode) {
      const lc = data.leetcode;
      const elTotal = document.getElementById('lc-total-solved');
      if (elTotal && lc.totalSolved) elTotal.textContent = lc.totalSolved + '+';

      const elEasy = document.getElementById('lc-easy-val');
      if (elEasy && lc.easySolved !== undefined) elEasy.textContent = lc.easySolved;

      const elMed = document.getElementById('lc-med-val');
      if (elMed && lc.mediumSolved !== undefined) elMed.textContent = lc.mediumSolved;

      const elHard = document.getElementById('lc-hard-val');
      if (elHard && lc.hardSolved !== undefined) elHard.textContent = lc.hardSolved;

      // LeetCode Contest Card
      if (lc.contestRating) {
        const elCr = document.getElementById('lc-contest-val');
        if (elCr) elCr.textContent = fmt(lc.contestRating);

        const elPeak = document.getElementById('lc-contest-peak-val');
        if (elPeak) elPeak.textContent = fmt(lc.contestRating);
      }
      if (lc.contestTopPercentage !== undefined) {
        const elTop = document.getElementById('lc-contest-top-val');
        if (elTop) elTop.textContent = `${lc.contestTopPercentage}%`;
      }
    }

    // --- CODEFORCES ---
    if (data.codeforces) {
      const cf = data.codeforces;
      const elRating = document.getElementById('cf-rating-val');
      if (elRating && cf.rating) elRating.textContent = fmt(cf.rating);

      const elPeak = document.getElementById('cf-peak-val');
      if (elPeak && cf.maxRating) elPeak.textContent = fmt(cf.maxRating);

      const elTitle = document.getElementById('cf-title-val');
      if (elTitle && cf.rank) {
        elTitle.textContent = cf.rank.charAt(0).toUpperCase() + cf.rank.slice(1);
      }
    }
  }

  // Setup tab click and dropdown handlers
  function setupEventListeners() {
    // Platform tabs
    const platformTabs = document.querySelectorAll('#heatmap-platform-tabs .heatmap-tab-btn');
    platformTabs.forEach(btn => {
      btn.addEventListener('click', function () {
        platformTabs.forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        currentPlatform = this.getAttribute('data-platform');
        renderHeatmap();
      });
    });

    // Year Dropdown in Header
    const yearSelect = document.getElementById('heatmap-year-select');
    if (yearSelect) {
      if (yearSelect.value) {
        currentYear = yearSelect.value;
      }
      yearSelect.addEventListener('change', function () {
        currentYear = this.value;
        renderHeatmap();
      });
    }
  }

  // Render Heatmap Matrix
  function renderHeatmap() {
    const container = document.getElementById('heatmap-grid');
    if (!container || !globalData) return;

    const lcCal = (globalData.leetcode && globalData.leetcode.calendar) || {};
    const cfCal = (globalData.codeforces && globalData.codeforces.calendar) || {};

    const today = new Date();
    const isLatest = currentYear === 'latest';
    let start, end;

    if (isLatest) {
      // Rolling 53 weeks ending on the current week so the rightmost column is today's week
      const endDay = today.getUTCDay();
      end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
      end.setUTCDate(end.getUTCDate() + (6 - endDay));
      start = new Date(end);
      start.setUTCDate(end.getUTCDate() - (53 * 7 - 1));
    } else {
      // Calendar year (2026, 2025, 2024): Jan 1 to Dec 31
      const y = parseInt(currentYear, 10);
      start = new Date(Date.UTC(y, 0, 1));
      end = new Date(Date.UTC(y, 11, 31));
    }

    const startDay = start.getUTCDay(); // 0 = Sun, 1 = Mon ... 6 = Sat
    const totalDays = Math.round((end - start) / 86400000) + 1;
    const totalWeeks = Math.ceil((totalDays + startDay) / 7);

    // Compute month label start weeks
    const monthColMap = {};
    for (let d = 0; d < totalDays; d++) {
      const cur = new Date(start);
      cur.setUTCDate(start.getUTCDate() + d);
      if (cur.getUTCDate() === 1) {
        const mName = cur.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
        const week = Math.floor((d + startDay) / 7);
        if (monthColMap[week] === undefined) {
          monthColMap[week] = mName;
        }
      }
    }
    if (monthColMap[0] === undefined) {
      monthColMap[0] = start.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
    }

    // Tally submissions for the selected year/range and platform
    let yearTotal = 0;
    const dateData = {};

    const oneYearAgo = new Date(today);
    oneYearAgo.setUTCDate(today.getUTCDate() - 365);

    for (let d = 0; d < totalDays; d++) {
      const cur = new Date(start);
      cur.setUTCDate(start.getUTCDate() + d);
      const dateStr = cur.toISOString().split('T')[0];
      const lcCount = lcCal[dateStr] || 0;
      const cfCount = cfCal[dateStr] || 0;

      let count = 0;
      if (currentPlatform === 'all') {
        count = lcCount + cfCount;
      } else if (currentPlatform === 'leetcode') {
        count = lcCount;
      } else if (currentPlatform === 'codeforces') {
        count = cfCount;
      }

      if (isLatest) {
        if (cur <= today && cur >= oneYearAgo) {
          yearTotal += count;
        }
      } else {
        if (cur <= today && dateStr.startsWith(currentYear)) {
          yearTotal += count;
        }
      }
      dateData[dateStr] = { count, lcCount, cfCount, date: cur };
    }

    // Update header total count & label
    const elTotal = document.getElementById('heatmap-total-count');
    if (elTotal) elTotal.textContent = fmt(yearTotal);

    const elYear = document.getElementById('heatmap-selected-year');
    if (elYear) {
      elYear.textContent = isLatest ? 'the last year' : currentYear;
    }


    // Intensity scale thresholds
    function getLevel(c) {
      if (c <= 0) return 0;
      if (c <= 2) return 1;
      if (c <= 5) return 2;
      if (c <= 9) return 3;
      return 4;
    }

    // Construct DOM
    container.innerHTML = '';

    const table = document.createElement('div');
    table.className = 'heatmap-table';

    // 1. Months Header Row
    const monthsRow = document.createElement('div');
    monthsRow.className = 'heatmap-months-row';

    const spacer = document.createElement('div');
    spacer.className = 'heatmap-weekday-spacer';
    monthsRow.appendChild(spacer);

    const monthsContainer = document.createElement('div');
    monthsContainer.className = 'heatmap-months-container';

    // Month labels positioned as percentage across responsive width
    for (let w = 0; w < totalWeeks; w++) {
      if (monthColMap[w]) {
        const mLabel = document.createElement('span');
        mLabel.className = 'heatmap-month-label';
        mLabel.textContent = monthColMap[w];
        if (w >= totalWeeks - 2) {
          mLabel.style.right = '0px';
          mLabel.style.left = 'auto';
        } else {
          mLabel.style.left = ((w / totalWeeks) * 100).toFixed(2) + '%';
        }
        monthsContainer.appendChild(mLabel);
      }
    }
    monthsRow.appendChild(monthsContainer);
    table.appendChild(monthsRow);

    // 2. Days Area (Weekdays + Weeks Grid)
    const daysRow = document.createElement('div');
    daysRow.className = 'heatmap-days-row';

    const weekdaysCol = document.createElement('div');
    weekdaysCol.className = 'heatmap-weekdays-col';
    weekdaysCol.innerHTML = `
      <span></span>
      <span>Mon</span>
      <span></span>
      <span>Wed</span>
      <span></span>
      <span>Fri</span>
      <span></span>
    `;
    daysRow.appendChild(weekdaysCol);

    const weeksGrid = document.createElement('div');
    weeksGrid.className = 'heatmap-weeks-grid';

    const tooltip = document.getElementById('heatmap-tooltip');

    for (let w = 0; w < totalWeeks; w++) {
      const col = document.createElement('div');
      col.className = 'heatmap-week-col';

      for (let d = 0; d < 7; d++) {
        const dayOffset = w * 7 + d - startDay;
        const cell = document.createElement('div');

        if (dayOffset >= 0 && dayOffset < totalDays) {
          const curDate = new Date(start);
          curDate.setUTCDate(start.getUTCDate() + dayOffset);
          const dateStr = curDate.toISOString().split('T')[0];

          // If the date is after today, render subtle future placeholder cell
          const isFuture = curDate > today;

          if (isFuture) {
            cell.className = 'heatmap-cell cell-future';
          } else {
            const info = dateData[dateStr] || { count: 0, lcCount: 0, cfCount: 0 };
            const level = getLevel(info.count);

            cell.className = `heatmap-cell level-${level}`;
            cell.setAttribute('data-date', dateStr);
            cell.setAttribute('data-count', info.count);
            cell.setAttribute('data-lc', info.lcCount);
            cell.setAttribute('data-cf', info.cfCount);

            // Tooltip interactions
            cell.addEventListener('mouseenter', function () {
              if (!tooltip) return;
              const dt = new Date(dateStr + 'T00:00:00Z');
              const dateFormatted = dt.toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                timeZone: 'UTC'
              });

              let text = '';
              if (info.count === 0) {
                text = `No submissions on ${dateFormatted}`;
              } else if (info.count === 1) {
                text = `<strong>1 submission</strong> on ${dateFormatted}`;
                if (currentPlatform === 'all') {
                  text += ` <span style="opacity:0.75">(LC: ${info.lcCount}, CF: ${info.cfCount})</span>`;
                }
              } else {
                text = `<strong>${info.count} submissions</strong> on ${dateFormatted}`;
                if (currentPlatform === 'all') {
                  text += ` <span style="opacity:0.75">(LC: ${info.lcCount}, CF: ${info.cfCount})</span>`;
                }
              }

              tooltip.innerHTML = text;
              tooltip.classList.remove('hidden');

              const rect = cell.getBoundingClientRect();
              const wrapperRect = container.closest('.heatmap-scroll-area').getBoundingClientRect();
              const left = rect.left - wrapperRect.left + (rect.width / 2);
              const top = rect.top - wrapperRect.top;

              // Keep tooltip within card bounds near edges
              if (w >= totalWeeks - 8) {
                tooltip.style.transform = 'translate(-92%, -130%)';
              } else if (w < 4) {
                tooltip.style.transform = 'translate(-8%, -130%)';
              } else {
                tooltip.style.transform = 'translate(-50%, -130%)';
              }

              tooltip.style.left = left + 'px';
              tooltip.style.top = top + 'px';
            });

            cell.addEventListener('mouseleave', function () {
              if (tooltip) tooltip.classList.add('hidden');
            });
          }
        } else {
          cell.className = 'heatmap-cell cell-empty';
          cell.style.visibility = 'hidden';
        }

        col.appendChild(cell);
      }
      weeksGrid.appendChild(col);
    }

    daysRow.appendChild(weeksGrid);
    table.appendChild(daysRow);
    container.appendChild(table);
  }

  // Initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
