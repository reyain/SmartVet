
const express = require('express');
const mongoose = require('mongoose');
const crypto = require('crypto');
const { body, validationResult } = require('express-validator');

const Pet = require('../models/Pet');

const {
    requireAuth,
    authorizeRoles
} = require('../middleware/authMiddleware');

const router = express.Router();

// All routes in this file require a logged-in veterinary user.
router.use(requireAuth, authorizeRoles('veterinary'));

// Generate an official Pet ID.
// Example: PET-A1B2C3D4
function generatePetCode() {
    return `PET-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

// Veterinary area access check.
router.get('/', (req, res) => {
    res.status(200).json({
        success: true,
        area: 'clinic',
        message: 'Veterinary personnel access verified.',
        user: {
            id: req.user.id,
            fullName: req.user.fullName,
            role: req.user.role
        }
    });
});

// 1. View pending pet registrations.
router.get('/pets/pending', async (req, res, next) => {
    try {
        const pets = await Pet.find({
            registrationStatus: 'pending'
        })
            .select(
                'ownerUserId name species breed sex dateOfBirth color registrationStatus createdAt'
            )
            .populate('ownerUserId', 'fullName email')
            .sort({ createdAt: 1 })
            .lean();

        return res.status(200).json({
            success: true,
            count: pets.length,
            pets: pets.map((pet) => ({
                id: pet._id.toString(),
                owner: pet.ownerUserId
                    ? {
                        id: pet.ownerUserId._id.toString(),
                        fullName: pet.ownerUserId.fullName,
                        email: pet.ownerUserId.email
                    }
                    : null,
                name: pet.name,
                species: pet.species,
                breed: pet.breed,
                sex: pet.sex,
                dateOfBirth: pet.dateOfBirth || null,
                color: pet.color,
                registrationStatus: pet.registrationStatus,
                submittedAt: pet.createdAt
            }))
        });
    } catch (error) {
        return next(error);
    }
});

// 2. Approve a pending registration and assign an official Pet ID.
router.patch(
    '/pets/:petId/approve',
    [
        body('notes')
            .optional()
            .isString()
            .withMessage('Verification notes must be text.')
            .bail()
            .trim()
            .isLength({ max: 1000 })
            .withMessage('Verification notes cannot exceed 1000 characters.')
    ],
    async (req, res, next) => {
        const errors = validationResult(req);

        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: 'Please correct the submitted details.',
                errors: errors.array().map((error) => ({
                    field: error.path,
                    message: error.msg
                }))
            });
        }

        if (!mongoose.isValidObjectId(req.params.petId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid pet registration ID.'
            });
        }

        try {
            const pet = await Pet.findOne({
                _id: req.params.petId,
                registrationStatus: 'pending'
            });

            if (!pet) {
                return res.status(404).json({
                    success: false,
                    message: 'Pending pet registration not found. It may already have been reviewed.'
                });
            }

            // Generate a Pet ID and retry if a rare collision occurs.
            let assignedPetCode;
            let attempts = 0;

            do {
                assignedPetCode = generatePetCode();
                attempts += 1;
            } while (
                attempts < 5 &&
                await Pet.exists({ petCode: assignedPetCode })
            );

            if (await Pet.exists({ petCode: assignedPetCode })) {
                return res.status(500).json({
                    success: false,
                    message: 'Could not generate a unique Pet ID. Please try again.'
                });
            }

            pet.petCode = assignedPetCode;
            pet.registrationStatus = 'approved';
            pet.verifiedBy = req.user.id;
            pet.verifiedAt = new Date();

            if (req.body.notes !== undefined) {
                pet.verificationNotes = req.body.notes.trim();
            } else {
                pet.verificationNotes = '';
            }

            // QR identifier is created in a later step.
            await pet.save();

            return res.status(200).json({
                success: true,
                message: 'Pet registration approved successfully.',
                pet: {
                    id: pet._id.toString(),
                    petCode: pet.petCode,
                    name: pet.name,
                    species: pet.species,
                    registrationStatus: pet.registrationStatus,
                    verifiedAt: pet.verifiedAt
                }
            });
        } catch (error) {
            if (error.code === 11000) {
                return res.status(409).json({
                    success: false,
                    message: 'A duplicate Pet ID was detected. Please try the approval again.'
                });
            }

            return next(error);
        }
    }
);

// 3. Mark a pending registration as needing additional verification.
router.patch(
    '/pets/:petId/needs-verification',
    [
        body('reason')
            .isString()
            .withMessage('A verification reason is required.')
            .bail()
            .trim()
            .notEmpty()
            .withMessage('A verification reason is required.')
            .bail()
            .isLength({ max: 1000 })
            .withMessage('The reason cannot exceed 1000 characters.')
    ],
    async (req, res, next) => {
        const errors = validationResult(req);

        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: 'Please provide a valid verification reason.',
                errors: errors.array().map((error) => ({
                    field: error.path,
                    message: error.msg
                }))
            });
        }

        if (!mongoose.isValidObjectId(req.params.petId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid pet registration ID.'
            });
        }

        try {
            const pet = await Pet.findOneAndUpdate(
                {
                    _id: req.params.petId,
                    registrationStatus: 'pending'
                },
                {
                    $set: {
                        registrationStatus: 'needs_verification',
                        verificationNotes: req.body.reason.trim()
                    }
                },
                {
                    new: true,
                    runValidators: true
                }
            ).select('name species registrationStatus verificationNotes');

            if (!pet) {
                return res.status(404).json({
                    success: false,
                    message: 'Pending pet registration not found. It may already have been reviewed.'
                });
            }

            return res.status(200).json({
                success: true,
                message: 'Pet registration marked for additional verification.',
                pet: {
                    id: pet._id.toString(),
                    name: pet.name,
                    species: pet.species,
                    registrationStatus: pet.registrationStatus,
                    verificationNotes: pet.verificationNotes
                }
            });
        } catch (error) {
            return next(error);
        }
    }
);

module.exports = router;
