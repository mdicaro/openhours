// script.js
document.addEventListener('DOMContentLoaded', () => {
  // --- UI Elements ---
  const createPollView = document.getElementById('create-poll-view');
  const pollLinkView = document.getElementById('poll-link-view');
  const participantView = document.getElementById('participant-view');
  const resultsView = document.getElementById('results-view');

  const createPollForm = document.getElementById('create-poll-form');
  const participantForm = document.getElementById('participant-form');

  const pollLink = document.getElementById('poll-link');
  const resultsLink = document.getElementById('results-link');
  const copyLinkBtn = document.getElementById('copy-link-btn');
  const copyResultsBtn = document.getElementById('copy-results-btn');

  const participantEmailInput = document.getElementById('participant-email');
  const emailHistoryDatalist = document.getElementById('email-history');

  const clearSelectionsBtn = document.getElementById('clear-selections-btn');
  const retrieveBtn = document.getElementById('retrieve-availability-btn');

  const organizerTzSelect = document.getElementById('organizer-timezone');
  const participantTzSelect = document.getElementById('participant-timezone');
  const resultsTzSelect = document.getElementById('results-timezone');
  const notifyDiv = document.getElementById('notification');
  const resultsGate = document.getElementById('results-gate');
  const resultsCodeInput = document.getElementById('results-code-input');
  const resultsCodeSubmit = document.getElementById('results-code-submit');

  const tzBanner = document.getElementById('tz-banner');
  const resultsTzBanner = document.getElementById('results-tz-banner');

  const HALF_HOUR_MS = 30 * 60 * 1000;
  const API_URL = '/api/poll';

  let currentPollId = null;
  let currentPollData = null;
  let currentResultsUnlocked = false;
  // Notifications
  const notify = (message, { level = 'success', durationMs = 1800 } = {}) => {
    if (!notifyDiv) return;
    notifyDiv.className = '';
    notifyDiv.classList.add(level === 'error' ? 'error' : (level === 'info' ? 'info' : ''));
    notifyDiv.textContent = message;
    notifyDiv.style.display = 'block';
    if (durationMs > 0) {
      clearTimeout(notifyDiv._hideTimer);
      notifyDiv._hideTimer = setTimeout(() => {
        notifyDiv.style.display = 'none';
      }, durationMs);
    }
  };

  // --- Helper Functions ---
  const getViewerTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

  const supportedTimeZones = () => {
    if (typeof Intl.supportedValuesOf === 'function') {
      return Intl.supportedValuesOf('timeZone');
    }
    // Minimal fallback if needed
    return [
      'UTC','America/New_York','America/Chicago','America/Denver','America/Los_Angeles',
      'Europe/London','Europe/Berlin','Europe/Paris','Asia/Tokyo','Asia/Hong_Kong'
    ];
  };

  const populateTimeZoneSelect = (selectEl, defaultTz) => {
    selectEl.innerHTML = '';
    const tzs = supportedTimeZones();
    tzs.forEach(tz => {
      const opt = document.createElement('option');
      opt.value = tz;
      opt.textContent = tz;
      selectEl.appendChild(opt);
    });
    selectEl.value = tzs.includes(defaultTz) ? defaultTz : 'UTC';
  };

  const parseLocalDate = (yyyyMmDd) => {
    const [y, m, d] = yyyyMmDd.split('-').map(Number);
    return new Date(y, m - 1, d);
  };

  const getDatesInRange = (startDate, endDate) => {
    const dates = [];
    const start = parseLocalDate(startDate);
    const end = parseLocalDate(endDate);
    let cur = new Date(start);
    while (cur <= end) {
      dates.push(new Date(cur));
      cur.setDate(cur.getDate() + 1);
    }
    return dates;
  };

  // Get time-zone offset (minutes) for a given instant in a TZ.
  const tzOffsetAt = (date, timeZone) => {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone, hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
    const parts = dtf.formatToParts(date);
    const map = {};
    for (const { type, value } of parts) map[type] = value;
    const asUTC = Date.UTC(+map.year, +map.month - 1, +map.day, +map.hour, +map.minute, +map.second);
    return (asUTC - date.getTime()) / 60000; // minutes offset from UTC
  };

  // Convert a local wall time (in 'timeZone') to a UTC Date using a two-pass offset (handles DST transitions).
  const zonedTimeToUtc = (y, m, d, hh, mm, timeZone) => {
    let ts = Date.UTC(y, m - 1, d, hh, mm, 0);
    let off = tzOffsetAt(new Date(ts), timeZone);
    ts = ts - off * 60000;
    const off2 = tzOffsetAt(new Date(ts), timeZone);
    if (off2 !== off) {
      ts = Date.UTC(y, m - 1, d, hh, mm, 0) - off2 * 60000;
    }
    return new Date(ts);
  };

  const fmtTimeInZone = (dateUtc, timeZone) =>
    new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit', hour12: true }).format(dateUtc);

  const showView = (viewElement) => {
    document.querySelectorAll('.view').forEach(v => v.style.display = 'none');
    viewElement.style.display = 'block';
  };

  const copyToClipboard = (text, btn) => {
    navigator.clipboard.writeText(text).then(() => {
      const original = btn.textContent;
      btn.textContent = 'Copied!';
      setTimeout(() => (btn.textContent = original), 1500);
    });
  };

  const selectedEpochsFromUI = (containerSelector) => {
    const out = [];
    document.querySelectorAll(`${containerSelector} .time-slot.selected`).forEach(slot => {
      out.push(Number(slot.dataset.slotKey));
    });
    return out;
  };

  const setBannerText = () => {
    if (!currentPollData) return;
    const baseTz = currentPollData.baseTimeZone || 'UTC';
    if (tzBanner) {
      tzBanner.textContent = `Organizer set: ${baseTz} — Displaying in: ${participantTzSelect.value}`;
    }
    if (resultsTzBanner) {
      resultsTzBanner.textContent = `Organizer set: ${baseTz} — Displaying in: ${resultsTzSelect.value}`;
    }
  };

  // Storage schema v2
  // polls: {
  //   [pollId]: {
  //     lastEmail: string,
  //     emails: string[]
  //   }
  // }
  const readStorage = () => JSON.parse(localStorage.getItem('polls') || '{}');
  const writeStorage = (obj) => localStorage.setItem('polls', JSON.stringify(obj));

  const upsertEmailHistory = (pollId, email) => {
    const store = readStorage();
    if (!store[pollId]) store[pollId] = { lastEmail: '', emails: [] };
    const entry = store[pollId];
    if (email && !entry.emails.includes(email)) {
      entry.emails.push(email);
    }
    if (email) entry.lastEmail = email;
    writeStorage(store);
  };

  const loadEmailHistory = (pollId) => {
    const store = readStorage();
    const arr = (store[pollId]?.emails) || [];
    emailHistoryDatalist.innerHTML = '';
    arr.forEach(e => {
      const opt = document.createElement('option');
      opt.value = e;
      emailHistoryDatalist.appendChild(opt);
    });
  };

  // One-time migration from old per-key storage
  const migrateStorageIfNeeded = (pollId) => {
    const store = readStorage();
    if (store[pollId]) return; // already migrated/created
    const legacyLast = localStorage.getItem(`poll-${pollId}-email`);
    const legacyList = JSON.parse(localStorage.getItem(`poll-${pollId}-emails`) || '[]');
    if (!legacyLast && legacyList.length === 0) return;
    store[pollId] = { lastEmail: legacyLast || '', emails: Array.from(new Set([...(legacyList||[]), legacyLast].filter(Boolean))) };
    writeStorage(store);
  };

  // --- Calendar (TZ-aware) ---
  const createCalendar = (containerId, pollData, {
    isInteractive = false,
    initialAvailability = [],
    displayTimeZone
  } = {}) => {
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    container.className = 'calendar-container';

    const initialEpochSet = new Set(initialAvailability.map(Number));
    const baseTz = pollData.baseTimeZone || 'UTC';

    // Parse times (minutes from midnight in organizer's base TZ)
    const [sh, sm] = pollData.startTime.split(':').map(Number);
    const [eh, em] = pollData.endTime.split(':').map(Number);
    const startMin = sh * 60 + sm;
    const endMin = eh * 60 + em;
    const totalSlots = Math.max(0, Math.floor((endMin - startMin) / 30));

    const dates = getDatesInRange(pollData.startDate, pollData.endDate);

    // Left time column — labels shown in the display TZ (using the first date as reference)
    const timeColumn = document.createElement('div');
    timeColumn.className = 'time-column';

    const firstDate = dates[0];
    for (let i = 0; i <= totalSlots; i++) {
      const minutes = startMin + i * 30;
      const y = firstDate.getFullYear();
      const m = firstDate.getMonth() + 1;
      const d = firstDate.getDate();
      const hh = Math.floor(minutes / 60);
      const mm = minutes % 60;

      const utcForLabel = zonedTimeToUtc(y, m, d, hh, mm, baseTz);
      const timeLabel = document.createElement('div');
      timeLabel.className = 'time-label';
      timeLabel.textContent = fmtTimeInZone(utcForLabel, displayTimeZone);
      timeColumn.appendChild(timeLabel);
    }

    // Scrollable wrapper + grid
    const scrollWrapper = document.createElement('div');
    scrollWrapper.className = 'calendar-scroll-wrapper';

    const calendar = document.createElement('div');
    calendar.className = 'calendar';
    if (containerId.includes('results')) {
      calendar.classList.add('results-calendar');
    }

    // Build day columns
    dates.forEach(day => {
      const y = day.getFullYear();
      const m = day.getMonth() + 1;
      const d = day.getDate();

      const dayColumn = document.createElement('div');
      dayColumn.className = 'day-column';

      const dayHeader = document.createElement('div');
      dayHeader.className = 'day-header';
      dayHeader.textContent = `${day.toLocaleDateString('en-US', { weekday: 'short' })} ${d}`;
      dayColumn.appendChild(dayHeader);

      for (let i = 0; i < totalSlots; i++) {
        const minutes = startMin + i * 30;
        const hh = Math.floor(minutes / 60);
        const mm = minutes % 60;

        // Canonical slot key: UTC half-hour index derived from organizer base TZ
        const slotUtc = zonedTimeToUtc(y, m, d, hh, mm, baseTz);
        const epochIndex = Math.floor(slotUtc.getTime() / HALF_HOUR_MS);

        const timeSlot = document.createElement('div');
        timeSlot.className = 'time-slot';
        timeSlot.dataset.slotKey = String(epochIndex);

        // Helpful hover: show the exact time in the display TZ for this cell
        timeSlot.title = `${fmtTimeInZone(slotUtc, displayTimeZone)} (${displayTimeZone})`;

        if (isInteractive && initialEpochSet.has(epochIndex)) {
          timeSlot.classList.add('selected');
        }

        if (isInteractive) {
          timeSlot.addEventListener('mousedown', (e) => {
            e.preventDefault();
            const startState = e.target.classList.toggle('selected');
            let isDragging = true;

            const handleMouseMove = (moveEvent) => {
              if (!isDragging) return;
              const target = moveEvent.target.closest('.time-slot');
              if (target) {
                if (startState) target.classList.add('selected');
                else target.classList.remove('selected');
              }
            };
            const handleMouseUp = () => {
              isDragging = false;
              window.removeEventListener('mousemove', handleMouseMove);
              window.removeEventListener('mouseup', handleMouseUp);
            };
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
          });
        }

        dayColumn.appendChild(timeSlot);
      }

      calendar.appendChild(dayColumn);
    });

    scrollWrapper.appendChild(calendar);
    container.appendChild(timeColumn);
    container.appendChild(scrollWrapper);
  };

  // --- Backend API ---
  const createPoll = async (pollData) => {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pollData)
    });
    return response.json();
  };

  const getPoll = async (pollId) => {
    const response = await fetch(`${API_URL}?id=${pollId}`);
    return response.json();
  };

  const saveAvailability = async (pollId, email, availability, timezone) => {
    const response = await fetch(API_URL, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pollId, email, availability, timezone })
    });
    return response.json();
  };

  // Codes helpers
  const ensureCodesForPoll = (pollId) => {
    const key = `poll-${pollId}-codes`;
    let codes = JSON.parse(localStorage.getItem(key) || 'null');
    if (!codes) {
      const participantCode = Math.random().toString(36).slice(2, 8).toUpperCase();
      const resultsCode = Math.random().toString(36).slice(2, 8).toUpperCase();
      codes = { participantCode, resultsCode };
      localStorage.setItem(key, JSON.stringify(codes));
    }
    return codes;
  };

  // --- Event Handlers ---

  // Create Poll
  createPollForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const startDate = document.getElementById('start-date').value;
    const endDate = document.getElementById('end-date').value;
    const startTime = document.getElementById('start-time').value;
    const endTime = document.getElementById('end-time').value;

    const pollData = {
      startDate,
      endDate,
      startTime,
      endTime,
      baseTimeZone: organizerTzSelect.value || getViewerTimeZone(),
      createdAt: new Date().toISOString(),
      availabilities: {}
    };

    const response = await createPoll(pollData);
    if (response.pollId) {
      currentPollId = response.pollId;
      showPollLink(response.pollId);
    }
  });

  // Participant Save
  participantForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = participantEmailInput.value.trim();
    if (!email) {
      notify('Please enter your email.', { level: 'error', durationMs: 2500 });
      return;
    }
    const timezone = participantTzSelect.value;
    const selectedEpochs = selectedEpochsFromUI('#calendar-container');

    await saveAvailability(currentPollId, email, selectedEpochs, timezone);
    // Store last-used email and history (v2)
    upsertEmailHistory(currentPollId, email);

    notify('Your availability has been saved!');
    handleRouting();
  });

  // Clear (no save)
  clearSelectionsBtn.addEventListener('click', () => {
    document.querySelectorAll('#calendar-container .time-slot.selected').forEach(slot => {
      slot.classList.remove('selected');
    });
  });

  // Retrieve prior availability for the entered email
  retrieveBtn.addEventListener('click', async () => {
    const email = participantEmailInput.value.trim();
    if (!email) {
      notify('Enter your email to retrieve.', { level: 'error', durationMs: 2200 });
      return;
    }
    if (!currentPollId) return;
    currentPollData = await getPoll(currentPollId); // refresh
    const init = (currentPollData.availabilities && currentPollData.availabilities[email]) || [];
    createCalendar('calendar-container', currentPollData, {
      isInteractive: true,
      initialAvailability: init,
      displayTimeZone: participantTzSelect.value
    });
    // Update email history when retrieving too
    upsertEmailHistory(currentPollId, email);
    loadEmailHistory(currentPollId);
    notify('Loaded your saved selections (if any).', { level: 'info' });
  });

  // TZ select changes (participant/results) re-render the grids
  participantTzSelect.addEventListener('change', () => {
    if (!currentPollData) return;
    const init = selectedEpochsFromUI('#calendar-container'); // keep current selections
    createCalendar('calendar-container', currentPollData, {
      isInteractive: true,
      initialAvailability: init,
      displayTimeZone: participantTzSelect.value
    });
    setBannerText();
  });

  resultsTzSelect.addEventListener('change', () => {
    if (!currentPollData) return;
    renderResults(currentPollData);
  });

  copyLinkBtn?.addEventListener('click', () => copyToClipboard(pollLink.href, copyLinkBtn));
  copyResultsBtn?.addEventListener('click', () => copyToClipboard(resultsLink.href, copyResultsBtn));

  const showPollLink = (pollId) => {
    const { participantCode, resultsCode } = ensureCodesForPoll(pollId);
    const pollUrl = `${window.location.origin}/#/poll/${pollId}/${participantCode}`;
    const resultsUrl = `${window.location.origin}/#/results/${pollId}/${resultsCode}`;
    pollLink.href = pollUrl;    pollLink.textContent = pollUrl;
    resultsLink.href = resultsUrl; resultsLink.textContent = resultsUrl;
    showView(pollLinkView);
  };

  const renderResults = (pollData) => {
    const resultsSummary = document.getElementById('results-summary');
    const resultsCalendarContainer = document.getElementById('results-calendar-container');

    // Aggregate
    const allAvailabilities = Object.values(pollData.availabilities || {}).flat();
    const availabilityCounts = allAvailabilities.reduce((acc, slotKey) => {
      acc[slotKey] = (acc[slotKey] || 0) + 1;
      return acc;
    }, {});
    const slotToEmailsMap = {};
    for (const email in (pollData.availabilities || {})) {
      (pollData.availabilities[email] || []).forEach(slotKey => {
        if (!slotToEmailsMap[slotKey]) slotToEmailsMap[slotKey] = [];
        slotToEmailsMap[slotKey].push(email);
      });
    }
    const totalParticipants = Object.keys(pollData.availabilities || {}).length;
    resultsSummary.innerHTML = `<h3>Responses:</h3><p>${totalParticipants} people have responded.</p>`;

    // Calendar
    createCalendar('results-calendar-container', pollData, {
      isInteractive: false,
      initialAvailability: [],
      displayTimeZone: resultsTzSelect.value
    });

    // Colorize cells & tooltips
    const allSlots = resultsCalendarContainer.querySelectorAll('.time-slot');
    allSlots.forEach(slot => {
      const key = slot.dataset.slotKey;
      const count = availabilityCounts[key] || 0;
      const pct = totalParticipants > 0 ? (count / totalParticipants) * 100 : 0;
      const emails = slotToEmailsMap[key] || [];
      const slotUtc = new Date(Number(key) * HALF_HOUR_MS);
      const displayTimeZone = resultsTzSelect.value;
      const baseTz = pollData.baseTimeZone || 'UTC';
      const displayTime = fmtTimeInZone(slotUtc, displayTimeZone);
      const organizerTime = fmtTimeInZone(slotUtc, baseTz);

      let titleText = `${displayTime} (${displayTimeZone})`;
      if (displayTimeZone !== baseTz) {
        titleText += `\n${organizerTime} (Organizer's Time: ${baseTz})`;
      }

      // append counts
      if (count > 0) slot.textContent = count;
      slot.title = `${titleText}\n\n${count} available\n${emails.join('\n')}`;

      if (pct === 100) slot.classList.add('level-5');
      else if (pct >= 75) slot.classList.add('level-4');
      else if (pct >= 50) slot.classList.add('level-3');
      else if (pct >= 25) slot.classList.add('level-2');
      else if (pct > 0) slot.classList.add('level-1');
      else slot.classList.add('level-0');
    });

    setBannerText();
  };

  // --- Routing ---
  const handleRouting = async () => {
    const hash = window.location.hash;

    // Always ensure TZ dropdowns have defaults
    if (organizerTzSelect && !organizerTzSelect.options.length) {
      populateTimeZoneSelect(organizerTzSelect, getViewerTimeZone());
    }
    if (participantTzSelect && !participantTzSelect.options.length) {
      populateTimeZoneSelect(participantTzSelect, getViewerTimeZone());
    }
    if (resultsTzSelect && !resultsTzSelect.options.length) {
      populateTimeZoneSelect(resultsTzSelect, getViewerTimeZone());
    }

    if (hash.startsWith('#/poll/')) {
      // format: #/poll/{pollId}/{participantCode?}
      const parts = hash.split('/');
      currentPollId = parts[2] || '';
      const participantCode = parts[3] || '';
      // Ensure codes exist (local)
      const { participantCode: expectedCode } = ensureCodesForPoll(currentPollId);
      if (participantCode && participantCode !== expectedCode) {
        alert('Invalid participant link.');
      }
      showView(participantView);

      currentPollData = await getPoll(currentPollId);
      if (currentPollData) {
        // Use organizer's base TZ to update banners, and default participant display to viewer (can be changed)
        setBannerText();

        // email autofill + history
        migrateStorageIfNeeded(currentPollId);
        const store = readStorage();
        const savedEmail = store[currentPollId]?.lastEmail || '';
        if (savedEmail) participantEmailInput.value = savedEmail;
        loadEmailHistory(currentPollId);

        // Preselect previous availability for savedEmail, if any
        let initialAvailability = [];
        if (savedEmail && currentPollData.availabilities?.[savedEmail]) {
          initialAvailability = currentPollData.availabilities[savedEmail];
        }

        createCalendar('calendar-container', currentPollData, {
          isInteractive: true,
          initialAvailability,
          displayTimeZone: participantTzSelect.value
        });

        setBannerText();
      }
    } else if (hash.startsWith('#/results/')) {
      // format: #/results/{pollId}/{resultsCode?}
      const parts = hash.split('/');
      currentPollId = parts[2] || '';
      const providedCode = parts[3] || '';
      showView(resultsView);
      currentResultsUnlocked = false;
      const codes = ensureCodesForPoll(currentPollId);
      const expectedCode = codes.resultsCode;

      // Gate results if code missing or wrong
      if (!providedCode || providedCode !== expectedCode) {
        resultsGate.style.display = 'block';
        const tryUnlock = async () => {
          const entered = resultsCodeInput.value.trim();
          if (entered && entered === expectedCode) {
            currentResultsUnlocked = true;
            resultsGate.style.display = 'none';
            currentPollData = await getPoll(currentPollId);
            if (currentPollData) renderResults(currentPollData);
          } else {
            alert('Invalid code.');
          }
        };
        resultsCodeSubmit.onclick = tryUnlock;
      } else {
        currentResultsUnlocked = true;
        currentPollData = await getPoll(currentPollId);
        if (currentPollData) {
          renderResults(currentPollData);
        }
      }
    } else {
      showView(createPollView);
    }
  };

  window.addEventListener('hashchange', handleRouting);
  handleRouting();
});