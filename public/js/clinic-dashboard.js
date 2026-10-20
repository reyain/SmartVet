
const petList = document.getElementById('petList');
const listMessage = document.getElementById('listMessage');
const sessionMessage = document.getElementById('sessionMessage');
const welcomeHeading = document.getElementById('welcomeHeading');
const refreshButton = document.getElementById('refreshButton');
const logoutButton = document.getElementById('logoutButton');

const tokenKey = 'smartvetAccessToken';
const userKey = 'smartvetUser';

let dashboardReady = false;

function getToken() {
  return sessionStorage.getItem(tokenKey);
}

function logout() {
  sessionStorage.removeItem(tokenKey);
  sessionStorage.removeItem(userKey);
  window.location.replace('/login.html');
}

function showMessage(element, message, type = '') {
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
    // Handle an empty or non-JSON response below.
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

function createPetCard(pet) {
  const card = document.createElement('article');
  card.className = 'pet-card';

  addText(card, 'h3', pet.name || 'Unnamed pet');

  addText(card, 'p', `Species: ${pet.species || 'Not provided'}`);
  addText(card, 'p', `Breed: ${pet.breed || 'Not provided'}`);
  addText(card, 'p', `Sex: ${pet.sex || 'Not provided'}`);
  addText(card, 'p', `Date of birth: ${formatDate(pet.dateOfBirth)}`);
  addText(card, 'p', `Color: ${pet.color || 'Not provided'}`);

  const owner = pet.ownerUserId;

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
    createButton('Approve registration', 'primary', () => approvePet(pet._id, actions))
  );

  actions.appendChild(
    createButton('Needs verification', 'warning', () => requestVerification(pet._id, actions))
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

    // Support the usual { success, pets } response shape.
    const pets = Array.isArray(data.pets) ? data.pets : [];

    if (pets.length === 0) {
      petList.innerHTML = '';
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
    showMessage(listMessage, error.message || 'Unable to load registrations.', 'error');
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

    showMessage(listMessage, 'The registration was marked for verification.', 'success');
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
  const panel = document.createElement('section');
  panel.className = 'panel';
  panel.style.marginTop = '18px';

  addText(panel, 'h2', 'Approved Registration');

  const petCode =
    data.petCode ||
    data.pet?.petCode ||
    data.PetID ||
    data.petId;

  const petName =
    data.name ||
    data.pet?.name ||
    'Pet';

  if (petCode) {
    addText(panel, 'p', `Official Pet ID: ${petCode}`);
  }

  addText(panel, 'p', `Pet: ${petName}`);

  const qrImage =
    data.qrCodeImage ||
    data.pet?.qrCodeImage;

  if (typeof qrImage === 'string' && qrImage.startsWith('data:image/png;base64,')) {
    const qrPanel = document.createElement('div');
    qrPanel.className = 'qr-panel';

    addText(qrPanel, 'h3', 'Pet QR Code');
    addText(
      qrPanel,
      'p',
      'This QR code identifies the approved pet record. Keep access to the record protected.'
    );

    const image = document.createElement('img');
    image.src = qrImage;
    image.alt = `QR code for ${petName}`;
    qrPanel.appendChild(image);

    const download = document.createElement('a');
    download.href = qrImage;
    download.download = `${petCode || 'SmartVet-Pet'}-QR.png`;
    download.textContent = 'Download QR code';
    qrPanel.appendChild(download);

    panel.appendChild(qrPanel);
  } else {
    addText(
      panel,
      'p',
      'The registration was approved, but the QR image was not found in the response. Check the approval API response.',
      'muted'
    );
  }

  // Keep the most recent approval result at the top of the main content.
  const main = document.querySelector('main');
  const existing = document.getElementById('approvalResult');

  if (existing) existing.remove();

  panel.id = 'approvalResult';
  main.insertBefore(panel, main.children[1]);
}

async function verifyVeterinarySession() {
  if (!getToken()) {
    logout();
    return;
  }

  try {
    const data = await apiRequest('/api/auth/me');

    // Accommodate either { user: {...} } or a direct user object.
    const user = data.user || data;

    if (user.role !== 'veterinary') {
      logout();
      return;
    }

    welcomeHeading.textContent = `Welcome, ${user.fullName || 'Veterinary Staff'}`;
    showMessage(sessionMessage, 'Signed in as veterinary staff.', 'success');

    dashboardReady = true;
    await loadPendingPets();
  } catch (error) {
    showMessage(
      sessionMessage,
      error.message || 'Unable to verify your session.',
      'error'
    );
  }
}

refreshButton.addEventListener('click', loadPendingPets);
logoutButton.addEventListener('click', logout);

verifyVeterinarySession();
