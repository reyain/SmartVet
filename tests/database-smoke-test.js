
require('dotenv').config();

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const connectDB = require('../src/config/db');
const User = require('../src/models/User');

async function runDatabaseTest() {
    let testUserId = null;

    try {
        // 1. Connect to MongoDB Atlas.
        await connectDB();

        console.log('PASS: MongoDB connection established.');

        // 2. Ensure the User model's indexes are ready.
        await User.init();

        console.log('PASS: User collection indexes are ready.');

        // 3. Generate unique, temporary test credentials.
        const randomId = crypto.randomBytes(12).toString('hex');

        const testEmail =
            `smartvet-test-${randomId}@example.invalid`;

        const temporaryPassword = crypto.randomBytes(32).toString('hex');

        const passwordHash = await bcrypt.hash(
            temporaryPassword,
            10
        );

        // 4. Create a temporary test document.
        const testUser = await User.create({
            fullName: 'SmartVet Database Test',
            email: testEmail,
            passwordHash,
            role: 'owner',
            status: 'active'
        });

        testUserId = testUser._id;

        console.log('PASS: Temporary test user created.');

        // 5. Read the document back from MongoDB.
        const foundUser = await User.findById(testUserId)
            .select('fullName email role status')
            .lean();

        if (!foundUser) {
            throw new Error('Test user could not be retrieved.');
        }

        if (foundUser.email !== testEmail) {
            throw new Error('Retrieved email does not match.');
        }

        console.log('PASS: Temporary test user retrieved.');
        console.log('PASS: Retrieved fields match.');

        // 6. Delete the temporary test document.
        const deletion = await User.deleteOne({
            _id: testUserId
        });

        if (deletion.deletedCount !== 1) {
            throw new Error('Temporary test user was not deleted.');
        }

        testUserId = null;

        console.log('PASS: Temporary test user deleted.');
        console.log('\nAll database smoke tests passed.');

    } catch (error) {
        console.error('\nDatabase smoke test failed.');
        console.error('Error type:', error.name || 'Error');

        // Avoid displaying credentials if a URI appears in an error.
        const safeMessage = String(error.message || 'Unknown error')
            .replace(
                /mongodb(?:\+srv)?:\/\/[^@\s]+@/gi,
                'mongodb+srv://[REDACTED]@'
            );

        console.error('Message:', safeMessage);

        process.exitCode = 1;

    } finally {
        // Remove the temporary user if an earlier step failed.
        if (
            testUserId &&
            mongoose.connection.readyState === 1
        ) {
            try {
                await User.deleteOne({ _id: testUserId });
                console.log('Cleanup: temporary test record removed.');
            } catch {
                console.error(
                    'Cleanup warning: check Atlas for the temporary test record.'
                );
            }
        }

        // Close the database connection when the test ends.
        if (mongoose.connection.readyState !== 0) {
            await mongoose.disconnect().catch(() => {});
        }
    }
}

runDatabaseTest();
