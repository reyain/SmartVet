const loginForm = document.getElementById('loginForm');
const loginButton = document.getElementById('loginButton');
const loginMessage = document.getElementById('loginMessage');

const registerForm = document.getElementById('registerForm');
const registerButton = document.getElementById('registerButton');
const registerMessage = document.getElementById('registerMessage');

const loginView = document.getElementById('loginView');
const registerView = document.getElementById('registerView');

const showRegisterButton = document.getElementById('showRegisterButton');
const showLoginButton = document.getElementById('showLoginButton');

function showLoginView() {
    registerView.hidden = true;
    loginView.hidden = false;
    registerMessage.textContent = '';
}

function showRegisterView() {
    loginView.hidden = true;
    registerView.hidden = false;
    loginMessage.textContent = '';
}

showRegisterButton.addEventListener('click', showRegisterView);
showLoginButton.addEventListener('click', showLoginView);

function redirectByRole(user) {
    const destinations = {
        owner: '/owner/dashboard.html',
        veterinary: '/clinic/dashboard.html',
        admin: '/admin/dashboard.html'
    };

    const destination = destinations[user?.role];

    if (!destination) {
        sessionStorage.removeItem('smartvetAccessToken');
        sessionStorage.removeItem('smartvetUser');
        throw new Error('This account has an unrecognized role.');
    }

    window.location.assign(destination);
}

function saveAuthenticatedSession(data) {
    if (!data.success || !data.accessToken || !data.user) {
        throw new Error('The server returned an invalid authentication response.');
    }

    sessionStorage.setItem('smartvetAccessToken', data.accessToken);
    sessionStorage.setItem('smartvetUser', JSON.stringify(data.user));

    redirectByRole(data.user);
}

// Existing login process
loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    loginButton.disabled = true;
    loginButton.textContent = 'Signing in...';
    loginMessage.textContent = '';

    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    try {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json'
            },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || 'Login failed.');
        }

        saveAuthenticatedSession(data);
    } catch (error) {
        loginMessage.textContent = error.message || 'Unable to sign in.';
    } finally {
        loginButton.disabled = false;
        loginButton.textContent = 'Sign in';
    }
});

// New owner registration process
registerForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    registerMessage.textContent = '';

    const fullName = document.getElementById('registerFullName').value.trim();
    const email = document.getElementById('registerEmail').value.trim();
    const phone = document.getElementById('registerPhone').value.trim();
    const password = document.getElementById('registerPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;

    if (password !== confirmPassword) {
        registerMessage.textContent = 'The passwords do not match.';
        return;
    }

    registerButton.disabled = true;
    registerButton.textContent = 'Creating account...';

    try {
        const response = await fetch('/api/auth/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json'
            },
            body: JSON.stringify({
                fullName,
                email,
                phone,
                password
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || 'Registration failed.');
        }

        // Registration automatically signs the new owner in.
        saveAuthenticatedSession(data);
    } catch (error) {
        registerMessage.textContent =
            error.message || 'Unable to create your account.';
    } finally {
        registerButton.disabled = false;
        registerButton.textContent = 'Create owner account';
    }
});