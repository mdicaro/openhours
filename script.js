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
    const clearSelectionsBtn = document.getElementById('clear-selections-btn');

    const HALF_HOUR_MS = 30 * 60 * 1000;

    let currentPollId = null;
    let currentPollData = null;

    // --- Helper Functions ---
    const getViewerTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

    const parseLocalDate = (yyyyMmDd) => {
        const [y, m, d] = yyyyMmDd.split('-').map(Number);
        // Local midnight avoids UTC shifts
        return new Date(y, m - 1, d);
    };

    const formatLocalDate = (date) => {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    };

    const getDatesInRange = (startDate, endDate) => {
        const dates = [];
        const start = parseLocalDate(startDate);
        const end = parseLocalDate(endDate);
        let currentDate = new Date(start);
        while (currentDate <= end) {
            dates.push(new Date(currentDate));
            currentDate.setDate(currentDate.getDate() + 1);
        }
        return dates;
    };

    const localCellToEpochIndex = (dayLocalDate, timeIndex) => {
        const hour = Math.floor(timeIndex / 2);
        const minute = (timeIndex % 2) * 30;
        const ms = new Date(
            dayLocalDate.getFullYear(),
            dayLocalDate.getMonth(),
            dayLocalDate.getDate(),
            hour, minute, 0, 0
        ).getTime(); // Date() uses viewer's local zone
        return Math.floor(ms / HALF_HOUR_MS);
    };

    const showView = (viewElement) => {
        document.querySelectorAll('.view').forEach(view => {
            view.style.display = 'none';
        });
        viewElement.style.display = 'block';
    };

    const formatTime = (timeIndex) => {
        const hour = Math.floor(timeIndex / 2);
        const minutes = (timeIndex % 2) * 30;
        return `${String(hour).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    };

    const copyToClipboard = (text, btn) => {
        navigator.clipboard.writeText(text).then(() => {
            const originalText = btn.textContent;
            btn.textContent = 'Copied!';
            setTimeout(() => {
                btn.textContent = originalText;
            }, 2000);
        }).catch(err => {
            console.error('Failed to copy text:', err);
        });
    };

    // --- Calendar UI Logic ---
    const createCalendar = (containerId, startDate, endDate, startTime, endTime, isInteractive = false, initialAvailability = []) => {
        const container = document.getElementById(containerId);
        container.innerHTML = '';
        container.className = 'calendar-container';
        const initialEpochSet = new Set(initialAvailability.map(v => Number(v)));

        const timeColumn = document.createElement('div');
        timeColumn.className = 'time-column';

        const scrollWrapper = document.createElement('div');
        scrollWrapper.className = 'calendar-scroll-wrapper';

        const calendar = document.createElement('div');
        calendar.className = 'calendar';
        if (containerId.includes('results')) {
            calendar.classList.add('results-calendar');
        }

        const dates = getDatesInRange(startDate, endDate);
        const startMinute = parseInt(startTime.split(':')[0]) * 60 + parseInt(startTime.split(':')[1]);
        const endMinute = parseInt(endTime.split(':')[0]) * 60 + parseInt(endTime.split(':')[1]);
        const startIndex = startMinute / 30;
        const endIndex = endMinute / 30;
        const totalTimeSlots = endIndex - startIndex;

        for (let i = 0; i <= totalTimeSlots; i++) {
            const timeLabel = document.createElement('div');
            timeLabel.className = 'time-label';
            timeLabel.textContent = formatTime(startIndex + i);
            timeColumn.appendChild(timeLabel);
        }

        dates.forEach(day => {
            const dayColumn = document.createElement('div');
            dayColumn.className = 'day-column';

            const dayHeader = document.createElement('div');
            dayHeader.className = 'day-header';
            dayHeader.textContent = `${day.toLocaleDateString('en-US', { weekday: 'short' })} ${day.getDate()}`;
            dayColumn.appendChild(dayHeader);

            for (let i = 0; i < totalTimeSlots; i++) {
                const timeSlot = document.createElement('div');
                timeSlot.className = 'time-slot';
                const timeIndex = startIndex + i;
                const epochIndex = localCellToEpochIndex(day, timeIndex);      // canonical absolute key
                timeSlot.dataset.slotKey = String(epochIndex);                 // new storage: numbers as strings for dataset
                
                if (isInteractive) {
                    if (initialEpochSet.has(epochIndex)) {
                        timeSlot.classList.add('selected');
                    }
                    timeSlot.addEventListener('mousedown', (e) => {
                        e.preventDefault();
                        const startState = e.target.classList.toggle('selected');
                        let isDragging = true;

                        const handleMouseMove = (moveEvent) => {
                            if (!isDragging) return;
                            const target = moveEvent.target.closest('.time-slot');
                            if (target) {
                                if (startState) {
                                    target.classList.add('selected');
                                } else {
                                    target.classList.remove('selected');
                                }
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
        // --- THIS IS THE FIX ---
        container.appendChild(scrollWrapper); // Was: container.appendChild(calendar)
    };

    // --- Backend API Calls ---
    // ... (rest of the file is identical to what you have)
    // --- Event Handlers ---
    // ...
    // --- View Rendering & Routing ---
    // ...
    const API_URL = '/api/poll';

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
            body: JSON.stringify({ pollId, email, availability, timezone }) // CHANGED
        });
        return response.json();
    };

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
            baseTimeZone: getViewerTimeZone(),
            createdAt: new Date().toISOString(),
            availabilities: {}
        };

        const response = await createPoll(pollData);
        if (response.pollId) {
            currentPollId = response.pollId;
            showPollLink(response.pollId);
        }
    });

    participantForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('participant-email').value;
        const timezone = getViewerTimeZone();
        const selectedEpochs = [];
        document.querySelectorAll('#calendar-container .time-slot.selected').forEach(slot => {
            selectedEpochs.push(Number(slot.dataset.slotKey));
        });

        await saveAvailability(currentPollId, email, selectedEpochs, timezone);
        localStorage.setItem(`poll-${currentPollId}-email`, email);

        alert('Your availability has been saved!');
        handleRouting();
    });

    copyLinkBtn.addEventListener('click', () => {
        copyToClipboard(pollLink.href, copyLinkBtn);
    });

    copyResultsBtn.addEventListener('click', () => {
        copyToClipboard(resultsLink.href, copyResultsBtn);
    });

    clearSelectionsBtn.addEventListener('click', async () => {
        const email = participantEmailInput.value.trim();
        if (!email) {
            alert('Please enter your email before clearing.');
            return;
        }

        // Clear current selection in UI
        document.querySelectorAll('#calendar-container .time-slot.selected').forEach(slot => {
            slot.classList.remove('selected');
        });

        // Persist "empty" selection for this user
        await saveAvailability(currentPollId, email, []);
        localStorage.setItem(`poll-${currentPollId}-email`, email);

        alert('Selections cleared and saved.');
        handleRouting();
    });

    const showPollLink = (pollId) => {
        const pollUrl = `${window.location.origin}/#/poll/${pollId}`;
        const resultsUrl = `${window.location.origin}/#/results/${pollId}`;
        pollLink.href = pollUrl;
        pollLink.textContent = pollUrl;
        resultsLink.href = resultsUrl;
        resultsLink.textContent = resultsUrl;
        showView(pollLinkView);
    };

    const renderResults = (pollData) => {
        const resultsSummary = document.getElementById('results-summary');
        const resultsCalendarContainer = document.getElementById('results-calendar-container');

        const allAvailabilities = Object.values(pollData.availabilities).flat();
        const availabilityCounts = allAvailabilities.reduce((acc, slotKey) => {
            acc[slotKey] = (acc[slotKey] || 0) + 1;
            return acc;
        }, {});
        const slotToEmailsMap = {};
        for (const email in pollData.availabilities) {
            const selectedSlots = pollData.availabilities[email];
            selectedSlots.forEach(slotKey => {
                if (!slotToEmailsMap[slotKey]) {
                    slotToEmailsMap[slotKey] = [];
                }
                slotToEmailsMap[slotKey].push(email);
            });
        }
        const totalParticipants = Object.keys(pollData.availabilities).length;

        resultsSummary.innerHTML = `<h3>Responses:</h3><p>${totalParticipants} people have responded.</p>`;

        createCalendar(
            'results-calendar-container',
            pollData.startDate,
            pollData.endDate,
            pollData.startTime,
            pollData.endTime,
            false
        );

        const allSlots = resultsCalendarContainer.querySelectorAll('.time-slot');
        allSlots.forEach(slot => {
            const slotKey = slot.dataset.slotKey;
            const count = availabilityCounts[slot.dataset.slotKey] || 0;
            const availableEmails = slotToEmailsMap[slotKey] || [];
            const emailList = availableEmails.join('\n');
            const percentage = totalParticipants > 0 ? (count / totalParticipants) * 100 : 0;

            slot.title = `${count} Available\n\n${emailList}`;

            if (count > 0) {
                slot.textContent = count;
            }

            if (percentage === 100) {
                slot.classList.add('level-5');
            } else if (percentage >= 75) {
                slot.classList.add('level-4');
            } else if (percentage >= 50) {
                slot.classList.add('level-3');
            } else if (percentage >= 25) {
                slot.classList.add('level-2');
            } else if (percentage > 0) {
                slot.classList.add('level-1');
            } else {
                slot.classList.add('level-0');
            }
        });

        const resultsTzBanner = document.getElementById('results-tz-banner');
        if (resultsTzBanner) {
            const viewerTz = getViewerTimeZone();
            const baseTz = currentPollData.baseTimeZone || viewerTz;
            resultsTzBanner.textContent = `Times shown in: ${baseTz}`;
        }

        // script.js — in handleRouting when showing participant view
        const tzBanner = document.getElementById('tz-banner');
        if (tzBanner) {
            tzBanner.textContent = `Times shown in your local time zone: ${getViewerTimeZone()}`;
        }

    };

    const handleRouting = async () => {
        const hash = window.location.hash;
        if (hash.startsWith('#/poll/')) {
            currentPollId = hash.substring(7);
            showView(participantView);
            currentPollData = await getPoll(currentPollId);
            if (currentPollData) {
                const participantEmail = localStorage.getItem(`poll-${currentPollId}-email`);
                let initialAvailability = [];
                if (participantEmail && currentPollData.availabilities[participantEmail]) {
                    document.getElementById('participant-email').value = participantEmail;
                    initialAvailability = currentPollData.availabilities[participantEmail];
                }
                createCalendar(
                    'calendar-container',
                    currentPollData.startDate,
                    currentPollData.endDate,
                    currentPollData.startTime,
                    currentPollData.endTime,
                    true,
                    initialAvailability
                );
            }
        } else if (hash.startsWith('#/results/')) {
            currentPollId = hash.substring(10);
            showView(resultsView);
            currentPollData = await getPoll(currentPollId);
            if (currentPollData) {
                renderResults(currentPollData);
            }
        } else {
            showView(createPollView);
        }
    };

    window.addEventListener('hashchange', handleRouting);
    handleRouting();
});