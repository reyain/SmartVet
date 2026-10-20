
const express = require('express');
const mongoose = require('mongoose');
const { body, validationResult } = require('express-validator');

const FeedingSchedule = require('../models/FeedingSchedule');
const Device = require('../models/Device');
const Pet = require('../models/Pet');
const AuditLog = require('../models/AuditLog');

const {
    requireAuth,
    authorizeRoles
} = require('../middleware/authMiddleware');

const router = express.Router();

// Only authenticated veterinary personnel can configure schedules.
router.use(requireAuth, authorizeRoles('veterinary'));

function validateRequest(req, res) {
    const errors = validationResult(req);

    if (errors.isEmpty()) {
        return true;
    }

    res.status(400).json({
        success: false,
        message: 'Please correct the submitted information.',
        errors: errors.array().map((error) => ({
            field: error.path,
            message: error.msg
        }))
    });

    return false;
}

function serializeSchedule(schedule) {
    const pet = schedule.petId;
    const feeder = schedule.deviceId;
    const creator = schedule.createdBy;

    return {
        id: schedule._id.toString(),
        pet: pet && pet._id ? {
            id: pet._id.toString(),
            name: pet.name,
            petCode: pet.petCode,
            species: pet.species
        } : null,
        feeder: feeder && feeder._id ? {
            id: feeder._id.toString(),
            deviceCode: feeder.deviceCode,
            deviceType: feeder.deviceType,
            status: feeder.status
        } : null,
        timeOfDay: schedule.timeOfDay,
        daysOfWeek: schedule.daysOfWeek,
        amountGrams: schedule.amountGrams,
        timezone: schedule.timezone,
        isActive: schedule.isActive,
        createdBy: creator && creator._id ? {
            id: creator._id.toString(),
            fullName: creator.fullName
        } : null,
        createdAt: schedule.createdAt,
        updatedAt: schedule.updatedAt
    };
}

// GET /api/clinic/feeding-schedules
// List the latest feeding schedules.
router.get('/', async (req, res, next) => {
    try {
        const schedules = await FeedingSchedule.find({})
            .populate('petId', 'name petCode species')
            .populate('deviceId', 'deviceCode deviceType status')
            .populate('createdBy', 'fullName')
            .sort({ createdAt: -1 })
            .limit(200)
            .lean();

        return res.status(200).json({
            success: true,
            count: schedules.length,
            schedules: schedules.map(serializeSchedule)
        });
    } catch (error) {
        return next(error);
    }
});

// POST /api/clinic/feeding-schedules
// Create a schedule for a verified pet and its assigned active feeder.
router.post(
    '/',
    [
        body('petId')
            .isMongoId()
            .withMessage('A valid pet database ID is required.'),

        body('deviceId')
            .isMongoId()
            .withMessage('A valid feeder database ID is required.'),

        body('timeOfDay')
            .isString()
            .withMessage('Feeding time is required.')
            .bail()
            .trim()
            .matches(/^([01]\d|2[0-3]):[0-5]\d$/)
            .withMessage('Feeding time must use HH:mm format.'),

        body('daysOfWeek')
            .isArray({ min: 1 })
            .withMessage('Select at least one feeding day.')
            .bail()
            .custom((days) => {
                if (!days.every(
                    (day) => Number.isInteger(day) && day >= 0 && day <= 6
                )) {
                    throw new Error(
                        'Feeding days must be integers from 0 to 6.'
                    );
                }

                if (new Set(days).size !== days.length) {
                    throw new Error('Feeding days cannot contain duplicates.');
                }

                return true;
            }),

        body('amountGrams')
            .isFloat({ min: 1, max: 5000 })
            .withMessage('Food quantity must be between 1 and 5000 grams.')
            .bail()
            .toFloat(),

        body('timezone')
            .optional()
            .isString()
            .withMessage('Time zone must be text.')
            .bail()
            .trim()
            .notEmpty()
            .withMessage('Time zone cannot be empty.')
    ],
    async (req, res, next) => {
        if (!validateRequest(req, res)) {
            return;
        }

        try {
            const {
                petId,
                deviceId,
                timeOfDay,
                daysOfWeek,
                amountGrams,
                timezone
            } = req.body;

            // The pet must already be approved by veterinary personnel.
            const pet = await Pet.findOne({
                _id: petId,
                registrationStatus: 'approved'
            }).select('_id name petCode species');

            if (!pet) {
                return res.status(400).json({
                    success: false,
                    message: 'The pet does not exist or is not verified.'
                });
            }

            // The assigned feeder must be active and linked to this pet.
            const feeder = await Device.findOne({
                _id: deviceId,
                deviceType: 'feeder',
                status: 'active',
                petId: pet._id
            }).select('_id deviceCode deviceType status');

            if (!feeder) {
                return res.status(400).json({
                    success: false,
                    message:
                        'Select an active feeder assigned to the same verified pet.'
                });
            }

            const schedule = await FeedingSchedule.create({
                petId: pet._id,
                deviceId: feeder._id,
                timeOfDay,
                daysOfWeek,
                amountGrams,
                timezone: timezone || 'Asia/Manila',
                isActive: true,
                createdBy: req.user.id
            });

            await AuditLog.create({
                actorUserId: req.user.id,
                source: 'user',
                action: 'FEEDING_SCHEDULE_CREATED',
                entityType: 'feeding_schedule',
                entityId: schedule._id,
                summary:
                    `Created a feeding schedule for pet ${pet.name} using feeder ${feeder.deviceCode}.`
            });

            const result = await FeedingSchedule.findById(schedule._id)
                .populate('petId', 'name petCode species')
                .populate('deviceId', 'deviceCode deviceType status')
                .populate('createdBy', 'fullName')
                .lean();

            return res.status(201).json({
                success: true,
                message: 'Feeding schedule created successfully.',
                schedule: serializeSchedule(result)
            });
        } catch (error) {
            if (error instanceof mongoose.Error.ValidationError) {
                return res.status(400).json({
                    success: false,
                    message: 'The feeding schedule failed validation.'
                });
            }

            return next(error);
        }
    }
);

module.exports = router;
