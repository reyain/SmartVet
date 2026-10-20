const express = require('express');
const mongoose = require('mongoose');
const QRCode = require('qrcode');
const { body, validationResult } = require('express-validator');


const Pet = require('../models/Pet');

const {
    requireAuth,
    authorizeRoles
} = require('../middleware/authMiddleware');

const router = express.Router();

// All endpoints in this router require an authenticated pet owner.
router.use(requireAuth, authorizeRoles('owner'));

// GET /api/owner
// Verify that the authenticated user can access the owner area.
router.get('/', (req, res) => {
    return res.status(200).json({
        success: true,
        area: 'owner',
        message: 'Pet owner access verified.',
        user: {
            id: req.user.id,
            fullName: req.user.fullName,
            role: req.user.role
        }
    });
});

// POST /api/owner/pets
// Submit a pet registration for veterinary review.
router.post(
    '/pets',
    [
        body('name')
            .isString()
            .withMessage('Pet name is required.')
            .bail()
            .trim()
            .notEmpty()
            .withMessage('Pet name is required.')
            .bail()
            .isLength({ max: 100 })
            .withMessage('Pet name must not exceed 100 characters.'),

        body('species')
            .isString()
            .withMessage('A valid pet species is required.')
            .bail()
            .trim()
            .toLowerCase()
            .isIn(['dog', 'cat', 'rabbit', 'bird', 'other'])
            .withMessage(
                'Species must be dog, cat, rabbit, bird, or other.'
            ),

        body('breed')
            .optional()
            .isString()
            .withMessage('Breed must be text.')
            .bail()
            .trim()
            .isLength({ max: 100 })
            .withMessage('Breed must not exceed 100 characters.'),

        body('sex')
            .optional()
            .isString()
            .withMessage('Sex must be male, female, or unknown.')
            .bail()
            .trim()
            .toLowerCase()
            .isIn(['male', 'female', 'unknown'])
            .withMessage('Sex must be male, female, or unknown.'),

        body('dateOfBirth')
            .optional({ values: 'null' })
            .isISO8601({ strict: true })
            .withMessage('Date of birth must be a valid YYYY-MM-DD date.')
            .bail()
            .custom((value) => {
                const date = new Date(`${value}T00:00:00.000Z`);
                const today = new Date();
                today.setUTCHours(0, 0, 0, 0);

                return date <= today;
            })
            .withMessage('Date of birth cannot be in the future.'),

        body('color')
            .optional()
            .isString()
            .withMessage('Color must be text.')
            .bail()
            .trim()
            .isLength({ max: 100 })
            .withMessage('Color must not exceed 100 characters.')
    ],
    async (req, res, next) => {
        const errors = validationResult(req);

        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: 'Please correct the pet registration details.',
                errors: errors.array().map((error) => ({
                    field: error.path,
                    message: error.msg
                }))
            });
        }

        try {
            const petData = {
                // Always use the authenticated user's ID.
                ownerUserId: req.user.id,
                name: req.body.name.trim(),
                species: req.body.species.trim().toLowerCase(),
                registrationStatus: 'pending'
            };

            if (req.body.breed !== undefined) {
                petData.breed = req.body.breed.trim();
            }

            if (req.body.sex !== undefined) {
                petData.sex = req.body.sex.trim().toLowerCase();
            }

            if (req.body.dateOfBirth !== undefined) {
                petData.dateOfBirth = new Date(
                    `${req.body.dateOfBirth}T00:00:00.000Z`
                );
            }

            if (req.body.color !== undefined) {
                petData.color = req.body.color.trim();
            }

            const pet = await Pet.create(petData);

            return res.status(201).json({
                success: true,
                message: 'Pet registration submitted for veterinary review.',
                pet: {
                    id: pet._id.toString(),
                    name: pet.name,
                    species: pet.species,
                    breed: pet.breed,
                    sex: pet.sex,
                    dateOfBirth: pet.dateOfBirth || null,
                    color: pet.color,
                    registrationStatus: pet.registrationStatus,
                    createdAt: pet.createdAt
                }
            });
        } catch (error) {
            return next(error);
        }
    }
);

// GET /api/owner/pets
// Return only pets belonging to the authenticated owner.
router.get('/pets', async (req, res, next) => {
    try {
        const pets = await Pet.find({
            ownerUserId: req.user.id
        })
            .select(
                'name species breed sex dateOfBirth color registrationStatus createdAt'
            )
            .sort({ createdAt: -1 })
            .lean();

        return res.status(200).json({
            success: true,
            count: pets.length,
            pets: pets.map((pet) => ({
                id: pet._id.toString(),
                name: pet.name,
                species: pet.species,
                breed: pet.breed,
                sex: pet.sex,
                dateOfBirth: pet.dateOfBirth || null,
                color: pet.color,
                registrationStatus: pet.registrationStatus,
                createdAt: pet.createdAt
            }))
        });
    } catch (error) {
        return next(error);
    }
});


/**
 * GET /api/owner/pets/qr/:identifier
 * Retrieve an approved pet only if it belongs to the logged-in owner.
 */
router.get('/pets/qr/:identifier', async (req, res, next) => {
    const identifier = req.params.identifier;

    if (!/^[a-fA-F0-9]{64}$/.test(identifier)) {
        return res.status(400).json({
            success: false,
            message: 'Invalid QR identifier format.'
        });
    }

    try {
        const pet = await Pet.findOne({
            qrIdentifier: identifier.toLowerCase(),
            ownerUserId: req.user.id,
            registrationStatus: 'approved'
        })
            .select(
                'petCode name species breed sex dateOfBirth color registrationStatus verifiedAt'
            )
            .lean();

        if (!pet) {
            return res.status(404).json({
                success: false,
                message: 'No approved pet was found for this QR code.'
            });
        }

        return res.status(200).json({
            success: true,
            pet: {
                id: pet._id.toString(),
                petCode: pet.petCode,
                name: pet.name,
                species: pet.species,
                breed: pet.breed,
                sex: pet.sex,
                dateOfBirth: pet.dateOfBirth || null,
                color: pet.color,
                registrationStatus: pet.registrationStatus,
                verifiedAt: pet.verifiedAt || null
            }
        });
    } catch (error) {
        return next(error);
    }
});


/**
 * GET /api/owner/pets/:petId/qr-image
 * Generate a QR image for an approved pet belonging to the logged-in owner.
 */
router.get('/pets/:petId/qr-image', async (req, res, next) => {
    const { petId } = req.params;

    if (!mongoose.isValidObjectId(petId)) {
        return res.status(400).json({
            success: false,
            message: 'Invalid pet ID.'
        });
    }

    try {
        const pet = await Pet.findOne({
            _id: petId,
            ownerUserId: req.user.id,
            registrationStatus: 'approved'
        })
            .select('+qrIdentifier petCode name species')
            .lean();

        if (!pet || !pet.qrIdentifier || !pet.petCode) {
            return res.status(404).json({
                success: false,
                message: 'No approved pet with a QR code was found.'
            });
        }

        const qrCodeImage = await QRCode.toDataURL(pet.qrIdentifier, {
            errorCorrectionLevel: 'M',
            type: 'image/png',
            margin: 2,
            width: 300
        });

        return res.status(200).json({
            success: true,
            pet: {
                petCode: pet.petCode,
                name: pet.name,
                species: pet.species
            },
            qrCodeImage
        });
    } catch (error) {
        return next(error);
    }
});



module.exports = router;
