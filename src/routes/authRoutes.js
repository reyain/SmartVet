
const express = require('express');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');

const User = require('../models/User');

const {
    hashPassword,
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

// Limit repeated registration attempts.
const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: 'Too many registration attempts. Please try again later.'
    }
});

// POST /api/auth/register
// Public registration can create OWNER accounts only.
router.post(
    '/register',
    registerLimiter,
    [
        body('fullName')
            .isString()
            .withMessage('Please enter a valid full name.')
            .bail()
            .trim()
            .isLength({ min: 2, max: 120 })
            .withMessage('Full name must be 2 to 120 characters.'),

        body('email')
            .isString()
            .withMessage('Please enter a valid email address.')
            .bail()
            .trim()
            .isEmail()
            .withMessage('Please enter a valid email address.')
            .bail()
            .isLength({ max: 254 })
            .withMessage('Email address is too long.'),

        body('password')
            .isString()
            .withMessage('Password must contain at least 8 characters.')
            .bail()
            .isLength({ min: 8 })
            .withMessage('Password must contain at least 8 characters.')
            .bail()
            .custom((password) => {
                return Buffer.byteLength(password, 'utf8') <= 72;
            })
            .withMessage('Password must not exceed 72 UTF-8 bytes.'),

        body('phone')
            .optional({ checkFalsy: true })
            .isString()
            .withMessage('Please enter a valid phone number.')
            .bail()
            .trim()
            .isLength({ max: 30 })
            .withMessage('Phone number must not exceed 30 characters.')
    ],
    async (req, res, next) => {
        const errors = validationResult(req);

        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: errors.array()[0].msg
            });
        }

        const fullName = req.body.fullName.trim();
        const email = req.body.email.trim().toLowerCase();
        const password = req.body.password;
        const phone = typeof req.body.phone === 'string'
            ? req.body.phone.trim()
            : '';

        try {
            // Prevent registration with an email already in use.
            const existingUser = await User.findOne({ email }).lean();

            if (existingUser) {
                return res.status(409).json({
                    success: false,
                    message: 'An account with this email already exists.'
                });
            }

            // Hash the password before saving it.
            const passwordHash = await hashPassword(password);

            // Never accept a role supplied by the registration form.
            const user = await User.create({
                fullName,
                email,
                passwordHash,
                phone,
                role: 'owner',
                status: 'active'
            });

            // Sign in the new owner.
            const accessToken = createAccessToken(user);

            user.lastLoginAt = new Date();
            await user.save();

            return res.status(201).json({
                success: true,
                message: 'Owner account registered successfully.',
                tokenType: 'Bearer',
                accessToken,
                expiresIn: process.env.JWT_EXPIRES_IN || '1h',
                user: {
                    id: user._id.toString(),
                    fullName: user.fullName,
                    email: user.email,
                    phone: user.phone,
                    role: user.role
                }
            });
        } catch (error) {
            // Handle a duplicate email if simultaneous requests occur.
            if (error && error.code === 11000) {
                return res.status(409).json({
                    success: false,
                    message: 'An account with this email already exists.'
                });
            }

            return next(error);
        }
    }
);

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
            const user = await User.findOne({ email })
                .select('+passwordHash');

            if (!user) {
                return res.status(401).json({
                    success: false,
                    message: 'Invalid email or password.'
                });
            }

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

            const accessToken = createAccessToken(user);

            user.lastLoginAt = new Date();
            await user.save();

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
