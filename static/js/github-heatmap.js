// GitHub Contributions Heatmap Engine
(function () {
  'use strict';

  const CACHE_KEY = 'gh_stats_cache_v1';
  const CACHE_TTL = 30 * 60 * 1000; // 30 minutes cache

  let currentYear = 'latest'; // 'latest' | '2026' | '2025' | '2024' | '2023'
  let globalData = null;

  function fmt(n) {
    if (n === null || n === undefined || isNaN(n)) return '0';
    return Number(n).toLocaleString('en-US');
  }

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
      renderHeatmap();
    } else {
      // 2. Fetch local fallback JSON
      try {
        const res = await fetch('/static/data/github-stats.json');
        if (res.ok) {
          globalData = await res.json();
          renderHeatmap();
        }
      } catch (err) {
        console.warn('[GitHub Heatmap] Failed to load local stats JSON:', err);
      }
    }

    // 3. Background live synchronization
    syncLiveAPI();
  }

  async function syncLiveAPI() {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const res = await fetch('https://github-contributions-api.jogruber.de/v4/vallabhvidy', {
        signal: controller.signal
      }).finally(() => clearTimeout(timeout));

      if (res.ok) {
        const fresh = await res.json();
        fresh._cachedAt = Date.now();
        globalData = fresh;
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify(fresh));
        } catch (e) {}
        renderHeatmap();
      }
    } catch (err) {
      console.warn('[GitHub Heatmap] Live sync completed with fallback:', err);
    }
  }

  function setupEventListeners() {
    const yearSelect = document.getElementById('gh-heatmap-year-select');
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

  function renderHeatmap() {
    const container = document.getElementById('gh-heatmap-grid');
    if (!container || !globalData) return;

    // Build fast date lookup dictionary
    const contribList = globalData.contributions || [];
    const dateMap = {};
    for (let i = 0; i < contribList.length; i++) {
      const item = contribList[i];
      dateMap[item.date] = item;
    }

    const today = new Date();
    const isLatest = currentYear === 'latest';
    let start, end;

    if (isLatest) {
      // Rolling 53 weeks ending on today's week Saturday
      const endDay = today.getUTCDay();
      end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
      end.setUTCDate(end.getUTCDate() + (6 - endDay));
      start = new Date(end);
      start.setUTCDate(end.getUTCDate() - (53 * 7 - 1));
    } else {
      // Calendar year: Jan 1 to Dec 31
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

    // Tally contributions for selected range
    let yearTotal = 0;
    const oneYearAgo = new Date(today);
    oneYearAgo.setUTCDate(today.getUTCDate() - 365);

    for (let d = 0; d < totalDays; d++) {
      const cur = new Date(start);
      cur.setUTCDate(start.getUTCDate() + d);
      const dateStr = cur.toISOString().split('T')[0];
      const entry = dateMap[dateStr];
      const count = entry ? entry.count : 0;

      if (isLatest) {
        if (cur <= today && cur >= oneYearAgo) {
          yearTotal += count;
        }
      } else {
        if (cur <= today) {
          yearTotal += count;
        }
      }
    }

    // Update footer total count & year label
    const elTotal = document.getElementById('gh-heatmap-total-count');
    if (elTotal) elTotal.textContent = fmt(yearTotal);

    const elSelectedYear = document.getElementById('gh-heatmap-selected-year');
    if (elSelectedYear) {
      elSelectedYear.textContent = isLatest ? 'the last year' : currentYear;
    }

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

    const tooltip = document.getElementById('gh-heatmap-tooltip');

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

          const isFuture = curDate > today;

          if (isFuture) {
            cell.className = 'heatmap-cell cell-future';
          } else {
            const entry = dateMap[dateStr];
            const count = entry ? entry.count : 0;
            const level = entry && entry.level !== undefined ? entry.level : getLevel(count);

            cell.className = `heatmap-cell level-${level}`;
            cell.setAttribute('data-date', dateStr);
            cell.setAttribute('data-count', count);

            // Tooltip interaction
            cell.addEventListener('mouseenter', function () {
              if (!tooltip) return;
              const text = count === 1 ? '1 contribution' : `${count} contributions`;

              tooltip.textContent = text;
              tooltip.classList.remove('hidden');

              const rect = cell.getBoundingClientRect();
              const wrapperRect = container.closest('.heatmap-scroll-area').getBoundingClientRect();
              const left = rect.left - wrapperRect.left + (rect.width / 2);
              const top = rect.top - wrapperRect.top;

              // Keep tooltip within bounds near edges
              if (w >= totalWeeks - 4) {
                tooltip.style.transform = 'translate(-85%, -130%)';
              } else if (w < 3) {
                tooltip.style.transform = 'translate(-15%, -130%)';
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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
