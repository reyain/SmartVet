
const petList = document.getElementById('petList');
const listMessage = document.getElementById('listMessage');
const sessionMessage = document.getElementById('sessionMessage');
const welcomeHeading = document.getElementById('welcomeHeading');
const refreshButton = document.getElementById('refreshButton');
const logoutButton = document.getElementById('logoutButton');

const sessionBadge = document.getElementById('sessionBadge');
const pendingCount = document.getElementById('pendingCount');
const approvedCount = document.getElementById('approvedCount');
const sidebarPendingCount = document.getElementById('sidebarPendingCount');

const approvalResultContainer = document.getElementById(
    'approvalResultContainer'
);

const approvedPetSelect = document.getElementById('approvedPetSelect');
const selectedPetInfo = document.getElementById('selectedPetInfo');
const vaccinationForm = document.getElementById('vaccinationForm');
const vaccinationMessage = document.getElementById('vaccinationMessage');
const vaccinationHistory = document.getElementById('vaccinationHistory');

const feedingStatusFilter = document.getElementById('feedingStatusFilter');
const refreshFeedingEventsButton = document.getElementById('refreshFeedingEventsButton');
const feedingEventsHistory = document.getElementById('feedingEventsHistory');

const refreshApprovedPetsButton = document.getElementById(
    'refreshApprovedPetsButton'
);
const refreshHistoryButton = document.getElementById('refreshHistoryButton');
const saveVaccinationButton = document.getElementById(
    'saveVaccinationButton'
);

const administeredDateInput = document.getElementById('administeredDate');
const nextDueDateInput = document.getElementById('nextDueDate');

const navigationButtons = document.querySelectorAll('.nav-item[data-view]');
const quickActionButtons = document.querySelectorAll('[data-view-target]');

const views = {
    overview: document.getElementById('overviewSection'),
    pending: document.getElementById('pendingSection'),
    vaccinations: document.getElementById('vaccinationSection'),
    feedingEvents: document.getElementById('feedingEventsSection'),
    devices: document.getElementById('devicesSection')
};

const tokenKey = 'smartvetAccessToken';
const userKey = 'smartvetUser';

let dashboardReady = false;
let approvedPets = [];

function getToken() {
    return sessionStorage.getItem(tokenKey);
}

function logout() {
    sessionStorage.removeItem(tokenKey);
    sessionStorage.removeItem(userKey);
    window.location.replace('/login.html');
}

function showMessage(element, message, type = '') {
    if (!element) return;

    element.textContent = message;
    element.className = `message ${type}`.trim();
}

async function apiRequest(url, options = {}) {
    const token = getToken();

    if (!token) {
        logout();
        throw new Error('Your session has expired. Please sign in again.');
    }

    const headers = {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers
    };

    const response = await fetch(url, {
        ...options,
        headers
    });

    let data = {};

    try {
        data = await response.json();
    } catch {
        // Report a readable error if the server response is not JSON.
    }

    if (response.status === 401) {
        logout();
        throw new Error('Your session has expired. Please sign in again.');
    }

    if (!response.ok || data.success === false) {
        throw new Error(data.message || `Request failed (${response.status}).`);
    }

    return data;
}

function addText(parent, tag, text, className = '') {
    const element = document.createElement(tag);
    element.textContent = text;

    if (className) {
        element.className = className;
    }

    parent.appendChild(element);
    return element;
}

function createButton(label, className, onClick) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.className = className;
    button.addEventListener('click', onClick);
    return button;
}

function formatDate(value) {
    if (!value) return 'Not provided';

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return 'Not available';
    }

    return date.toLocaleDateString();
    
}

function formatDateTime(value) {
    if (!value) return 'Not recorded';

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return 'Not available';
    }

    return date.toLocaleString('en-PH', {
        timeZone: 'Asia/Manila',
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    });
}

function localDateString(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
}

/* Sidebar navigation */


function switchView(viewName) {
    if (!views[viewName]) return;

    // Show the selected section and hide the others.
    Object.entries(views).forEach(([name, section]) => {
        const isActive = name === viewName;

        section.hidden = !isActive;
        section.classList.toggle('is-active', isActive);
    });

    // Update the sidebar's selected navigation item.
    navigationButtons.forEach((button) => {
        const isActive = button.dataset.view === viewName;

        button.classList.toggle('active', isActive);

        if (isActive) {
            button.setAttribute('aria-current', 'page');
        } else {
            button.removeAttribute('aria-current');
        }
    });

    // Load the appropriate records when opening a section.
    if (!dashboardReady) return;

    if (viewName === 'pending') {
        loadPendingPets();
    }

    if (viewName === 'vaccinations') {
        if (approvedPets.length === 0) {
            loadApprovedPets();
        } else {
            loadVaccinationHistory(approvedPetSelect.value);
        }
    }

    if (viewName === 'feedingEvents') {
    loadFeedingEvents();
}

}


navigationButtons.forEach((button) => {
    button.addEventListener('click', () => {
        switchView(button.dataset.view);
    });
});

quickActionButtons.forEach((button) => {
    button.addEventListener('click', () => {
        switchView(button.dataset.viewTarget);
    });
});

/* Overview statistics */

function updatePendingCount(count) {
    pendingCount.textContent = String(count);
    sidebarPendingCount.textContent = String(count);
}

function updateApprovedCount(count) {
    approvedCount.textContent = String(count);
}

/* Pending registrations */

function createPetCard(pet) {
    const card = document.createElement('article');
    card.className = 'pet-card';

    if (pet.hasPhoto) {
    const photo = document.createElement('img');

    photo.className = 'pending-pet-photo';
    photo.alt = `${pet.name || 'Pet'} photo`;
    photo.loading = 'lazy';

    const token = getToken();

    fetch(`/api/clinic/pets/${encodeURIComponent(pet.id)}/photo`, {
        headers: {
            Accept: 'image/jpeg, image/png, image/webp',
            Authorization: `Bearer ${token}`
        }
    })
        .then(response => {
            if (!response.ok) {
                throw new Error('Unable to load pet photo.');
            }

            return response.blob();
        })
        .then(blob => {
            photo.src = URL.createObjectURL(blob);
        })
        .catch(() => {
            photo.alt = 'Pet photo unavailable';
            photo.classList.add('pet-photo-unavailable');
        });

    card.appendChild(photo);
}

    addText(card, 'h3', pet.name || 'Unnamed pet');
    addText(card, 'p', `Species: ${pet.species || 'Not provided'}`);
    addText(card, 'p', `Breed: ${pet.breed || 'Not provided'}`);
    addText(card, 'p', `Sex: ${pet.sex || 'Not provided'}`);
    addText(card, 'p', `Date of birth: ${formatDate(pet.dateOfBirth)}`);
    addText(card, 'p', `Color: ${pet.color || 'Not provided'}`);

    const owner = pet.owner || pet.ownerUserId;

    if (owner && typeof owner === 'object') {
        addText(card, 'p', `Owner: ${owner.fullName || 'Not available'}`);
        addText(card, 'p', `Owner email: ${owner.email || 'Not available'}`);
    } else {
        addText(card, 'p', 'Owner information is unavailable.');
    }

    const status = addText(
        card,
        'span',
        pet.registrationStatus || 'pending',
        'status'
    );

    status.setAttribute('aria-label', 'Registration status');

    const actions = document.createElement('div');
    actions.className = 'pet-actions';

    actions.appendChild(
        createButton(
            'Approve registration',
            'primary',
            () => approvePet(pet.id, actions)
        )
    );

    actions.appendChild(
        createButton(
            'Needs verification',
            'warning',
            () => requestVerification(pet.id, actions)
        )
    );

    card.appendChild(actions);
    return card;
}

async function loadPendingPets() {
    if (!dashboardReady) return;

    refreshButton.disabled = true;
    petList.replaceChildren();

    showMessage(listMessage, 'Loading pending registrations...');

    try {
        const data = await apiRequest('/api/clinic/pets/pending');
        const pets = Array.isArray(data.pets) ? data.pets : [];

        updatePendingCount(pets.length);

        if (pets.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'empty';
            empty.textContent = 'There are no pending registrations right now.';
            petList.appendChild(empty);

            showMessage(listMessage, 'List updated.', 'success');
            return;
        }

        const fragment = document.createDocumentFragment();

        pets.forEach((pet) => {
            fragment.appendChild(createPetCard(pet));
        });

        petList.appendChild(fragment);

        showMessage(
            listMessage,
            `${pets.length} pending registration(s) found.`,
            'success'
        );
    } catch (error) {
        showMessage(
            listMessage,
            error.message || 'Unable to load registrations.',
            'error'
        );
    } finally {
        refreshButton.disabled = false;
    }
}

async function approvePet(petId, actionsContainer) {
    const confirmed = window.confirm(
        'Approve this pet registration? This will generate an official Pet ID and QR code.'
    );

    if (!confirmed) return;

    const buttons = actionsContainer.querySelectorAll('button');
    buttons.forEach((button) => {
        button.disabled = true;
    });

    try {
        const data = await apiRequest(
            `/api/clinic/pets/${encodeURIComponent(petId)}/approve`,
            {
                method: 'PATCH',
                body: JSON.stringify({ notes: '' })
            }
        );

        showMessage(
            listMessage,
            'Registration approved successfully. The Pet ID and QR code are shown below.',
            'success'
        );

        showApprovalResult(data);

        await loadPendingPets();
        await loadApprovedPets();
    } catch (error) {
        showMessage(
            listMessage,
            error.message || 'Unable to approve this registration.',
            'error'
        );

        buttons.forEach((button) => {
            button.disabled = false;
        });
    }
}

async function requestVerification(petId, actionsContainer) {
    const reason = window.prompt(
        'Explain why this registration needs verification:'
    );

    if (reason === null) return;

    if (!reason.trim()) {
        showMessage(listMessage, 'Please provide a reason.', 'error');
        return;
    }

    const buttons = actionsContainer.querySelectorAll('button');
    buttons.forEach((button) => {
        button.disabled = true;
    });

    try {
        await apiRequest(
            `/api/clinic/pets/${encodeURIComponent(petId)}/needs-verification`,
            {
                method: 'PATCH',
                body: JSON.stringify({ reason: reason.trim() })
            }
        );

        showMessage(
            listMessage,
            'The registration was marked for additional verification.',
            'success'
        );

        await loadPendingPets();
    } catch (error) {
        showMessage(
            listMessage,
            error.message || 'Unable to update this registration.',
            'error'
        );

        buttons.forEach((button) => {
            button.disabled = false;
        });
    }
}

function showApprovalResult(data) {
    const pet = data.pet || data;

    const petCode = pet.petCode || data.petCode || 'Not available';
    const petName = pet.name || data.name || 'Pet';
    const qrImage = pet.qrCodeImage || data.qrCodeImage;

    const panel = document.createElement('section');
    panel.className = 'approval-result workspace-panel';

    addText(panel, 'h2', 'Registration Approved');
    addText(panel, 'p', `Official Pet ID: ${petCode}`);
    addText(panel, 'p', `Pet: ${petName}`);

    if (
        typeof qrImage === 'string' &&
        qrImage.startsWith('data:image/png;base64,')
    ) {
        const qrPanel = document.createElement('div');
        qrPanel.className = 'qr-panel';

        addText(qrPanel, 'h3', 'Pet QR Code');
        addText(
            qrPanel,
            'p',
            'This QR code identifies the approved pet record.'
        );

        const image = document.createElement('img');
        image.src = qrImage;
        image.alt = `QR code for ${petName}`;
        qrPanel.appendChild(image);

        const download = document.createElement('a');
        download.href = qrImage;
        download.download = `${petCode}-QR.png`;
        download.textContent = 'Download QR code';
        qrPanel.appendChild(download);

        panel.appendChild(qrPanel);
    } else {
        addText(
            panel,
            'p',
            'The pet was approved, but the QR image was not found in the response.',
            'muted'
        );
    }

    approvalResultContainer.replaceChildren(panel);
}

/* Approved pets */

function updateSelectedPetInfo() {
    const pet = approvedPets.find(
        (item) => item.id === approvedPetSelect.value
    );

    if (!pet) {
        selectedPetInfo.textContent =
            'Select an approved pet to view its details.';
        return;
    }

    selectedPetInfo.textContent =
        `${pet.petCode || 'No Pet ID'} — ${pet.name} (${pet.species}). ` +
        `Owner: ${pet.owner?.fullName || 'Unavailable'}.`;
}

async function loadApprovedPets() {
    if (!dashboardReady) return;

    const previousPetId = approvedPetSelect.value;

    refreshApprovedPetsButton.disabled = true;
    approvedPetSelect.disabled = true;

    try {
        const data = await apiRequest('/api/clinic/pets/approved');
        approvedPets = Array.isArray(data.pets) ? data.pets : [];

        updateApprovedCount(approvedPets.length);
        approvedPetSelect.replaceChildren();

        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = approvedPets.length
            ? 'Select an approved pet'
            : 'No approved pets available';

        approvedPetSelect.appendChild(placeholder);

        approvedPets.forEach((pet) => {
            const option = document.createElement('option');
            option.value = pet.id;
            option.textContent =
                `${pet.petCode || 'No Pet ID'} — ${pet.name} (${pet.species})`;

            approvedPetSelect.appendChild(option);
        });

        if (approvedPets.some((pet) => pet.id === previousPetId)) {
            approvedPetSelect.value = previousPetId;
        } else if (approvedPets.length > 0) {
            approvedPetSelect.value = approvedPets[0].id;
        }

        approvedPetSelect.disabled = approvedPets.length === 0;
        updateSelectedPetInfo();

        await loadVaccinationHistory(approvedPetSelect.value);

        if (approvedPets.length === 0) {
            showMessage(
                vaccinationMessage,
                'No approved pets are available for vaccination recording.',
                ''
            );
        } else {
            showMessage(
                vaccinationMessage,
                `${approvedPets.length} approved pet(s) loaded.`,
                'success'
            );
        }
    } catch (error) {
        approvedPets = [];
        approvedPetSelect.replaceChildren();

        const option = document.createElement('option');
        option.value = '';
        option.textContent = 'Unable to load approved pets';
        approvedPetSelect.appendChild(option);

        approvedPetSelect.disabled = true;
        updateApprovedCount('—');
        updateSelectedPetInfo();

        vaccinationHistory.replaceChildren();
        addText(
            vaccinationHistory,
            'p',
            error.message || 'Unable to load approved pets.',
            'error'
        );

        showMessage(
            vaccinationMessage,
            error.message || 'Unable to load approved pets.',
            'error'
        );
    } finally {
        refreshApprovedPetsButton.disabled = false;
    }
}

/* Vaccination history */

async function loadVaccinationHistory(petId) {
    vaccinationHistory.replaceChildren();

    if (!petId) {
        addText(
            vaccinationHistory,
            'p',
            'Select an approved pet to view its history.',
            'muted'
        );
        refreshHistoryButton.disabled = false;
        return;
    }

    refreshHistoryButton.disabled = true;

    addText(
        vaccinationHistory,
        'p',
        'Loading vaccination history...',
        'muted'
    );

    try {
        const data = await apiRequest(
            `/api/clinic/pets/${encodeURIComponent(petId)}/vaccinations`
        );

        const records = Array.isArray(data.vaccinations)
            ? data.vaccinations
            : [];

        vaccinationHistory.replaceChildren();

        if (records.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'empty';
            empty.textContent =
                'No vaccination records have been entered for this pet.';
            vaccinationHistory.appendChild(empty);
            return;
        }

        addText(
            vaccinationHistory,
            'p',
            `${records.length} vaccination record(s) found.`,
            'muted'
        );

        records.forEach((record) => {
            const card = document.createElement('article');
            card.className = 'history-card';

            addText(card, 'h4', record.vaccineName || 'Unnamed vaccine');
            addText(
                card,
                'p',
                `Date administered: ${formatDate(record.administeredDate)}`
            );
            addText(
                card,
                'p',
                `Next due date: ${formatDate(record.nextDueDate)}`
            );
            addText(
                card,
                'p',
                `Batch/lot number: ${record.batchNumber || 'Not provided'}`
            );
            addText(
                card,
                'p',
                `Manufacturer: ${record.manufacturer || 'Not provided'}`
            );
            addText(
                card,
                'p',
                `Dosage: ${record.dosage || 'Not provided'}`
            );
            addText(
                card,
                'p',
                `Recorded by: ${record.administeredBy || 'Unknown'}`
            );

            if (record.notes) {
                addText(card, 'p', `Notes: ${record.notes}`);
            }

            vaccinationHistory.appendChild(card);
        });
    } catch (error) {
        vaccinationHistory.replaceChildren();

        addText(
            vaccinationHistory,
            'p',
            error.message || 'Unable to load vaccination history.',
            'error'
        );
    } finally {
        refreshHistoryButton.disabled = false;
    }
}

/* Vaccination form submission */

vaccinationForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const petId = approvedPetSelect.value;

    if (!petId) {
        showMessage(
            vaccinationMessage,
            'Please select an approved pet first.',
            'error'
        );
        return;
    }

    const administeredDate = administeredDateInput.value;
    const nextDueDate = nextDueDateInput.value;

    if (nextDueDate && nextDueDate < administeredDate) {
        showMessage(
            vaccinationMessage,
            'The next due date cannot be earlier than the administration date.',
            'error'
        );
        nextDueDateInput.focus();
        return;
    }

    const payload = {
        vaccineName: document.getElementById('vaccineName').value.trim(),
        administeredDate,
        batchNumber: document.getElementById('batchNumber').value.trim(),
        manufacturer: document.getElementById('manufacturer').value.trim(),
        dosage: document.getElementById('dosage').value.trim(),
        notes: document.getElementById('vaccinationNotes').value.trim()
    };

    if (nextDueDate) {
        payload.nextDueDate = nextDueDate;
    }

    saveVaccinationButton.disabled = true;
    saveVaccinationButton.textContent = 'Saving...';

    try {
        const data = await apiRequest(
            `/api/clinic/pets/${encodeURIComponent(petId)}/vaccinations`,
            {
                method: 'POST',
                body: JSON.stringify(payload)
            }
        );

        showMessage(
            vaccinationMessage,
            data.message || 'Vaccination record saved successfully.',
            'success'
        );

        vaccinationForm.reset();

        administeredDateInput.max = localDateString();
        nextDueDateInput.min = '';

        await loadVaccinationHistory(petId);
    } catch (error) {
        showMessage(
            vaccinationMessage,
            error.message || 'Unable to save the vaccination record.',
            'error'
        );
    } finally {
        saveVaccinationButton.disabled = false;
        saveVaccinationButton.textContent = 'Save Vaccination';
    }
});

approvedPetSelect.addEventListener('change', async () => {
    updateSelectedPetInfo();
    await loadVaccinationHistory(approvedPetSelect.value);
});

refreshApprovedPetsButton.addEventListener('click', loadApprovedPets);

refreshHistoryButton.addEventListener('click', () => {
    loadVaccinationHistory(approvedPetSelect.value);
});

administeredDateInput.max = localDateString();

administeredDateInput.addEventListener('change', () => {
    nextDueDateInput.min = administeredDateInput.value || '';
});

/* Session verification */


/* Feeding event history */

async function loadFeedingEvents() {
    if (!dashboardReady || !feedingEventsHistory) return;

    const status = feedingStatusFilter
        ? feedingStatusFilter.value
        : '';

    const query = status
        ? `?status=${encodeURIComponent(status)}`
        : '';

    feedingEventsHistory.replaceChildren();
    feedingEventsHistory.setAttribute('aria-busy', 'true');

    addText(
        feedingEventsHistory,
        'p',
        'Loading feeding history...',
        'muted'
    );

    if (refreshFeedingEventsButton) {
        refreshFeedingEventsButton.disabled = true;
    }

    try {
        const data = await apiRequest(
            `/api/clinic/feeding-events${query}`
        );

        const events = Array.isArray(data.events)
            ? data.events
            : [];

        feedingEventsHistory.replaceChildren();

        if (events.length === 0) {
            const message = status
                ? 'No feeding events match this status filter.'
                : 'No feeding events have been recorded yet.';

            addText(feedingEventsHistory, 'p', message, 'muted');
            return;
        }

        addText(
            feedingEventsHistory,
            'p',
            `${events.length} feeding event(s) found.`,
            'muted'
        );

        const eventList = document.createElement('div');
        eventList.className = 'feeding-events-list';

        const dayNames = [
            'Sunday',
            'Monday',
            'Tuesday',
            'Wednesday',
            'Thursday',
            'Friday',
            'Saturday'
        ];

        events.forEach((event) => {
            const card = document.createElement('article');
            card.className = 'feeding-card';

            const petName = event.pet?.name || 'Unknown pet';
            const petCode = event.pet?.petCode || 'No pet code';
            const deviceCode = event.feeder?.deviceCode || 'Unknown feeder';
            const eventStatus = event.status || 'Unknown';

            addText(
                card,
                'h3',
                `${petName} (${petCode})`
            );

            addText(
                card,
                'p',
                `Feeder: ${deviceCode}`,
                'muted'
            );

            addText(
                card,
                'p',
                `Status: ${eventStatus}`,
                `feeding-status ${eventStatus.toLowerCase()}`
            );

            const details = document.createElement('dl');
            details.className = 'feeding-event-details';

            function addDetail(label, value) {
                const item = document.createElement('div');
                item.className = 'feeding-event-detail';

                addText(item, 'dt', label);
                addText(item, 'dd', String(value));

                details.appendChild(item);
            }

            const schedule = event.schedule;
            const scheduleTime = schedule?.timeOfDay
                ? `${schedule.timeOfDay} (${schedule.timezone || 'timezone not specified'})`
                : 'No linked schedule';

            const scheduleDays = Array.isArray(schedule?.daysOfWeek)
                ? schedule.daysOfWeek
                    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
                    .map((day) => dayNames[day])
                    .join(', ')
                : '';

            addDetail('Event ID', event.eventId || 'Not provided');
            addDetail('Feeding source', event.source || 'Not provided');
            addDetail('Scheduled time', scheduleTime);

            if (scheduleDays) {
                addDetail('Scheduled days', scheduleDays);
            }

            addDetail(
                'Requested food',
                Number.isFinite(event.requestedGrams)
                    ? `${event.requestedGrams} g`
                    : 'Not provided'
            );

            addDetail(
                'Reported dispensed food',
                Number.isFinite(event.dispensedGrams)
                    ? `${event.dispensedGrams} g`
                    : 'Not reported'
            );

            addDetail('Started', formatDateTime(event.startedAt));
            addDetail('Completed', formatDateTime(event.completedAt));

            if (event.failureReason) {
                addDetail('Failure reason', event.failureReason);
            }

            details.setAttribute('aria-label', 'Feeding event details');
            card.appendChild(details);
            eventList.appendChild(card);
        });

        feedingEventsHistory.appendChild(eventList);
    } catch (error) {
        feedingEventsHistory.replaceChildren();

        addText(
            feedingEventsHistory,
            'p',
            error.message || 'Unable to load feeding history.',
            'error'
        );
    } finally {
        feedingEventsHistory.setAttribute('aria-busy', 'false');

        if (refreshFeedingEventsButton) {
            refreshFeedingEventsButton.disabled = false;
        }
    }
}



async function verifyVeterinarySession() {
    if (!getToken()) {
        logout();
        return;
    }

    try {
        const data = await apiRequest('/api/auth/me');
        const user = data.user || data;

        if (user.role !== 'veterinary') {
            logout();
            return;
        }

        welcomeHeading.textContent =
            `Welcome, ${user.fullName || 'Veterinary Staff'}`;

        showMessage(
            sessionMessage,
            'Signed in as veterinary staff.',
            'success'
        );

        sessionBadge.textContent = 'Session verified';
        sessionBadge.classList.add('is-verified');

        dashboardReady = true;

        await Promise.all([
            loadPendingPets(),
            loadApprovedPets()
        ]);
    } catch (error) {
        showMessage(
            sessionMessage,
            error.message || 'Unable to verify your session.',
            'error'
        );

        sessionBadge.textContent = 'Session unavailable';
    }
}

refreshButton.addEventListener('click', loadPendingPets);
logoutButton.addEventListener('click', logout);


if (feedingStatusFilter) {
    feedingStatusFilter.addEventListener('change', loadFeedingEvents);
}

if (refreshFeedingEventsButton) {
    refreshFeedingEventsButton.addEventListener('click', loadFeedingEvents);
}

switchView('overview');
verifyVeterinarySession();
