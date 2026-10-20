
require('dotenv').config();

const readline = require('readline');
const mongoose = require('mongoose');

const connectDB = require('../src/config/db');
const User = require('../src/models/User');
const { hashPassword } = require('../src/services/authService');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function ask(question) {
    return new Promise((resolve) => {
        rl.question(question, (answer) => resolve(answer.trim()));
    });
}

function askHidden(question) {
    return new Promise((resolve) => {
        const stdin = process.stdin;
        const wasRaw = stdin.isRaw;

        process.stdout.write(question);

        let answer = '';

        function cleanup() {
            stdin.removeListener('data', onData);
            if (stdin.isTTY) {
                stdin.setRawMode(Boolean(wasRaw));
            }
            process.stdout.write('\n');
        }

        function onData(data) {
            const input = data.toString('utf8');

            for (const char of input) {
                if (char === '\u0003') {
                    cleanup();
                    rl.close();
                    process.exit(130);
                }

                if (char === '\r' || char === '\n') {
                    cleanup();
                    resolve(answer);
                    return;
                }

                if (char === '\u007f' || char === '\b') {
                    answer = answer.slice(0, -1);
                    continue;
                }

                if (char >= ' ') {
                    answer += char;
                }
            }
        }

        if (stdin.isTTY) {
            stdin.setRawMode(true);
        }

        stdin.on('data', onData);
    });
}

async function createUser() {
    try {
        console.log('\n=== SmartVet Account Setup ===');
        console.log('Allowed roles: veterinary, owner\n');

        const fullName = await ask('Full name: ');
        const email = (await ask('Email address: ')).toLowerCase();
        const phone = await ask('Phone number (optional): ');

        const role = (await ask(
            'Account role (veterinary/owner): '
        )).toLowerCase();

        if (!['veterinary', 'owner'].includes(role)) {
            throw new Error(
                'Invalid role. Only veterinary or owner is allowed.'
            );
        }

        if (!fullName || fullName.length < 2) {
            throw new Error('Please enter a valid full name.');
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            throw new Error('Please enter a valid email address.');
        }

        const existingUser = await User.findOne({ email });

        if (existingUser) {
            throw new Error(
                'An account with that email address already exists.'
            );
        }

        const password = await askHidden('New password (hidden): ');
        const confirmPassword = await askHidden('Confirm password: ');

        if (password !== confirmPassword) {
            throw new Error('The passwords do not match.');
        }

        const passwordHash = await hashPassword(password);

        const user = await User.create({
            fullName,
            email,
            phone,
            passwordHash,
            role,
            status: 'active'
        });

        console.log('\nAccount created successfully.');
        console.log(`Name: ${user.fullName}`);
        console.log(`Email: ${user.email}`);
        console.log(`Role: ${user.role}`);
        console.log(`Status: ${user.status}`);
        console.log(`User ID: ${user._id}`);
    } finally {
        rl.close();
    }
}

async function main() {
    try {
        await connectDB();
        await createUser();
    } catch (error) {
        console.error('\nAccount creation failed:', error.message);
        process.exitCode = 1;
    } finally {
        if (mongoose.connection.readyState !== 0) {
            await mongoose.disconnect();
        }
    }
}

main();
