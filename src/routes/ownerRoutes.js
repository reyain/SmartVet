const express = require('express');
const mongoose = require('mongoose');
const QRCode = require('qrcode');
const { body, validationResult } = require('express-validator');

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');


const Pet = require('../models/Pet');
const VaccinationRecord = require('../models/VaccinationRecord');
const Notification = require('../models/Notification');

const {
    requireAuth,
    authorizeRoles
} = require('../middleware/authMiddleware');

const router = express.Router();

// Store pet photos outside the public frontend directory.
const petPhotoDirectory = path.join(__dirname, '../../uploads/pet-photos');

fs.mkdirSync(petPhotoDirectory, { recursive: true });

const allowedPetPhotoTypes = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp'
};

const petPhotoStorage = multer.diskStorage({
    destination: (_req, _file, callback) => {
        callback(null, petPhotoDirectory);
    },
    filename: (_req, file, callback) => {
        const extension = allowedPetPhotoTypes[file.mimetype];

        callback(
            null,
            `${crypto.randomBytes(16).toString('hex')}${extension}`
        );
    }
});

const petPhotoUpload = multer({
    storage: petPhotoStorage,
    limits: {
        fileSize: 5 * 1024 * 1024,
        files: 1
    },
    fileFilter: (_req, file, callback) => {
        if (!Object.prototype.hasOwnProperty.call(
            allowedPetPhotoTypes,
            file.mimetype
        )) {
            const error = new Error(
                'Pet photo must be a JPG, PNG, or WebP image.'
            );

            error.code = 'INVALID_PET_PHOTO_TYPE';
            return callback(error);
        }

        callback(null, true);
    }
});

function handlePetPhotoUpload(req, res, next) {
    petPhotoUpload.single('petPhoto')(req, res, (error) => {
        if (!error) {
            return next();
        }

        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                success: false,
                message: 'Pet photo must not exceed 5 MB.'
            });
        }

        if (
            error.code === 'LIMIT_UNEXPECTED_FILE' ||
            error.code === 'INVALID_PET_PHOTO_TYPE'
        ) {
            return res.status(400).json({
                success: false,
                message: error.code === 'INVALID_PET_PHOTO_TYPE'
                    ? error.message
                    : 'Only one pet photo may be uploaded.'
            });
        }

        return next(error);
    });
}

// All endpoints in this router require an authenticated pet owner.
router.use(requireAuth, authorizeRoles('owner'));

// Allow an owner to view a photo belonging to their own pet.
router.get('/pets/:petId/photo', async (req, res, next) => {
    try {
        if (!mongoose.isValidObjectId(req.params.petId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid pet ID.'
            });
        }

        const pet = await Pet.findOne({
            _id: req.params.petId,
            ownerUserId: req.user.id
        })
            .select('photoFilename photoContentType')
            .lean();

        if (!pet) {
            return res.status(404).json({
                success: false,
                message: 'Pet not found.'
            });
        }

        if (!pet.photoFilename || !pet.photoContentType) {
            return res.status(404).json({
                success: false,
                message: 'No pet photo is available.'
            });
        }

        const filename = path.basename(pet.photoFilename);

        if (
            filename !== pet.photoFilename ||
            !/^[a-f0-9]{32}\.(jpg|png|webp)$/i.test(filename)
        ) {
            return res.status(404).json({
                success: false,
                message: 'Pet photo is unavailable.'
            });
        }

        const photoPath = path.join(
            __dirname,
            '../../uploads/pet-photos',
            filename
        );

        res.set('Content-Type', pet.photoContentType);
        res.set('Cache-Control', 'private, no-store');
        res.set('X-Content-Type-Options', 'nosniff');

        return res.sendFile(photoPath, (error) => {
            if (error && !res.headersSent) {
                return next(error);
            }
        });
    } catch (error) {
        return next(error);
    }
});

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
    handlePetPhotoUpload,
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
                if (req.file) {
                    fs.unlink(req.file.path, () => {});
                }
                
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

            if (req.file) {
                petData.photoFilename = req.file.filename;
                petData.photoContentType = req.file.mimetype;
                petData.photoOriginalName = path.basename(req.file.originalname)
                    .replace(/[\\/:*?"<>|]/g, '_')
                    .slice(0, 255);
                petData.photoSize = req.file.size;
            }

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
            if (req.file) {
                fs.unlink(req.file.path, () => {});
            }

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
                'petCode name species breed sex dateOfBirth color photoFilename photoContentType registrationStatus createdAt'
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
                hasPhoto: Boolean(pet.photoFilename && pet.photoContentType),
                registrationStatus: pet.registrationStatus,

                // Show the official Pet ID only after approval.
                ...(pet.registrationStatus === 'approved' && pet.petCode
                    ? { petCode: pet.petCode }
                    : {}),

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


/**
 * GET /api/owner/pets/:petId/vaccinations
 * View vaccination history for an approved pet owned by the logged-in owner.
 */
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
                message: 'Approved pet not found in your account.'
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
                name: pet.name,
                species: pet.species,
                breed: pet.breed,
                sex: pet.sex,
                dateOfBirth: pet.dateOfBirth || null,
                color: pet.color,
                registrationStatus: pet.registrationStatus,
                verifiedAt: pet.verifiedAt || null
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



/**
 * GET /api/owner/notifications
 * Retrieve notifications belonging only to the logged-in owner.
 */
router.get('/notifications', async (req, res, next) => {
    try {
        const [notifications, unreadCount] = await Promise.all([
            Notification.find({
                userId: req.user.id
            })
                .select(
                    'type title message petId relatedRecordType relatedRecordId priority readAt createdAt'
                )
                .populate('petId', 'name petCode')
                .sort({ createdAt: -1 })
                .limit(50)
                .lean(),

            Notification.countDocuments({
                userId: req.user.id,
                readAt: null
            })
        ]);

        return res.status(200).json({
            success: true,
            unreadCount,
            count: notifications.length,
            notifications: notifications.map((notification) => ({
                id: notification._id.toString(),
                type: notification.type,
                title: notification.title,
                message: notification.message,
                priority: notification.priority,
                read: Boolean(notification.readAt),
                readAt: notification.readAt || null,
                createdAt: notification.createdAt,
                pet: notification.petId
                    ? {
                        name: notification.petId.name,
                        petCode: notification.petId.petCode
                    }
                    : null,
                relatedRecordType:
                    notification.relatedRecordType || null,
                relatedRecordId:
                    notification.relatedRecordId
                        ? notification.relatedRecordId.toString()
                        : null
            }))
        });
    } catch (error) {
        return next(error);
    }
});

/**
 * PATCH /api/owner/notifications/:notificationId/read
 * Mark one notification belonging to the logged-in owner as read.
 */
router.patch(
    '/notifications/:notificationId/read',
    async (req, res, next) => {
        const { notificationId } = req.params;

        if (!mongoose.isValidObjectId(notificationId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid notification ID.'
            });
        }

        try {
            const notification = await Notification.findOne({
                _id: notificationId,
                userId: req.user.id
            });

            if (!notification) {
                return res.status(404).json({
                    success: false,
                    message: 'Notification not found.'
                });
            }

            if (!notification.readAt) {
                notification.readAt = new Date();
                await notification.save();
            }

            return res.status(200).json({
                success: true,
                message: 'Notification marked as read.',
                notification: {
                    id: notification._id.toString(),
                    read: true,
                    readAt: notification.readAt
                }
            });
        } catch (error) {
            return next(error);
        }
    }
);



module.exports = router;
