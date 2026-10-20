
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

async function runTest() {
    const email = (
        await askLine('Pet owner email: ')
    ).toLowerCase();

    const password = await askHidden(
        'Pet owner password (hidden while typing): '
    );

    let token = null;
    let failed = false;

    try {
        // 1. Authenticate as a pet owner.
        const loginResponse = await fetch(
            `${API_BASE}/api/auth/login`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json'
                },
                body: JSON.stringify({ email, password })
            }
        );

        const loginData = await loginResponse.json();

        if (
            !loginResponse.ok ||
            !loginData.success ||
            !loginData.accessToken ||
            loginData.user?.role !== 'owner'
        ) {
            console.error(
                `FAIL: Owner login returned HTTP ${loginResponse.status}.`
            );
            console.error(
                loginData.message ||
                'The supplied account is not an authenticated owner.'
            );
            process.exitCode = 1;
            return;
        }

        token = loginData.accessToken;
        console.log('PASS: Pet owner authenticated.');

        const headers = {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
            'Content-Type': 'application/json'
        };

        // 2. Submit a pet with a unique test name.
        const testPet = {
            name: `Smoke Test Pet ${Date.now()}`,
            species: 'dog',
            breed: 'Mixed Breed',
            sex: 'unknown',
            color: 'Brown'
        };

        const registrationResponse = await fetch(
            `${API_BASE}/api/owner/pets`,
            {
                method: 'POST',
                headers,
                body: JSON.stringify(testPet)
            }
        );

        const registrationData = await registrationResponse.json();

        if (
            registrationResponse.status !== 201 ||
            !registrationData.success ||
            registrationData.pet?.registrationStatus !== 'pending'
        ) {
            failed = true;
            console.error(
                `FAIL: Registration returned HTTP ${registrationResponse.status}.`
            );
            console.error(
                registrationData.message ||
                'Pet registration did not return the expected result.'
            );
        } else {
            console.log('PASS: Pet registration returned HTTP 201.');
            console.log('PASS: New pet starts with pending status.');

            // 3. Retrieve the owner's pets.
            const listResponse = await fetch(
                `${API_BASE}/api/owner/pets`,
                { headers }
            );

            const listData = await listResponse.json();

            if (
                !listResponse.ok ||
                !listData.success ||
                !Array.isArray(listData.pets)
            ) {
                failed = true;
                console.error(
                    `FAIL: Pet list returned HTTP ${listResponse.status}.`
                );
            } else if (
                !listData.pets.some(
                    (pet) => pet.id === registrationData.pet.id
                )
            ) {
                failed = true;
                console.error(
                    'FAIL: Newly registered pet was not found in the owner list.'
                );
            } else {
                console.log('PASS: Owner can retrieve the registered pet.');
            }
        }

        // 4. Verify invalid species is rejected.
        const invalidResponse = await fetch(
            `${API_BASE}/api/owner/pets`,
            {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    name: 'Invalid Species Test',
                    species: 'dragon'
                })
            }
        );

        const invalidData = await invalidResponse.json();

        if (
            invalidResponse.status === 400 &&
            invalidData.success === false
        ) {
            console.log('PASS: Invalid species was rejected with HTTP 400.');
        } else {
            failed = true;
            console.error(
                `FAIL: Invalid species returned HTTP ${invalidResponse.status}; expected HTTP 400.`
            );
        }

        // 5. Verify missing pet name is rejected.
        const missingNameResponse = await fetch(
            `${API_BASE}/api/owner/pets`,
            {
                method: 'POST',
                headers,
                body: JSON.stringify({ species: 'cat' })
            }
        );

        const missingNameData = await missingNameResponse.json();

        if (
            missingNameResponse.status === 400 &&
            missingNameData.success === false
        ) {
            console.log('PASS: Missing pet name was rejected with HTTP 400.');
        } else {
            failed = true;
            console.error(
                `FAIL: Missing name returned HTTP ${missingNameResponse.status}; expected HTTP 400.`
            );
        }

        if (failed) {
            console.error('\nSome pet registration tests failed.');
            process.exitCode = 1;
        } else {
            console.log('\nAll pet registration smoke tests passed.');
        }
    } finally {
        // Never print or persist credentials or tokens.
        token = null;
    }
}

runTest().catch((error) => {
    console.error('\nPet registration test could not complete.');
    console.error(`${error.name || 'Error'}: ${error.message}`);
    process.exitCode = 1;
});
