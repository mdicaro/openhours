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

    let currentPollId = null;
    let currentPollData = null;

    // --- Helper Functions ---
    const showView = (viewElement) => {
        document.querySelectorAll('.view').forEach(view => {
            view.style.display = 'none';
        });
        viewElement.style.display = 'block';
    };

    const getDatesInRange = (startDate, endDate) => {
        const dates = [];
        let currentDate = new Date(startDate);
        while (currentDate <= new Date(endDate)) {
            dates.push(new Date(currentDate));
            currentDate.setDate(currentDate.getDate() + 1);
        }
        return dates;
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

        // Create Time Column
        const timeColumn = document.createElement('div');
        timeColumn.className = 'time-column';
        const timeHeader = document.createElement('div');
        timeHeader.className = 'time-header';
        timeColumn.appendChild(timeHeader);

        for (let i = 0; i < totalTimeSlots; i++) {
            const timeLabel = document.createElement('div');
            timeLabel.className = 'time-label';
            timeLabel.textContent = formatTime(startIndex + i);
            timeColumn.appendChild(timeLabel);
        }
        calendar.appendChild(timeColumn);

        // Create Day Columns
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
                const slotKey = `${day.toISOString().slice(0, 10)}-${timeIndex}`;
                timeSlot.dataset.slotKey = slotKey;

                if (isInteractive) {
                    if (initialAvailability.includes(slotKey)) {
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

        container.appendChild(calendar);
    };

    // --- Backend API Calls ---
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

    const saveAvailability = async (pollId, email, availability) => {
        const response = await fetch(API_URL, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            // CHANGE: The key should be 'email' to match the backend
            body: JSON.stringify({ pollId, email, availability })
        });
        return response.json();
    };
    // --- Event Handlers ---
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
        // CHANGE: This field should represent the user's email
        const email = document.getElementById('participant-email').value;
        const selectedTimeSlots = [];
        document.querySelectorAll('#calendar-container .time-slot.selected').forEach(slot => {
            selectedTimeSlots.push(slot.dataset.slotKey);
        });

        // CHANGE: Pass 'email' instead of 'name'
        await saveAvailability(currentPollId, email, selectedTimeSlots);
        // CHANGE: Save the email in localStorage to remember the user
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

    // --- View Rendering & Routing ---
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
            const count = availabilityCounts[slot.dataset.slotKey] || 0;
            const percentage = totalParticipants > 0 ? (count / totalParticipants) * 100 : 0;

            slot.title = `${count} of ${totalParticipants} available`;

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
    };

    const handleRouting = async () => {
        const hash = window.location.hash;
        if (hash.startsWith('#/poll/')) {
            currentPollId = hash.substring(7);
            showView(participantView);
            currentPollData = await getPoll(currentPollId);
            if (currentPollData) {
                // CHANGE: Look for email in localStorage
                const participantEmail = localStorage.getItem(`poll-${currentPollId}-email`);
                let initialAvailability = [];
                if (participantEmail && currentPollData.availabilities[participantEmail]) {
                    // CHANGE: Set the value of the email input
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