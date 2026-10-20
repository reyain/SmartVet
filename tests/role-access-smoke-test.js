
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

async function runRoleAccessTest() {
    const email = (
        await askLine('Account email: ')
    ).toLowerCase();

    const password = await askHidden(
        'Account password (hidden while typing): '
    );

    let token = null;
    let failed = false;

    try {
        // Sign in and retrieve the access token.
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
            !loginData.accessToken ||
            !loginData.user?.role
        ) {
            console.error(
                `FAIL: Login returned HTTP ${loginResponse.status}.`
            );
            console.error(
                loginData.message || 'Login did not return a valid access token.'
            );
            process.exitCode = 1;
            return;
        }

        token = loginData.accessToken;

        const role = loginData.user.role;

        const roleRoutes = {
            admin: '/api/admin',
            veterinary: '/api/clinic',
            owner: '/api/owner'
        };

        if (!Object.hasOwn(roleRoutes, role)) {
            console.error(`FAIL: Unexpected account role: ${role}`);
            process.exitCode = 1;
            return;
        }

        console.log(`\nLogin successful. Account role: ${role}`);
        console.log('\nTesting all three protected role routes...');

        for (const [routeRole, path] of Object.entries(roleRoutes)) {
            const response = await fetch(`${API_BASE}${path}`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: 'application/json'
                }
            });

            const expectedStatus = routeRole === role ? 200 : 403;

            if (response.status === expectedStatus) {
                console.log(
                    `PASS: ${path} returned HTTP ${response.status}.`
                );
            } else {
                failed = true;
                console.error(
                    `FAIL: ${path} returned HTTP ${response.status}; ` +
                    `expected HTTP ${expectedStatus}.`
                );

                // Print a safe diagnostic message, never the token.
                try {
                    const result = await response.json();
                    if (result.message) {
                        console.error(`      Message: ${result.message}`);
                    }
                } catch {
                    // The response may not contain JSON.
                }
            }
        }

        if (failed) {
            console.error('\nRole-access test failed.');
            process.exitCode = 1;
        } else {
            console.log('\nAll role-access checks passed.');
        }
    } finally {
        // Do not print or save the password or token.
        token = null;
    }
}

runRoleAccessTest().catch((error) => {
    console.error('\nRole-access test could not complete.');
    console.error(`${error.name || 'Error'}: ${error.message}`);
    process.exitCode = 1;
});
