
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

async function loginAs(roleLabel, expectedRole) {
    const email = (
        await askLine(`${roleLabel} email: `)
    ).toLowerCase();

    const password = await askHidden(
        `${roleLabel} password (hidden while typing): `
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
            `${roleLabel} login failed with HTTP ${response.status}. ` +
            (data.message || 'Check the account and its assigned role.')
        );
    }

    return {
        token: data.accessToken,
        user: data.user
    };
}

async function apiRequest(path, token, method = 'GET', body) {
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

    let data;

    try {
        data = await response.json();
    } catch {
        data = {};
    }

    return { response, data };
}

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }

    console.log(`PASS: ${message}`);
}

async function runTest() {
    let ownerToken = null;
    let veterinaryToken = null;

    try {
        console.log('=== SmartVet Veterinary Review Tests ===\n');

        // 1. Sign in as owner.
        const owner = await loginAs('Pet owner', 'owner');
        ownerToken = owner.token;
        console.log('PASS: Pet owner authenticated.');

        // 2. Create two new pending test pets.
        const suffix = Date.now();

        const firstPetResult = await apiRequest(
            '/api/owner/pets',
            ownerToken,
            'POST',
            {
                name: `Approval Test Pet ${suffix}`,
                species: 'dog',
                breed: 'Mixed Breed',
                sex: 'unknown',
                color: 'Brown'
            }
        );

        assert(
            firstPetResult.response.status === 201 &&
            firstPetResult.data.success &&
            firstPetResult.data.pet?.id,
            'First test pet was registered.'
        );

        const approvalPetId = firstPetResult.data.pet.id;

        const secondPetResult = await apiRequest(
            '/api/owner/pets',
            ownerToken,
            'POST',
            {
                name: `Verification Test Pet ${suffix}`,
                species: 'cat',
                breed: 'Domestic',
                sex: 'unknown',
                color: 'White'
            }
        );

        assert(
            secondPetResult.response.status === 201 &&
            secondPetResult.data.success &&
            secondPetResult.data.pet?.id,
            'Second test pet was registered.'
        );

        const verificationPetId = secondPetResult.data.pet.id;

        // 3. Owner must not access veterinary review routes.
        const ownerPendingResult = await apiRequest(
            '/api/clinic/pets/pending',
            ownerToken
        );

        assert(
            ownerPendingResult.response.status === 403,
            'Owner is forbidden from viewing veterinary pending registrations.'
        );

        // 4. Sign in as veterinary staff.
        const veterinary = await loginAs(
            'Veterinary staff',
            'veterinary'
        );
        veterinaryToken = veterinary.token;
        console.log('PASS: Veterinary staff authenticated.');

        // 5. Retrieve pending registrations.
        const pendingResult = await apiRequest(
            '/api/clinic/pets/pending',
            veterinaryToken
        );

        assert(
            pendingResult.response.status === 200 &&
            pendingResult.data.success &&
            Array.isArray(pendingResult.data.pets),
            'Veterinary staff can retrieve pending registrations.'
        );

        assert(
            pendingResult.data.pets.some(
                (pet) => pet.id === approvalPetId
            ) &&
            pendingResult.data.pets.some(
                (pet) => pet.id === verificationPetId
            ),
            'Both new test pets appear in the pending list.'
        );

        // 6. Approve the first pet.
        const approvalResult = await apiRequest(
            `/api/clinic/pets/${approvalPetId}/approve`,
            veterinaryToken,
            'PATCH',
            { notes: 'Smoke test approval.' }
        );

        assert(
            approvalResult.response.status === 200 &&
            approvalResult.data.success &&
            approvalResult.data.pet?.registrationStatus === 'approved',
            'Veterinary staff can approve a pending pet.'
        );

        assert(
            typeof approvalResult.data.pet.petCode === 'string' &&
            /^PET-[A-F0-9]{8}$/.test(
                approvalResult.data.pet.petCode
            ),
            'Approved pet receives an official Pet ID.'
        );

        assert(
            Boolean(approvalResult.data.pet.verifiedAt),
            'Approval response includes the verification timestamp.'
        );

        // 7. A second approval must be rejected.
        const repeatApprovalResult = await apiRequest(
            `/api/clinic/pets/${approvalPetId}/approve`,
            veterinaryToken,
            'PATCH',
            {}
        );

        assert(
            repeatApprovalResult.response.status === 404,
            'An already-reviewed pet cannot be approved again.'
        );

        // 8. Mark the second pet as needing verification.
        const verificationResult = await apiRequest(
            `/api/clinic/pets/${verificationPetId}/needs-verification`,
            veterinaryToken,
            'PATCH',
            {
                reason: 'Smoke test: confirm the submitted pet details.'
            }
        );

        assert(
            verificationResult.response.status === 200 &&
            verificationResult.data.success &&
            verificationResult.data.pet?.registrationStatus ===
                'needs_verification',
            'Veterinary staff can request additional verification.'
        );

        assert(
            verificationResult.data.pet?.verificationNotes ===
                'Smoke test: confirm the submitted pet details.',
            'The additional-verification reason is saved.'
        );

        // 9. Missing verification reason must be rejected.
        const missingReasonResult = await apiRequest(
            `/api/clinic/pets/${verificationPetId}/needs-verification`,
            veterinaryToken,
            'PATCH',
            {}
        );

        assert(
            missingReasonResult.response.status === 400,
            'A missing verification reason is rejected.'
        );

        console.log('\nAll veterinary review smoke tests passed.');
    } catch (error) {
        console.error('\nVETERINARY REVIEW TEST FAILED');
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
