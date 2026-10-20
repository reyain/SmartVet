
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

        showMessage(dashboardMessage, 'Your account is verified.', 'success');
        await loadPets();
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

verifyOwner();
