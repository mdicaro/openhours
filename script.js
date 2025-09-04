document.addEventListener('DOMContentLoaded', () => {
    const appContainer = document.getElementById('app-container');
    const createPollView = document.getElementById('create-poll-view');
    const participantView = document.getElementById('participant-view');
    const resultsView = document.getElementById('results-view');
    const createPollForm = document.getElementById('create-poll-form');
    const participantForm = document.getElementById('participant-form');

    console.log('Form element found:', createPollForm);

    const CALENDAR_CELLS_PER_DAY = 48; // 24 hours * 2 (30-min increments)
    const TODAY = new Date();
    const END_DATE = new Date();
    END_DATE.setMonth(TODAY.getMonth() + 2); // Show upcoming days for two months

    let currentPollId = null;

    // --- Helper Functions ---
    const showView = (viewElement) => {
        document.querySelectorAll('.view').forEach(view => {
            view.style.display = 'none';
        });
        viewElement.style.display = 'block';
    };

    const formatDate = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const getDayName = (date) => {
        return date.toLocaleDateString('en-US', { weekday: 'short' });
    };

    // --- Calendar UI Logic ---
    const createCalendar = (containerId, isInteractive = false, initialAvailability = []) => {
        const container = document.getElementById(containerId);
        container.innerHTML = ''; // Clear previous calendar

        const headerRow = document.createElement('div');
        headerRow.style.display = 'contents';

        const timeColumn = document.createElement('div');
        timeColumn.className = 'day-header';
        timeColumn.textContent = 'Time';
        headerRow.appendChild(timeColumn);
        container.appendChild(headerRow);

        let currentDate = new Date(TODAY);
        const dates = [];

        while (currentDate <= END_DATE) {
            dates.push(new Date(currentDate));
            const dayHeader = document.createElement('div');
            dayHeader.className = 'day-header';
            dayHeader.textContent = `${getDayName(currentDate)} ${currentDate.getDate()}`;
            headerRow.appendChild(dayHeader);
            currentDate.setDate(currentDate.getDate() + 1);
        }

        for (let i = 0; i < CALENDAR_CELLS_PER_DAY; i++) {
            const timeCell = document.createElement('div');
            timeCell.className = 'time-slot';
            const hour = Math.floor(i / 2);
            const minutes = (i % 2) * 30;
            timeCell.textContent = `${String(hour).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
            timeCell.style.fontWeight = 'bold';
            timeCell.style.border = 'none';
            container.appendChild(timeCell);

            dates.forEach((day, dayIndex) => {
                const daySlot = document.createElement('div');
                daySlot.className = 'time-slot';
                daySlot.dataset.date = formatDate(day);
                daySlot.dataset.time = i;

                if (initialAvailability.includes(`${formatDate(day)}-${i}`)) {
                    daySlot.classList.add('available');
                }
                
                if (isInteractive) {
                    daySlot.addEventListener('mousedown', (e) => {
                        e.preventDefault();
                        const isSelected = e.target.classList.contains('selected');
                        let isDragging = true;
                        e.target.classList.toggle('selected');
                        const startState = e.target.classList.contains('selected');

                        const handleMouseMove = (moveEvent) => {
                            if (!isDragging) return;
                            if (moveEvent.target.classList.contains('time-slot')) {
                                if (startState) {
                                    moveEvent.target.classList.add('selected');
                                } else {
                                    moveEvent.target.classList.remove('selected');
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
                container.appendChild(daySlot);
            });
        }
    };

    // --- Backend API Calls ---
    const API_URL = '/api/poll'; // This is a convention for Vercel Serverless Functions

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

    console.log("getPoll complete", getPoll);
    
    const saveAvailability = async (pollId, email, availability) => {
        const response = await fetch(API_URL, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pollId, email, availability })
        });
        return response.json();
    };

    // --- Event Handlers ---
    createPollForm.addEventListener('submit', async (e) => {
        console.log('Form submission event triggered!');
        e.preventDefault();
        const emails = document.getElementById('emails').value.split(',').map(email => email.trim()).filter(email => email);
        const pollData = {
            emails,
            createdAt: new Date().toISOString(),
            availabilities: {}
        };
        console.log('Emails to send:', emails);

        const response = await createPoll(pollData);
        if (response.pollId) {
            window.location.hash = `#/poll/${response.pollId}`;
        }
    });

    participantForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('participant-email').value;
        const selectedTimeSlots = [];
        document.querySelectorAll('#calendar-container .time-slot.selected').forEach(slot => {
            selectedTimeSlots.push(`${slot.dataset.date}-${slot.dataset.time}`);
        });

        await saveAvailability(currentPollId, email, selectedTimeSlots);

        alert('Your availability has been saved!');
        // Reload participant view to show updated selections
        window.location.reload(); 
    });

    // --- Routing and View Management ---
    const handleRouting = async () => {
        const hash = window.location.hash;
        if (hash.startsWith('#/poll/')) {
            const pollId = hash.substring(7);
            currentPollId = pollId;
            showView(participantView);
            const pollData = await getPoll(pollId);
            if (pollData) {
                const participantEmail = localStorage.getItem(`poll-${pollId}-email`);
                let initialAvailability = [];
                if (participantEmail && pollData.availabilities[participantEmail]) {
                    document.getElementById('participant-email').value = participantEmail;
                    initialAvailability = pollData.availabilities[participantEmail];
                }
                createCalendar('calendar-container', true, initialAvailability);
            }
        } else if (hash.startsWith('#/results/')) {
            const pollId = hash.substring(10);
            showView(resultsView);
            const pollData = await getPoll(pollId);
            if (pollData) {
                renderResults(pollData);
            }
        } else {
            showView(createPollView);
            createCalendar('calendar-container', true);
        }
    };
    
    // --- Results View Rendering ---
    const renderResults = (pollData) => {
        const resultsSummary = document.getElementById('results-summary');
        const resultsCalendar = document.getElementById('results-calendar-container');

        const allAvailabilities = Object.values(pollData.availabilities).flat();
        const availabilityCounts = allAvailabilities.reduce((acc, slot) => {
            acc[slot] = (acc[slot] || 0) + 1;
            return acc;
        }, {});
        
        const totalParticipants = pollData.emails.length;

        // Display summary of who has responded
        resultsSummary.innerHTML = `<h3>Responses:</h3><p>${Object.keys(pollData.availabilities).length} of ${totalParticipants} people have responded.</p>
        <p>A link to this results page can be shared with the group leader only.</p>`;

        // Create the results calendar
        resultsCalendar.innerHTML = '';
        const headerRow = document.createElement('div');
        headerRow.style.display = 'contents';

        const timeColumn = document.createElement('div');
        timeColumn.className = 'day-header';
        timeColumn.textContent = 'Time';
        headerRow.appendChild(timeColumn);
        resultsCalendar.appendChild(headerRow);

        let currentDate = new Date(TODAY);
        const dates = [];
        while (currentDate <= END_DATE) {
            dates.push(new Date(currentDate));
            const dayHeader = document.createElement('div');
            dayHeader.className = 'day-header';
            dayHeader.textContent = `${getDayName(currentDate)} ${currentDate.getDate()}`;
            headerRow.appendChild(dayHeader);
            currentDate.setDate(currentDate.getDate() + 1);
        }

        for (let i = 0; i < CALENDAR_CELLS_PER_DAY; i++) {
            const timeCell = document.createElement('div');
            timeCell.className = 'time-slot';
            const hour = Math.floor(i / 2);
            const minutes = (i % 2) * 30;
            timeCell.textContent = `${String(hour).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
            timeCell.style.fontWeight = 'bold';
            timeCell.style.border = 'none';
            resultsCalendar.appendChild(timeCell);

            dates.forEach((day, dayIndex) => {
                const daySlot = document.createElement('div');
                daySlot.className = 'time-slot';
                const slotKey = `${formatDate(day)}-${i}`;
                const count = availabilityCounts[slotKey] || 0;
                
                const percentage = totalParticipants > 0 ? (count / totalParticipants) * 100 : 0;
                let color;
                if (percentage === 100) {
                    color = '#28a745'; // All available
                } else if (percentage >= 75) {
                    color = '#ffc107'; // Most available
                } else if (percentage > 0) {
                    color = '#fd7e14'; // Some available
                } else {
                    color = '#f9f9f9'; // No one available
                }
                
                daySlot.style.backgroundColor = color;
                daySlot.dataset.count = count;
                daySlot.title = `${count} of ${totalParticipants} available`;
                
                if (count > 0) {
                    daySlot.textContent = count;
                }
                
                resultsCalendar.appendChild(daySlot);
            });
        }
    };

    // Initial load
    handleRouting();
});