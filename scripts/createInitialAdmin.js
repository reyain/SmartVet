
require('dotenv').config();

const readline = require('node:readline');
const mongoose = require('mongoose');

const connectDB = require('../src/config/db');
const User = require('../src/models/User');
const { hashPassword } = require('../src/services/authService');

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

// Read a password without displaying its actual characters.
function askHidden(question) {
    return new Promise((resolve, reject) => {
        const input = process.stdin;

        if (!input.isTTY || typeof input.setRawMode !== 'function') {
            reject(new Error(
                'Run this script directly in the VS Code terminal.'
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

async function createInitialAdmin() {
    await connectDB();

    // Make sure the user indexes, including the unique email index,
    // are ready before creating an account.
    await User.init();

    // This script can bootstrap the first administrator only.
    const existingAdmin = await User.exists({ role: 'admin' });

    if (existingAdmin) {
        throw new Error(
            'An administrator already exists. No account was created.'
        );
    }

    const fullName = await askLine('Administrator full name: ');
    const email = (
        await askLine('Administrator email: ')
    ).toLowerCase();

    if (!fullName || fullName.length < 2) {
        throw new Error('Enter a valid full name.');
    }

    if (fullName.length > 120) {
        throw new Error('Full name must not exceed 120 characters.');
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
        email.length > 254) {
        throw new Error('Enter a valid email address.');
    }

    const existingUser = await User.exists({ email });

    if (existingUser) {
        throw new Error(
            'This email already belongs to an account.'
        );
    }

    const password = await askHidden(
        'Administrator password (hidden while typing): '
    );

    if (!password) {
        throw new Error('Password cannot be empty.');
    }

    // hashPassword enforces the configured password-length rules.
    const passwordHash = await hashPassword(password);

    // The administrator role is assigned only by this trusted
    // local bootstrap script, never by a public signup request.
    const admin = await User.create({
        fullName,
        email,
        passwordHash,
        role: 'admin',
        status: 'active'
    });

    console.log('\nInitial administrator created successfully.');
    console.log(`Account ID: ${admin._id}`);
    console.log(`Email: ${admin.email}`);
    console.log('Role: admin');
    console.log('The password was hashed before storage.');
}

createInitialAdmin()
    .catch((error) => {
        console.error('\nCould not create the initial administrator.');
        console.error(`${error.name || 'Error'}: ${error.message}`);
        process.exitCode = 1;
    })
    .finally(async () => {
        if (mongoose.connection.readyState !== 0) {
            await mongoose.disconnect().catch(() => {});
        }
    });
