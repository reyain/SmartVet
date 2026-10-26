
const express = require('express');
const mongoose = require('mongoose');
const crypto = require('crypto');
const { body, validationResult } = require('express-validator');
const QRCode = require('qrcode');

const Pet = require('../models/Pet');
const VaccinationRecord = require('../models/VaccinationRecord');

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

            // Create a unique, unpredictable QR identifier.
            const qrIdentifier = crypto.randomBytes(32).toString('hex');

            pet.petCode = assignedPetCode;
            pet.qrIdentifier = qrIdentifier;
            pet.registrationStatus = 'approved';
            pet.verifiedBy = req.user.id;
            pet.verifiedAt = new Date();

            if (req.body.notes !== undefined) {
                pet.verificationNotes = req.body.notes.trim();
            } else {
                pet.verificationNotes = '';
            }

            // Save the approved registration and its QR identifier.
            await pet.save();

            // Generate a QR image containing only the random identifier.
            const qrImage = await QRCode.toDataURL(qrIdentifier, {
                errorCorrectionLevel: 'M',
                type: 'image/png',
                margin: 2,
                width: 300
            });

            return res.status(200).json({
                success: true,
                message: 'Pet registration approved successfully.',
                pet: {
                    id: pet._id.toString(),
                    petCode: pet.petCode,
                    name: pet.name,
                    species: pet.species,
                    registrationStatus: pet.registrationStatus,
                    verifiedAt: pet.verifiedAt,
                    qrCodeImage: qrImage
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


/**
 * GET /api/clinic/pets/qr/:identifier
 * Retrieve an approved pet using its QR identifier.
 * Access is restricted to authenticated veterinary personnel
 * by the router-level middleware above.
 */

// 4. List approved pets for vaccination recording.
router.get('/pets/approved', async (req, res, next) => {
    try {
        const pets = await Pet.find({
            registrationStatus: 'approved'
        })
            .select(
                'petCode name species breed sex ownerUserId verifiedAt'
            )
            .populate('ownerUserId', 'fullName email')
            .sort({ name: 1 })
            .lean();

        return res.status(200).json({
            success: true,
            count: pets.length,
            pets: pets.map((pet) => ({
                id: pet._id.toString(),
                petCode: pet.petCode,
                name: pet.name,
                species: pet.species,
                breed: pet.breed,
                sex: pet.sex,
                owner: pet.ownerUserId
                    ? {
                        id: pet.ownerUserId._id.toString(),
                        fullName: pet.ownerUserId.fullName,
                        email: pet.ownerUserId.email
                    }
                    : null,
                verifiedAt: pet.verifiedAt || null
            }))
        });
    } catch (error) {
        return next(error);
    }
});


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


// 5. Record a vaccination for an approved pet.
router.post(
    '/pets/:petId/vaccinations',
    [
        body('vaccineName')
            .isString()
            .withMessage('Vaccine name is required.')
            .bail()
            .trim()
            .notEmpty()
            .withMessage('Vaccine name is required.')
            .bail()
            .isLength({ min: 2, max: 150 })
            .withMessage('Vaccine name must be 2 to 150 characters.'),

        body('administeredDate')
            .isISO8601({ strict: true })
            .withMessage('Administration date must use YYYY-MM-DD format.')
            .bail()
            .custom((value) => {
                const date = new Date(`${value}T00:00:00.000Z`);
                const today = new Date();
                today.setUTCHours(0, 0, 0, 0);

                return date <= today;
            })
            .withMessage('Administration date cannot be in the future.'),

        body('nextDueDate')
            .optional({ values: 'falsy' })
            .isISO8601({ strict: true })
            .withMessage('Next due date must use YYYY-MM-DD format.')
            .bail()
            .custom((value, { req }) => {
                return value >= req.body.administeredDate;
            })
            .withMessage(
                'Next due date cannot be earlier than the administration date.'
            ),

        body('batchNumber')
            .optional()
            .isString()
            .withMessage('Batch number must be text.')
            .bail()
            .trim()
            .isLength({ max: 100 })
            .withMessage('Batch number cannot exceed 100 characters.'),

        body('manufacturer')
            .optional()
            .isString()
            .withMessage('Manufacturer must be text.')
            .bail()
            .trim()
            .isLength({ max: 150 })
            .withMessage('Manufacturer cannot exceed 150 characters.'),

        body('dosage')
            .optional()
            .isString()
            .withMessage('Dosage must be text.')
            .bail()
            .trim()
            .isLength({ max: 100 })
            .withMessage('Dosage cannot exceed 100 characters.'),

        body('notes')
            .optional()
            .isString()
            .withMessage('Notes must be text.')
            .bail()
            .trim()
            .isLength({ max: 2000 })
            .withMessage('Notes cannot exceed 2000 characters.')
    ],
    async (req, res, next) => {
        const errors = validationResult(req);

        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: 'Please correct the vaccination details.',
                errors: errors.array().map((error) => ({
                    field: error.path,
                    message: error.msg
                }))
            });
        }

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
                registrationStatus: 'approved'
            }).select('_id name petCode');

            if (!pet) {
                return res.status(404).json({
                    success: false,
                    message: 'Approved pet not found.'
                });
            }

            const vaccinationData = {
                petId: pet._id,
                vaccineName: req.body.vaccineName.trim(),
                administeredDate: new Date(
                    `${req.body.administeredDate}T00:00:00.000Z`
                ),
                administeredBy: req.user.id,
                batchNumber: req.body.batchNumber?.trim() || '',
                manufacturer: req.body.manufacturer?.trim() || '',
                dosage: req.body.dosage?.trim() || '',
                notes: req.body.notes?.trim() || ''
            };

            if (req.body.nextDueDate) {
                vaccinationData.nextDueDate = new Date(
                    `${req.body.nextDueDate}T00:00:00.000Z`
                );
            }

            const record = await VaccinationRecord.create(vaccinationData);

            return res.status(201).json({
                success: true,
                message: 'Vaccination record saved successfully.',
                vaccination: {
                    id: record._id.toString(),
                    petId: record.petId.toString(),
                    vaccineName: record.vaccineName,
                    administeredDate: record.administeredDate,
                    nextDueDate: record.nextDueDate || null,
                    batchNumber: record.batchNumber,
                    manufacturer: record.manufacturer,
                    dosage: record.dosage,
                    notes: record.notes,
                    administeredBy: req.user.id,
                    createdAt: record.createdAt
                }
            });
        } catch (error) {
            if (error.name === 'ValidationError') {
                return res.status(400).json({
                    success: false,
                    message: 'The vaccination record failed validation.'
                });
            }

            return next(error);
        }
    }
);

// 6. View the vaccination history of an approved pet.
router.get('/pets/:petId/vaccinations', async (req, res, next) => {
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
            registrationStatus: 'approved'
        }).select('_id name petCode');

        if (!pet) {
            return res.status(404).json({
                success: false,
                message: 'Approved pet not found.'
            });
        }

        const records = await VaccinationRecord.find({
            petId: pet._id
        })
            .populate('administeredBy', 'fullName')
            .sort({ administeredDate: -1, createdAt: -1 })
            .lean();

        return res.status(200).json({
            success: true,
            pet: {
                id: pet._id.toString(),
                petCode: pet.petCode,
                name: pet.name
            },
            count: records.length,
            vaccinations: records.map((record) => ({
                id: record._id.toString(),
                vaccineName: record.vaccineName,
                administeredDate: record.administeredDate,
                nextDueDate: record.nextDueDate || null,
                batchNumber: record.batchNumber,
                manufacturer: record.manufacturer,
                dosage: record.dosage,
                notes: record.notes,
                administeredBy: record.administeredBy
                    ? record.administeredBy.fullName
                    : 'Unknown',
                createdAt: record.createdAt
            }))
        });
    } catch (error) {
        return next(error);
    }
});

module.exports = router;
