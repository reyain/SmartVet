
const express = require('express');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');

const User = require('../models/User');

const {
    comparePassword,
    createAccessToken
} = require('../services/authService');

const {
    requireAuth
} = require('../middleware/authMiddleware');

const router = express.Router();

// Limit repeated login attempts.
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: 'Too many login attempts. Please try again later.'
    }
});

// POST /api/auth/login
router.post(
    '/login',
    loginLimiter,

    [
        body('email')
            .isString()
            .withMessage('A valid email and password are required.')
            .bail()
            .trim()
            .isEmail()
            .withMessage('A valid email and password are required.'),

        body('password')
            .isString()
            .withMessage('A valid email and password are required.')
            .bail()
            .notEmpty()
            .withMessage('A valid email and password are required.')
            .bail()
            .custom((password) => {
                return Buffer.byteLength(password, 'utf8') <= 72;
            })
            .withMessage('A valid email and password are required.')
    ],

    async (req, res, next) => {
        // Reject missing or malformed login information.
        const errors = validationResult(req);

        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: 'Please provide a valid email and password.'
            });
        }

        const email = req.body.email.trim().toLowerCase();
        const password = req.body.password;

        try {
            // Password hashes are hidden by default in User.js,
            // so explicitly request the hash for verification.
            const user = await User.findOne({ email })
                .select('+passwordHash');

            if (!user) {
                return res.status(401).json({
                    success: false,
                    message: 'Invalid email or password.'
                });
            }

            // Verify the password and reject disabled accounts.
            const passwordIsValid = await comparePassword(
                password,
                user.passwordHash
            );

            if (!passwordIsValid || user.status !== 'active') {
                return res.status(401).json({
                    success: false,
                    message: 'Invalid email or password.'
                });
            }

            // Generate an access token only after authentication.
            const accessToken = createAccessToken(user);

            // Update the account's last successful login time.
            user.lastLoginAt = new Date();
            await user.save();

            // Return safe user information; never return the password hash.
            return res.status(200).json({
                success: true,
                message: 'Login successful.',
                tokenType: 'Bearer',
                accessToken,
                expiresIn: process.env.JWT_EXPIRES_IN || '1h',
                user: {
                    id: user._id.toString(),
                    fullName: user.fullName,
                    email: user.email,
                    role: user.role
                }
            });
        } catch (error) {
            return next(error);
        }
    }
);

// GET /api/auth/me
// Return the profile of the authenticated user.
router.get('/me', requireAuth, (req, res) => {
    return res.status(200).json({
        success: true,
        user: req.user,
        tokenExpiresAt: req.auth.expiresAt
    });
});

module.exports = router;
