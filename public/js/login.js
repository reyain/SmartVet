
const loginForm = document.getElementById('loginForm');
const loginButton = document.getElementById('loginButton');
const loginMessage = document.getElementById('loginMessage');

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

        if (!response.ok || !data.success || !data.accessToken) {
            throw new Error(data.message || 'Login failed.');
        }

        // Keep the token for this browser tab's session.
        sessionStorage.setItem('smartvetAccessToken', data.accessToken);
        sessionStorage.setItem('smartvetUser', JSON.stringify(data.user));

        const destinations = {
            owner: '/owner/dashboard.html',
            veterinary: '/clinic/dashboard.html',
            admin: '/admin/dashboard.html'
        };

        const destination = destinations[data.user?.role];

        if (!destination) {
            sessionStorage.removeItem('smartvetAccessToken');
            sessionStorage.removeItem('smartvetUser');
            throw new Error('This account has an unrecognized role.');
        }

        window.location.assign(destination);
    } catch (error) {
        loginMessage.textContent = error.message || 'Unable to sign in.';
    } finally {
        loginButton.disabled = false;
        loginButton.textContent = 'Sign in';
    }
});
