
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const BCRYPT_ROUNDS = 12;
const JWT_ISSUER = 'smartvet-api';
const JWT_AUDIENCE = 'smartvet-client';

function getJwtSecret() {
    const secret = process.env.JWT_SECRET;

    // Require a strong secret before issuing or verifying tokens.
    if (!secret || secret.length < 64) {
        throw new Error(
            'JWT_SECRET is missing or too short. Check your .env file.'
        );
    }

    return secret;
}

// Hash a password before saving it to MongoDB.
async function hashPassword(password) {
    if (typeof password !== 'string' || password.length < 8) {
        throw new Error(
            'Password must contain at least 8 characters.'
        );
    }

    // bcrypt has a 72-byte input limit.
    if (Buffer.byteLength(password, 'utf8') > 72) {
        throw new Error(
            'Password must not exceed 72 UTF-8 bytes.'
        );
    }

    return bcrypt.hash(password, BCRYPT_ROUNDS);
}

// Compare a supplied password with its stored hash.
async function comparePassword(password, passwordHash) {
    if (
        typeof password !== 'string' ||
        typeof passwordHash !== 'string' ||
        passwordHash.length === 0
    ) {
        return false;
    }

    return bcrypt.compare(password, passwordHash);
}

// Create a signed access token for an authenticated user.
// Store only the user's ID in the token; the backend will
// retrieve the current role and account status from MongoDB.
function createAccessToken(user) {
    if (!user || !user._id) {
        throw new Error('A valid user ID is required.');
    }

    const secret = getJwtSecret();
    const expiresIn = process.env.JWT_EXPIRES_IN || '1h';

    return jwt.sign(
        {},
        secret,
        {
            algorithm: 'HS256',
            subject: String(user._id),
            expiresIn,
            issuer: JWT_ISSUER,
            audience: JWT_AUDIENCE
        }
    );
}

// Verify a token's signature, expiry, issuer, and audience.
function verifyAccessToken(token) {
    if (typeof token !== 'string' || token.length === 0) {
        throw new Error('An authentication token is required.');
    }

    const payload = jwt.verify(token, getJwtSecret(), {
        algorithms: ['HS256'],
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE
    });

    if (!payload || typeof payload.sub !== 'string') {
        throw new Error('Invalid authentication token payload.');
    }

    return {
        userId: payload.sub,
        expiresAt: payload.exp
            ? new Date(payload.exp * 1000)
            : null
    };
}

module.exports = {
    hashPassword,
    comparePassword,
    createAccessToken,
    verifyAccessToken
};
