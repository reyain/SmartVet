const token = sessionStorage.getItem('smartvetAccessToken');

const welcomeHeading = document.getElementById('welcomeHeading');
const dashboardMessage = document.getElementById('dashboardMessage');
const registrationForm = document.getElementById('petRegistrationForm');
const registrationMessage = document.getElementById('registrationMessage');
const registerPetButton = document.getElementById('registerPetButton');
const resetFormButton = document.getElementById('resetFormButton');
const refreshPetsButton = document.getElementById('refreshPetsButton');
const petsMessage = document.getElementById('petsMessage');
const petList = document.getElementById('petList');

// Notifications
const refreshNotificationsButton = document.getElementById('refreshNotificationsButton');
const notificationsSummary = document.getElementById('notificationsSummary');
const ownerNotificationList = document.getElementById('ownerNotificationList');

// Owner Feeding History
const refreshOwnerFeedingEventsButton = document.getElementById('refreshOwnerFeedingEventsButton');
const ownerFeedingEventsSummary = document.getElementById('ownerFeedingEventsSummary');
const ownerFeedingEventList = document.getElementById('ownerFeedingEventList');

const ownerFeedingPetFilter = document.getElementById('ownerFeedingPetFilter');
const ownerFeedingStatusFilter = document.getElementById('ownerFeedingStatusFilter');
const applyOwnerFeedingFiltersButton = document.getElementById('applyOwnerFeedingFiltersButton');

// Sidebar counts & Overview stats
const sidebarPetsCount = document.getElementById('sidebarPetsCount');
const sidebarUnreadCount = document.getElementById('sidebarUnreadCount');
const overviewPetsCount = document.getElementById('overviewPetsCount');
const overviewUnreadCount = document.getElementById('overviewUnreadCount');

let ownerVerified = false;
// Pet photo selection and local preview.
const petPhotoInput = document.getElementById('petPhoto');
const petPhotoPreviewContainer = document.getElementById('petPhotoPreviewContainer');
const petPhotoPreview = document.getElementById('petPhotoPreview');
const petPhotoFileName = document.getElementById('petPhotoFileName');
const removePetPhotoButton = document.getElementById('removePetPhotoButton');
let petPhotoPreviewUrl = null;

function clearPetPhotoPreview() {
    if (petPhotoPreviewUrl) {
        URL.revokeObjectURL(petPhotoPreviewUrl);
        petPhotoPreviewUrl = null;
    }
    if (petPhotoInput) petPhotoInput.value = '';
    if (petPhotoPreview) petPhotoPreview.removeAttribute('src');
    if (petPhotoFileName) petPhotoFileName.textContent = '';
    if (petPhotoPreviewContainer) petPhotoPreviewContainer.hidden = true;
}

if (petPhotoInput && petPhotoPreviewContainer && petPhotoPreview && petPhotoFileName) {
    petPhotoInput.addEventListener('change', () => {
        const file = petPhotoInput.files && petPhotoInput.files[0];
        if (petPhotoPreviewUrl) {
            URL.revokeObjectURL(petPhotoPreviewUrl);
            petPhotoPreviewUrl = null;
        }
        petPhotoPreview.removeAttribute('src');
        petPhotoFileName.textContent = '';
        petPhotoPreviewContainer.hidden = true;
        if (!file) return;

        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
        if (!allowedTypes.includes(file.type)) {
            petPhotoInput.value = '';
            showMessage(registrationMessage, 'Choose a JPG, PNG, or WebP image.', 'error');
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            petPhotoInput.value = '';
            showMessage(registrationMessage, 'The pet photo must be 5 MB or smaller.', 'error');
            return;
        }

        petPhotoPreviewUrl = URL.createObjectURL(file);
        petPhotoPreview.src = petPhotoPreviewUrl;
        petPhotoFileName.textContent = `${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`;
        petPhotoPreviewContainer.hidden = false;
        showMessage(registrationMessage, '');
    });

    if (removePetPhotoButton) {
        removePetPhotoButton.addEventListener('click', () => {
            clearPetPhotoPreview();
            showMessage(registrationMessage, 'Pet photo removed.');
        });
    }

    if (registrationForm) {
        registrationForm.addEventListener('reset', () => {
            if (petPhotoPreviewUrl) {
                URL.revokeObjectURL(petPhotoPreviewUrl);
                petPhotoPreviewUrl = null;
            }
            if (petPhotoPreview) petPhotoPreview.removeAttribute('src');
            if (petPhotoFileName) petPhotoFileName.textContent = '';
            if (petPhotoPreviewContainer) petPhotoPreviewContainer.hidden = true;
        });
    }
}


// Sidebar & View Navigation Logic
function switchView(targetView) {
    const navItems = document.querySelectorAll('.nav-item');
    const views = document.querySelectorAll('.owner-view');

    navItems.forEach((item) => {
        if (item.dataset.view === targetView) {
            item.classList.add('active');
            item.setAttribute('aria-current', 'page');
        } else {
            item.classList.remove('active');
            item.removeAttribute('aria-current');
        }
    });

    views.forEach((view) => {
        if (view.dataset.page === targetView) {
            view.classList.add('is-active');
            view.hidden = false;
        } else {
            view.classList.remove('is-active');
            view.hidden = true;
        }
    });
}

document.querySelectorAll('.nav-item').forEach((button) => {
    button.addEventListener('click', () => {
        switchView(button.dataset.view);
    });
});

document.querySelectorAll('.quick-action').forEach((button) => {
    button.addEventListener('click', () => {
        switchView(button.dataset.viewTarget);
    });
});

function showMessage(element, message, type = '') {
    if (!element) return;
    element.textContent = message;
    element.classList.remove('error', 'success');
    if (type) element.classList.add(type);
}

function logout() {
    sessionStorage.removeItem('smartvetAccessToken');
    sessionStorage.removeItem('smartvetUser');
    window.location.assign('/login.html');
}

document.getElementById('logoutButton').addEventListener('click', logout);

async function apiRequest(url, options = {}) {
    if (!token) {
        logout();
        throw new Error('Please sign in again.');
    }

    const response = await fetch(url, {
        ...options,
        headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${token}`,
            ...(options.body && !(options.body instanceof FormData)
                ? { 'Content-Type': 'application/json' }
                : {}),
            ...options.headers
        }
    });

    const data = await response.json().catch(() => ({}));

    if (response.status === 401) {
        logout();
        throw new Error('Your session has expired. Please sign in again.');
    }

    if (!response.ok || data.success === false) {
        throw new Error(data.message || `Request failed (${response.status}).`);
    }

    return data;
}

function readableStatus(status) {
    const labels = {
        pending: 'Pending veterinary review',
        approved: 'Approved',
        needs_verification: 'Needs additional verification'
    };
    return labels[status] || 'Unknown status';
}

function createPetCard(pet) {
    function formatVaccinationDate(value) {
        if (!value) return 'Not recorded';
        const date = new Date(value);
        return Number.isNaN(date.getTime())
            ? 'Not available'
            : date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    }

    function addVaccinationDetail(parent, label, value) {
        const paragraph = document.createElement('p');
        paragraph.textContent = `${label}: ${value || 'Not provided'}`;
        parent.appendChild(paragraph);
    }

    async function loadOwnerVaccinationCard(petId, container) {
        container.replaceChildren();
        const loading = document.createElement('p');
        loading.className = 'muted';
        loading.textContent = 'Loading digital vaccination card...';
        container.appendChild(loading);

        try {
            const data = await apiRequest(`/api/owner/pets/${encodeURIComponent(petId)}/vaccinations`);
            container.replaceChildren();

            const petInfo = data.pet || {};
            const heading = document.createElement('h4');
            heading.textContent = 'Digital Vaccination Card';
            container.appendChild(heading);

            addVaccinationDetail(container, 'Pet name', petInfo.name);
            addVaccinationDetail(container, 'Official Pet ID', petInfo.petCode);
            addVaccinationDetail(container, 'Species', petInfo.species);
            addVaccinationDetail(container, 'Registration status', readableStatus(petInfo.registrationStatus));

            const records = Array.isArray(data.vaccinations) ? data.vaccinations : [];
            const historyHeading = document.createElement('h4');
            historyHeading.textContent = 'Vaccination History';
            container.appendChild(historyHeading);

            if (records.length === 0) {
                const empty = document.createElement('p');
                empty.className = 'empty-state';
                empty.textContent = 'No vaccination records have been entered by veterinary staff yet.';
                container.appendChild(empty);
                return true;
            }

            records.forEach((record) => {
                const entry = document.createElement('article');
                entry.className = 'owner-vaccination-entry';
                const vaccineHeading = document.createElement('h5');
                vaccineHeading.textContent = record.vaccineName || 'Unnamed vaccine';
                entry.appendChild(vaccineHeading);

                addVaccinationDetail(entry, 'Date administered', formatVaccinationDate(record.administeredDate));
                addVaccinationDetail(entry, 'Next due date', formatVaccinationDate(record.nextDueDate));
                addVaccinationDetail(entry, 'Manufacturer', record.manufacturer);
                addVaccinationDetail(entry, 'Batch / lot number', record.batchNumber);
                addVaccinationDetail(entry, 'Dosage', record.dosage);
                addVaccinationDetail(entry, 'Recorded by', record.administeredBy);
                if (record.notes) addVaccinationDetail(entry, 'Notes', record.notes);

                container.appendChild(entry);
            });

            return true;
        } catch (error) {
            container.replaceChildren();
            const message = document.createElement('p');
            message.className = 'message error';
            message.textContent = error.message || 'Unable to load vaccination card.';
            container.appendChild(message);
            return false;
        }
    }

    const card = document.createElement('article');
    card.className = 'pet-card';

    if (pet.hasPhoto && pet.id) {
    const photo = document.createElement('img');

    photo.className = 'registered-pet-photo';
    photo.alt = `${pet.name || 'Pet'} photo`;
    photo.loading = 'lazy';

    fetch(`/api/owner/pets/${encodeURIComponent(pet.id)}/photo`, {
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
            const imageUrl = URL.createObjectURL(blob);
            photo.src = imageUrl;

            photo.addEventListener('load', () => {
                URL.revokeObjectURL(imageUrl);
            }, { once: true });
        })
        .catch(() => {
            photo.alt = 'Pet photo unavailable';
            photo.classList.add('pet-photo-unavailable');
        });

    card.appendChild(photo);
}

    const name = document.createElement('h3');
    name.textContent = pet.name || 'Unnamed pet';

    const species = document.createElement('p');
    species.textContent = `Species: ${pet.species || 'Not specified'}`;

    const breed = document.createElement('p');
    breed.textContent = `Breed: ${pet.breed || 'Not specified'}`;

    const sex = document.createElement('p');
    sex.textContent = `Sex: ${pet.sex || 'Unknown'}`;

    const color = document.createElement('p');
    color.textContent = `Color: ${pet.color || 'Not specified'}`;

    card.append(name, species, breed, sex, color);

    if (pet.dateOfBirth) {
        const birthDate = document.createElement('p');
        birthDate.textContent = `Date of birth: ${pet.dateOfBirth.slice(0, 10)}`;
        card.appendChild(birthDate);
    }

    const status = document.createElement('span');
    status.className = `pet-status ${pet.registrationStatus || ''}`;
    status.textContent = readableStatus(pet.registrationStatus);
    card.appendChild(status);

    if (pet.registrationStatus === 'approved') {
        const petCode = document.createElement('p');
        petCode.textContent = pet.petCode ? `Official Pet ID: ${pet.petCode}` : 'Official Pet ID is pending.';
        card.appendChild(petCode);

        const vaccinationButton = document.createElement('button');
        vaccinationButton.type = 'button';
        vaccinationButton.className = 'secondary-button vaccination-toggle';
        vaccinationButton.textContent = 'View Digital Vaccination Card';

        const vaccinationContainer = document.createElement('section');
        vaccinationContainer.className = 'owner-vaccination-card';
        vaccinationContainer.hidden = true;

        vaccinationButton.addEventListener('click', async () => {
            if (!vaccinationContainer.hidden) {
                vaccinationContainer.hidden = true;
                vaccinationButton.textContent = 'View Digital Vaccination Card';
                return;
            }
            vaccinationContainer.hidden = false;
            vaccinationButton.textContent = 'Hide Digital Vaccination Card';

            if (vaccinationContainer.dataset.loaded === 'true') return;

            vaccinationButton.disabled = true;
            const loaded = await loadOwnerVaccinationCard(pet.id, vaccinationContainer);
            if (loaded) vaccinationContainer.dataset.loaded = 'true';
            vaccinationButton.disabled = false;
        });

        card.appendChild(vaccinationButton);
        card.appendChild(vaccinationContainer);

        if (pet.petCode && pet.id) {
            const qrSection = document.createElement('div');
            qrSection.className = 'pet-qr-section';

            const qrHeading = document.createElement('h4');
            qrHeading.textContent = 'Pet Identification QR Code';
            qrSection.appendChild(qrHeading);

            const qrMessage = document.createElement('p');
            qrMessage.className = 'message';
            qrMessage.textContent = 'Loading QR code...';
            qrSection.appendChild(qrMessage);

            const qrImage = document.createElement('img');
            qrImage.alt = `QR code for ${pet.name}`;
            qrImage.hidden = true;
            qrSection.appendChild(qrImage);

            const downloadButton = document.createElement('button');
            downloadButton.type = 'button';
            downloadButton.className = 'secondary-button';
            downloadButton.textContent = 'Download QR Code';
            downloadButton.disabled = true;
            qrSection.appendChild(downloadButton);

            downloadButton.addEventListener('click', () => {
                if (!qrImage.src || qrImage.hidden) return;
                const link = document.createElement('a');
                link.href = qrImage.src;
                link.download = `${pet.petCode}-QR.png`;
                document.body.appendChild(link);
                link.click();
                link.remove();
            });

            card.appendChild(qrSection);

            apiRequest(`/api/owner/pets/${encodeURIComponent(pet.id)}/qr-image`)
                .then((data) => {
                    if (!data.qrCodeImage) throw new Error('No QR image returned.');
                    qrImage.src = data.qrCodeImage;
                    qrImage.hidden = false;
                    downloadButton.disabled = false;
                    showMessage(qrMessage, 'QR code ready.', 'success');
                })
                .catch((error) => {
                    showMessage(qrMessage, error.message || 'Unable to load QR code.', 'error');
                });
        }
    }

    return card;
}

function createNotificationCard(notification) {
    const card = document.createElement('article');
    card.className = notification.read ? 'owner-notification-card is-read' : 'owner-notification-card is-unread';

    const heading = document.createElement('h3');
    heading.textContent = notification.title || 'Notification';
    card.appendChild(heading);

    const message = document.createElement('p');
    message.textContent = notification.message || '';
    card.appendChild(message);

    if (notification.priority === 'high') {
        const priority = document.createElement('span');
        priority.className = 'notification-priority high';
        priority.textContent = 'High priority';
        card.appendChild(priority);
    }

    if (!notification.read) {
        const markReadButton = document.createElement('button');
        markReadButton.type = 'button';
        markReadButton.className = 'secondary-button';
        markReadButton.textContent = 'Mark as Read';
        markReadButton.addEventListener('click', () => {
            markNotificationAsRead(notification.id, markReadButton);
        });
        card.appendChild(markReadButton);
    }

    return card;
}


function formatOwnerFeedingTimestamp(value) {
    if (!value) {
        return 'Not recorded';
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return 'Not available';
    }

    return date.toLocaleString();
}


function createOwnerFeedingEventCard(event) {
    const card = document.createElement('article');
    card.className = 'owner-feeding-event-card';

    const petName = event.pet?.name || 'Unknown pet';

    const heading = document.createElement('h3');
    heading.textContent = petName;
    card.appendChild(heading);

    function addDetail(label, value) {
        const detail = document.createElement('p');
        detail.textContent = `${label}: ${value}`;
        card.appendChild(detail);
    }

    const statusLabels = {
        running: 'In progress',
        completed: 'Completed',
        failed: 'Failed',
        cancelled: 'Cancelled'
    };

    addDetail(
        'Status',
        statusLabels[event.status] || event.status || 'Unknown'
    );

    const statusMessages = {
        running: 'Feeding has started. The final outcome has not been recorded yet.',
        completed:
            event.dispensedGrams !== undefined &&
            event.dispensedGrams !== null
                ? `Feeding was marked completed. The reported dispensed amount is ${event.dispensedGrams} g.`
                : 'Feeding was marked completed, but the dispensed amount was not reported.',
        failed: event.failureReason
            ? `Feeding failed. Reason: ${event.failureReason}`
            : 'This feeding attempt failed. No failure reason was recorded.',
        cancelled: event.failureReason
            ? `Feeding was cancelled. Reason: ${event.failureReason}`
            : 'This feeding attempt was cancelled. No cancellation reason was recorded.'
    };

    const outcome = document.createElement('p');
    outcome.className = 'feeding-outcome-message';
    outcome.textContent =
        statusMessages[event.status] ||
        'Additional feeding-result details are unavailable.';
    card.appendChild(outcome);

    addDetail(
        'Feeding type',
        event.source === 'manual' ? 'Manual' : 'Scheduled'
    );

    addDetail('Requested food', `${event.requestedGrams} g`);

    addDetail(
        'Dispensed food',
        event.dispensedGrams !== undefined &&
        event.dispensedGrams !== null
            ? `${event.dispensedGrams} g`
            : 'Not reported'
    );

    addDetail('Started', formatOwnerFeedingTimestamp(event.startedAt));
    addDetail('Completed', formatOwnerFeedingTimestamp(event.completedAt));

    const statusClass = String(event.status || 'unknown')
        .toLowerCase()
        .replace(/[^a-z-]/g, '');

    card.classList.add(`feeding-status-${statusClass}`);

    return card;
}


async function populateOwnerFeedingPetFilter() {
    if (
        !ownerFeedingPetFilter ||
        ownerFeedingPetFilter.dataset.loaded === 'true'
    ) {
        return;
    }

    try {
        const data = await apiRequest('/api/owner/pets');
        const pets = Array.isArray(data.pets) ? data.pets : [];

        pets.forEach((pet) => {
            const option = document.createElement('option');
            option.value = pet.id;
            option.textContent = pet.species
                ? `${pet.name} (${pet.species})`
                : pet.name;

            ownerFeedingPetFilter.appendChild(option);
        });

        ownerFeedingPetFilter.dataset.loaded = 'true';
    } catch (error) {
        console.error('Unable to load pets for feeding filters:', error);
    }
}

    async function loadOwnerFeedingEvents() {
    if (!refreshOwnerFeedingEventsButton || !ownerFeedingEventList) {
        return;
    }

    refreshOwnerFeedingEventsButton.disabled = true;

    showMessage(
        ownerFeedingEventsSummary,
        'Loading feeding history...'
    );

    ownerFeedingEventList.replaceChildren();

    try {
        await populateOwnerFeedingPetFilter();

const params = new URLSearchParams();

if (ownerFeedingPetFilter?.value) {
    params.set('petId', ownerFeedingPetFilter.value);
}

if (ownerFeedingStatusFilter?.value) {
    params.set('status', ownerFeedingStatusFilter.value);
}

const query = params.toString();
const endpoint = query
    ? `/api/owner/feeding-events?${query}`
    : '/api/owner/feeding-events';

const data = await apiRequest(endpoint);
        const events = Array.isArray(data.events) ? data.events : [];

        if (events.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'empty-state';
            empty.textContent =
                'No feeding events have been recorded for your pets yet.';

            ownerFeedingEventList.appendChild(empty);

            showMessage(
                ownerFeedingEventsSummary,
                'No feeding events found.'
            );

            return;
        }

        events.forEach((event) => {
            ownerFeedingEventList.appendChild(
                createOwnerFeedingEventCard(event)
            );
        });

        showMessage(
            ownerFeedingEventsSummary,
            `${events.length} feeding event(s) loaded.`,
            'success'
        );
    } catch (error) {
        showMessage(
            ownerFeedingEventsSummary,
            error.message || 'Unable to load feeding history.',
            'error'
        );
    } finally {
        refreshOwnerFeedingEventsButton.disabled = false;
    }
}


async function loadNotifications() {
    refreshNotificationsButton.disabled = true;
    showMessage(notificationsSummary, 'Loading notifications...');
    ownerNotificationList.replaceChildren();

    try {
        const data = await apiRequest('/api/owner/notifications');
        const notifications = Array.isArray(data.notifications) ? data.notifications : [];
        const unreadCount = Number(data.unreadCount) || 0;

        if (sidebarUnreadCount) sidebarUnreadCount.textContent = unreadCount;
        if (overviewUnreadCount) overviewUnreadCount.textContent = unreadCount;

        showMessage(notificationsSummary, `${unreadCount} unread notification(s).`, 'success');

        if (notifications.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'empty-state';
            empty.textContent = 'You have no notifications yet.';
            ownerNotificationList.appendChild(empty);
            return;
        }

        notifications.forEach((notification) => {
            ownerNotificationList.appendChild(createNotificationCard(notification));
        });
    } catch (error) {
        showMessage(notificationsSummary, error.message || 'Unable to load notifications.', 'error');
    } finally {
        refreshNotificationsButton.disabled = false;
    }
}

async function markNotificationAsRead(notificationId, button) {
    button.disabled = true;
    try {
        await apiRequest(`/api/owner/notifications/${encodeURIComponent(notificationId)}/read`, { method: 'PATCH' });
        await loadNotifications();
    } catch (error) {
        button.disabled = false;
    }
}

async function loadPets() {
    refreshPetsButton.disabled = true;
    showMessage(petsMessage, 'Loading registered pets...');

    try {
        const data = await apiRequest('/api/owner/pets');
        petList.replaceChildren();

        const pets = Array.isArray(data.pets) ? data.pets : [];
        const count = data.count ?? pets.length;

        if (sidebarPetsCount) sidebarPetsCount.textContent = count;
        if (overviewPetsCount) overviewPetsCount.textContent = count;

        if (pets.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'empty-state';
            empty.textContent = 'You have not registered any pets yet. Use the Register tab to add your first pet.';
            petList.appendChild(empty);
        } else {
            pets.forEach((pet) => {
                petList.appendChild(createPetCard(pet));
            });
        }

        showMessage(petsMessage, `${count} pet record(s) found.`, 'success');
    } catch (error) {
        showMessage(petsMessage, error.message, 'error');
    } finally {
        refreshPetsButton.disabled = false;
    }
}

async function verifyOwner() {
    if (!token) {
        logout();
        return;
    }

    try {
        const data = await apiRequest('/api/auth/me');

        if (data.user?.role !== 'owner') {
            showMessage(dashboardMessage, 'This page is only for pet-owner accounts.', 'error');
            return;
        }

        ownerVerified = true;
        welcomeHeading.textContent = `Welcome, ${data.user.fullName || 'Pet Owner'}`;
        showMessage(dashboardMessage, 'Your account is verified.', 'success');

        await Promise.all([loadPets(), loadNotifications()]);
    } catch (error) {
        showMessage(dashboardMessage, error.message, 'error');
    }
}

registrationForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    if (!ownerVerified) {
        showMessage(registrationMessage, 'Your owner account has not been verified.', 'error');
        return;
    }

    registerPetButton.disabled = true;
    showMessage(registrationMessage, 'Submitting pet registration...');

    const formData = new FormData(registrationForm);
    const petData = {
        name: String(formData.get('name') || '').trim(),
        species: String(formData.get('species') || ''),
        breed: String(formData.get('breed') || '').trim(),
        sex: String(formData.get('sex') || 'unknown'),
        color: String(formData.get('color') || '').trim()
    };

    const dateOfBirth = String(formData.get('dateOfBirth') || '');
    if (dateOfBirth) petData.dateOfBirth = dateOfBirth;

    try {
        const uploadData = new FormData();

        uploadData.append('name', petData.name);
        uploadData.append('species', petData.species);

        if (petData.breed) {
            uploadData.append('breed', petData.breed);
        }

        if (petData.sex) {
            uploadData.append('sex', petData.sex);
        }

        if (petData.color) {
            uploadData.append('color', petData.color);
        }

        if (petData.dateOfBirth) {
            uploadData.append('dateOfBirth', petData.dateOfBirth);
        }

        const photoInput = document.getElementById('petPhoto');

        if (photoInput && photoInput.files.length > 0) {
            uploadData.append('petPhoto', photoInput.files[0]);
        }

        const data = await apiRequest('/api/owner/pets', {
            method: 'POST',
            body: uploadData
        });

        showMessage(registrationMessage, data.message || 'Pet registration submitted for review.', 'success');
        registrationForm.reset();
        await loadPets();
        switchView('mypets');
    } catch (error) {
        showMessage(registrationMessage, error.message, 'error');
    } finally {
        registerPetButton.disabled = false;
    }
});

resetFormButton.addEventListener('click', () => { showMessage(registrationMessage, ''); });
refreshPetsButton.addEventListener('click', loadPets);
refreshNotificationsButton.addEventListener('click', loadNotifications);


const feedingHistoryNavButton = document.querySelector('[data-view="feeding"]');

if (feedingHistoryNavButton) {
    feedingHistoryNavButton.addEventListener('click', loadOwnerFeedingEvents);
}

if (refreshOwnerFeedingEventsButton) {
    refreshOwnerFeedingEventsButton.addEventListener('click', loadOwnerFeedingEvents);
}

if (applyOwnerFeedingFiltersButton) {
    applyOwnerFeedingFiltersButton.addEventListener('click', loadOwnerFeedingEvents);
}

verifyOwner();