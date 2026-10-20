
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

                if (character === '\u007f' || character === '\b') {
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

async function loginAs(label, expectedRole) {
    const email = (
        await askLine(`${label} email: `)
    ).toLowerCase();

    const password = await askHidden(
        `${label} password (hidden while typing): `
    );

    const response = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json'
        },
        body: JSON.stringify({ email, password })
    });

    const data = await response.json();

    if (
        !response.ok ||
        !data.success ||
        !data.accessToken ||
        data.user?.role !== expectedRole
    ) {
        throw new Error(
            `${label} login failed with HTTP ${response.status}. ` +
            (data.message || 'Check the account and its assigned role.')
        );
    }

    return data.accessToken;
}

async function request(path, token, method = 'GET', body) {
    const options = {
        method,
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
            'Content-Type': 'application/json'
        }
    };

    if (body !== undefined) {
        options.body = JSON.stringify(body);
    }

    const response = await fetch(`${API_BASE}${path}`, options);
    const data = await response.json();

    return { response, data };
}

function check(condition, message) {
    if (!condition) {
        throw new Error(`FAIL: ${message}`);
    }

    console.log(`PASS: ${message}`);
}

async function runTest() {
    let ownerToken;
    let veterinaryToken;

    try {
        console.log('=== SmartVet QR Generation Test ===\n');

        // 1. Sign in as the owner.
        ownerToken = await loginAs('Pet owner', 'owner');
        console.log('PASS: Pet owner authenticated.');

        // 2. Register a fresh pet for this test.
        const registration = await request(
            '/api/owner/pets',
            ownerToken,
            'POST',
            {
                name: `QR Test Pet ${Date.now()}`,
                species: 'dog',
                breed: 'Mixed Breed',
                sex: 'unknown',
                color: 'Brown'
            }
        );

        check(
            registration.response.status === 201 &&
            registration.data.success &&
            registration.data.pet?.id &&
            registration.data.pet?.registrationStatus === 'pending',
            'Test pet registered with pending status.'
        );

        const petId = registration.data.pet.id;

        // 3. Sign in as veterinary staff.
        veterinaryToken = await loginAs(
            'Veterinary staff',
            'veterinary'
        );
        console.log('PASS: Veterinary staff authenticated.');

        // 4. Approve the pet.
        const approval = await request(
            `/api/clinic/pets/${petId}/approve`,
            veterinaryToken,
            'PATCH',
            { notes: 'QR generation smoke test.' }
        );

        check(
            approval.response.status === 200 &&
            approval.data.success,
            'Veterinary staff approved the test pet.'
        );

        const pet = approval.data.pet;

        check(
            pet?.registrationStatus === 'approved',
            'Pet registration status is approved.'
        );

        check(
            typeof pet?.petCode === 'string' &&
            /^PET-[A-F0-9]{8}$/.test(pet.petCode),
            'Official Pet ID was assigned.'
        );

        // 5. Check the returned QR image.
        const qrImage = pet?.qrCodeImage;

        check(
            typeof qrImage === 'string' &&
            qrImage.startsWith('data:image/png;base64,'),
            'Approval response contains a PNG QR image data URL.'
        );

        const base64 = qrImage.split(',')[1];
        const pngBytes = Buffer.from(base64, 'base64');

        check(
            pngBytes.length > 8 &&
            pngBytes.subarray(0, 8).equals(
                Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
            ),
            'QR image data contains a valid PNG file signature.'
        );

        console.log('\nAll QR generation smoke tests passed.');
        console.log(`Test Pet ID: ${pet.petCode}`);
        console.log('The QR image was generated successfully.');
    } catch (error) {
        console.error('\nQR GENERATION TEST FAILED');
        console.error(error.message);
        process.exitCode = 1;
    } finally {
        // Do not print or persist credentials or access tokens.
        ownerToken = null;
        veterinaryToken = null;
    }
}

runTest().catch((error) => {
    console.error('\nTest could not complete.');
    console.error(`${error.name || 'Error'}: ${error.message}`);
    process.exitCode = 1;
});
