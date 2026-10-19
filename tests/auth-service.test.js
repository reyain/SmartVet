
require('dotenv').config();

const assert = require('node:assert/strict');

const {
    hashPassword,
    comparePassword,
    createAccessToken,
    verifyAccessToken
} = require('../src/services/authService');

async function runTests() {
    let passed = 0;

    function check(description, condition) {
        assert.ok(condition, description);
        passed++;
        console.log(`PASS: ${description}`);
    }

    console.log('\n=== AUTHENTICATION SERVICE TESTS ===');

    // Test password hashing.
    const password = 'SmartVetTest#9876';
    const passwordHash = await hashPassword(password);

    check(
        'Password is hashed rather than stored as plain text',
        passwordHash !== password
    );

    // Test password verification.
    check(
        'Correct password is accepted',
        await comparePassword(password, passwordHash)
    );

    check(
        'Incorrect password is rejected',
        !(await comparePassword('WrongPassword#123', passwordHash))
    );

    // Test the password length restrictions.
    await assert.rejects(
        () => hashPassword('short'),
        /at least 8 characters/
    );
    check('Passwords shorter than 8 characters are rejected', true);

    // Test token creation and verification.
    const testUser = {
        _id: '507f1f77bcf86cd799439011'
    };

    const token = createAccessToken(testUser);
    const verifiedToken = verifyAccessToken(token);

    check(
        'Access token is created',
        typeof token === 'string' && token.length > 0
    );

    check(
        'Verified token identifies the correct user',
        verifiedToken.userId === testUser._id
    );

    check(
        'Token includes an expiration time',
        verifiedToken.expiresAt instanceof Date
    );

    // Test rejection of an invalid token.
    assert.throws(
        () => verifyAccessToken('invalid.token.value')
    );

    check('Invalid token is rejected', true);

    console.log('\n=== TEST SUMMARY ===');
    console.log(`Passed: ${passed}`);
    console.log('Failed: 0');
    console.log('\nAll authentication service tests passed.');
}

runTests().catch((error) => {
    console.error('\nAuthentication service test failed.');
    console.error('Error type:', error.name || 'Error');
    console.error('Message:', error.message);
    process.exitCode = 1;
});
