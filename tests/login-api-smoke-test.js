
const readline = require('node:readline');

const API_BASE = 'http://127.0.0.1:3000';

function askLine(question) {
    return new Promise((resolve) => {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        rl.question(question, (answer) => {
            rl.close();
            resolve(answer.trim());
        });
    });
}

function askHidden(question) {
    return new Promise((resolve, reject) => {
        const input = process.stdin;

        if (!input.isTTY || typeof input.setRawMode !== 'function') {
            reject(new Error(
                'Run this test directly in the VS Code terminal.'
            ));
            return;
        }

        let password = '';

        function cleanup() {
            input.removeListener('data', onData);
            input.setRawMode(false);
            input.pause();
            process.stdout.write('\n');
        }

        function onData(buffer) {
            for (const character of buffer.toString('utf8')) {
                if (character === '\u0003') {
                    cleanup();
                    reject(new Error('Password entry cancelled.'));
                    return;
                }

                if (character === '\r' || character === '\n') {
                    cleanup();
                    resolve(password);
                    return;
                }

                if (
                    character === '\u007f' ||
                    character === '\b'
                ) {
                    if (password.length > 0) {
                        password = password.slice(0, -1);
                        process.stdout.write('\b \b');
                    }

                    continue;
                }

                if (character >= ' ') {
                    password += character;
                    process.stdout.write('*');
                }
            }
        }

        process.stdout.write(question);
        input.setRawMode(true);
        input.resume();
        input.on('data', onData);
    });
}

async function runLoginTest() {
    const email = (
        await askLine('Administrator email: ')
    ).toLowerCase();

    const password = await askHidden(
        'Administrator password (hidden while typing): '
    );

    let token = null;

    try {
        // Test the login endpoint.
        const loginResponse = await fetch(
            `${API_BASE}/api/auth/login`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({ email, password })
            }
        );

        const loginData = await loginResponse.json();

        if (
            !loginResponse.ok ||
            !loginData.success ||
            !loginData.accessToken
        ) {
            console.error(
                `FAIL: Login request returned HTTP ${loginResponse.status}.`
            );

            console.error(
                loginData.message || 'No successful login response was returned.'
            );

            process.exitCode = 1;
            return;
        }

        token = loginData.accessToken;

        console.log('PASS: Login API accepted the credentials.');
        console.log(`PASS: Authenticated role is ${loginData.user.role}.`);
        console.log(`PASS: Access token received: ${Boolean(token)}.`);

        // Test the protected profile endpoint.
        const profileResponse = await fetch(
            `${API_BASE}/api/auth/me`,
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/json'
                }
            }
        );

        const profileData = await profileResponse.json();

        if (
            !profileResponse.ok ||
            !profileData.success ||
            profileData.user.id !== loginData.user.id
        ) {
            console.error(
                `FAIL: Protected profile request returned HTTP ${profileResponse.status}.`
            );

            console.error(
                profileData.message || 'The profile response did not match the logged-in user.'
            );

            process.exitCode = 1;
            return;
        }

        console.log('PASS: Protected profile endpoint accepted the token.');
        console.log(`PASS: Profile belongs to ${profileData.user.fullName}.`);
        console.log('\nAll login API smoke tests passed.');
    } finally {
        // Do not display or persist the token or password.
        token = null;
    }
}

runLoginTest().catch((error) => {
    console.error('\nLogin API test could not complete.');
    console.error(`${error.name || 'Error'}: ${error.message}`);
    process.exitCode = 1;
});
