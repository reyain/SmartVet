
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

// Owner notification elements
const refreshNotificationsButton = document.getElementById(
    'refreshNotificationsButton'
);

const notificationsSummary = document.getElementById(
    'notificationsSummary'
);

const ownerNotificationList = document.getElementById(
    'ownerNotificationList'
);

let ownerVerified = false;

function showMessage(element, message, type = '') {
    element.textContent = message;
    element.classList.remove('error', 'success');

    if (type) {
        element.classList.add(type);
    }
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
            ...(options.body ? { 'Content-Type': 'application/json' } : {}),
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

    if (Number.isNaN(date.getTime())) {
        return 'Not available';
    }

    return date.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
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
        const data = await apiRequest(
            `/api/owner/pets/${encodeURIComponent(petId)}/vaccinations`
        );

        container.replaceChildren();

        const pet = data.pet || {};

        const heading = document.createElement('h4');
        heading.textContent = 'Digital Vaccination Card';
        container.appendChild(heading);

        addVaccinationDetail(container, 'Pet name', pet.name);
        addVaccinationDetail(container, 'Official Pet ID', pet.petCode);
        addVaccinationDetail(container, 'Species', pet.species);
        addVaccinationDetail(
            container,
            'Registration status',
            readableStatus(pet.registrationStatus)
        );

        const records = Array.isArray(data.vaccinations)
            ? data.vaccinations
            : [];

        const historyHeading = document.createElement('h4');
        historyHeading.textContent = 'Vaccination History';
        container.appendChild(historyHeading);

        if (records.length === 0) {
            const empty = document.createElement('p');
            empty.className = 'empty-state';
            empty.textContent =
                'No vaccination records have been entered by veterinary staff yet.';
            container.appendChild(empty);
            return true;
        }

        const count = document.createElement('p');
        count.className = 'form-help';
        count.textContent = `${records.length} vaccination record(s).`;
        container.appendChild(count);

        records.forEach((record) => {
            const entry = document.createElement('article');
            entry.className = 'owner-vaccination-entry';

            const vaccineHeading = document.createElement('h5');
            vaccineHeading.textContent =
                record.vaccineName || 'Unnamed vaccine';
            entry.appendChild(vaccineHeading);

            addVaccinationDetail(
                entry,
                'Date administered',
                formatVaccinationDate(record.administeredDate)
            );

            addVaccinationDetail(
                entry,
                'Next due date',
                formatVaccinationDate(record.nextDueDate)
            );

            addVaccinationDetail(
                entry,
                'Manufacturer',
                record.manufacturer
            );

            addVaccinationDetail(
                entry,
                'Batch / lot number',
                record.batchNumber
            );

            addVaccinationDetail(entry, 'Dosage', record.dosage);
            addVaccinationDetail(
                entry,
                'Recorded by',
                record.administeredBy
            );

            if (record.notes) {
                addVaccinationDetail(entry, 'Notes', record.notes);
            }

            container.appendChild(entry);
        });

        return true;
    } catch (error) {
        container.replaceChildren();

        const message = document.createElement('p');
        message.className = 'message error';
        message.textContent =
            error.message || 'Unable to load the vaccination card.';
        container.appendChild(message);

        return false;
    }
}

    const card = document.createElement('article');
    card.className = 'pet-card';

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
        birthDate.textContent =
            `Date of birth: ${pet.dateOfBirth.slice(0, 10)}`;
        card.appendChild(birthDate);
    }

    const status = document.createElement('span');
    status.className = `pet-status ${pet.registrationStatus || ''}`;
    status.textContent = readableStatus(pet.registrationStatus);
    card.appendChild(status);

    // Show the official Pet ID and QR code only after approval.
    if (pet.registrationStatus === 'approved') {
        const petCode = document.createElement('p');
        petCode.className = 'pet-code';
        petCode.textContent = pet.petCode
            ? `Official Pet ID: ${pet.petCode}`
            : 'Official Pet ID is not available yet.';
        card.appendChild(petCode);

        
        // Allow the owner to open the digital vaccination card.
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
                vaccinationButton.textContent =
                    'View Digital Vaccination Card';
                return;
            }

            vaccinationContainer.hidden = false;
            vaccinationButton.textContent = 'Hide Digital Vaccination Card';

            if (vaccinationContainer.dataset.loaded === 'true') {
                return;
            }

            vaccinationButton.disabled = true;

            const loaded = await loadOwnerVaccinationCard(
                pet.id,
                vaccinationContainer
            );

            if (loaded) {
                vaccinationContainer.dataset.loaded = 'true';
            }

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
            qrImage.alt = `QR identification code for ${pet.name}`;
            qrImage.width = 200;
            qrImage.height = 200;
            qrImage.hidden = true;
            qrImage.style.maxWidth = '100%';
            qrImage.style.height = 'auto';
            qrSection.appendChild(qrImage);

            const downloadButton = document.createElement('button');
            downloadButton.type = 'button';
            downloadButton.className = 'secondary-button';
            downloadButton.textContent = 'Download QR Code';
            downloadButton.disabled = true;
            qrSection.appendChild(downloadButton);

            downloadButton.addEventListener('click', () => {
                if (!qrImage.src || qrImage.hidden) {
                    return;
                }

                const link = document.createElement('a');
                link.href = qrImage.src;
                link.download = `${pet.petCode}-QR.png`;
                document.body.appendChild(link);
                link.click();
                link.remove();
            });

            card.appendChild(qrSection);

            apiRequest(
                `/api/owner/pets/${encodeURIComponent(pet.id)}/qr-image`
            )
                .then((data) => {
                    if (!data.qrCodeImage) {
                        throw new Error('The server did not return a QR image.');
                    }

                    qrImage.src = data.qrCodeImage;
                    qrImage.hidden = false;
                    downloadButton.disabled = false;
                    showMessage(qrMessage, 'QR code ready to download.', 'success');
                })
                .catch((error) => {
                    showMessage(
                        qrMessage,
                        error.message || 'Unable to load the QR code.',
                        'error'
                    );
                });
        }
    }

    return card;
}


function formatNotificationTimestamp(value) {
    if (!value) return 'Date unavailable';

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return 'Date unavailable';
    }

    return date.toLocaleString();
}

function createNotificationCard(notification) {
    const card = document.createElement('article');

    card.className = notification.read
        ? 'owner-notification-card is-read'
        : 'owner-notification-card is-unread';

    const heading = document.createElement('h3');
    heading.textContent = notification.title || 'Notification';
    card.appendChild(heading);

    const message = document.createElement('p');
    message.className = 'notification-message';
    message.textContent = notification.message || '';
    card.appendChild(message);

    if (notification.pet) {
        const petDetails = document.createElement('p');
        petDetails.className = 'notification-meta';

        petDetails.textContent = notification.pet.name
            ? `Pet: ${notification.pet.name}${
                notification.pet.petCode
                    ? ` (${notification.pet.petCode})`
                    : ''
              }`
            : 'Related pet';

        card.appendChild(petDetails);
    }

    const details = document.createElement('p');
    details.className = 'notification-meta';

    details.textContent =
        `${notification.read ? 'Read' : 'Unread'} · ` +
        formatNotificationTimestamp(notification.createdAt);

    card.appendChild(details);

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
            markNotificationAsRead(
                notification.id,
                markReadButton
            );
        });

        card.appendChild(markReadButton);
    } else {
        const readLabel = document.createElement('span');
        readLabel.className = 'notification-read-label';
        readLabel.textContent = 'Already read';
        card.appendChild(readLabel);
    }

    return card;
}

async function loadNotifications() {
    refreshNotificationsButton.disabled = true;

    showMessage(
        notificationsSummary,
        'Loading notifications...'
    );

    ownerNotificationList.replaceChildren();

    try {
        const data = await apiRequest('/api/owner/notifications');

        const notifications = Array.isArray(data.notifications)
            ? data.notifications
            : [];

        const unreadCount = Number(data.unreadCount) || 0;

        showMessage(
            notificationsSummary,
            `${unreadCount} unread notification(s) · ` +
            `${notifications.length} notification(s) displayed.`,
            'success'
        );

        if (notifications.length === 0) {
            const empty = document.createElement('div');

            empty.className = 'empty-state';
            empty.textContent = 'You have no notifications yet.';

            ownerNotificationList.appendChild(empty);
            return;
        }

        const fragment = document.createDocumentFragment();

        notifications.forEach((notification) => {
            fragment.appendChild(
                createNotificationCard(notification)
            );
        });

        ownerNotificationList.appendChild(fragment);
    } catch (error) {
        showMessage(
            notificationsSummary,
            error.message || 'Unable to load notifications.',
            'error'
        );

        const errorMessage = document.createElement('div');
        errorMessage.className = 'empty-state';
        errorMessage.textContent =
            'Your notifications could not be loaded. Please try again.';

        ownerNotificationList.appendChild(errorMessage);
    } finally {
        refreshNotificationsButton.disabled = false;
    }
}

async function markNotificationAsRead(notificationId, button) {
    button.disabled = true;
    button.textContent = 'Updating...';

    try {
        await apiRequest(
            `/api/owner/notifications/${
                encodeURIComponent(notificationId)
            }/read`,
            {
                method: 'PATCH'
            }
        );

        showMessage(
            notificationsSummary,
            'Notification marked as read.',
            'success'
        );

        // Reload the list and unread count from the server.
        await loadNotifications();
    } catch (error) {
        showMessage(
            notificationsSummary,
            error.message || 'Unable to mark the notification as read.',
            'error'
        );

        button.disabled = false;
        button.textContent = 'Mark as Read';
    }
}


async function loadPets() {
    refreshPetsButton.disabled = true;
    showMessage(petsMessage, 'Loading registered pets...');

    try {
        const data = await apiRequest('/api/owner/pets');
        petList.replaceChildren();

        if (!Array.isArray(data.pets) || data.pets.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'empty-state';
            empty.textContent =
                'You have not registered any pets yet. Use the form to register your first pet.';
            petList.appendChild(empty);
        } else {
            data.pets.forEach((pet) => {
                petList.appendChild(createPetCard(pet));
            });
        }

        showMessage(
            petsMessage,
            `${data.count ?? data.pets.length} pet record(s) found.`,
            'success'
        );
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
                showMessage(
                    dashboardMessage,
                    'This page is only for pet-owner accounts.',
                    'error'
                );
                registrationForm.querySelectorAll('input, select, button')
                    .forEach((element) => { element.disabled = true; });
                return;
            }

            ownerVerified = true;
            welcomeHeading.textContent =
                `Welcome, ${data.user.fullName || 'Pet Owner'}`;

            showMessage(
        dashboardMessage,
        'Your account is verified.',
        'success'
    );

    await Promise.all([
        loadPets(),
        loadNotifications()
    ]);
    } catch (error) {
        showMessage(dashboardMessage, error.message, 'error');
    }
}

registrationForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    if (!ownerVerified) {
        showMessage(
            registrationMessage,
            'Your owner account has not been verified.',
            'error'
        );
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

    if (dateOfBirth) {
        petData.dateOfBirth = dateOfBirth;
    }

    try {
        const data = await apiRequest('/api/owner/pets', {
            method: 'POST',
            body: JSON.stringify(petData)
        });

        showMessage(
            registrationMessage,
            data.message || 'Pet registration submitted for veterinary review.',
            'success'
        );

        registrationForm.reset();
        await loadPets();
    } catch (error) {
        showMessage(registrationMessage, error.message, 'error');
    } finally {
        registerPetButton.disabled = false;
    }
});

resetFormButton.addEventListener('click', () => {
    showMessage(registrationMessage, '');
});


refreshPetsButton.addEventListener('click', loadPets);

refreshNotificationsButton.addEventListener(
    'click',
    loadNotifications
);

verifyOwner();
