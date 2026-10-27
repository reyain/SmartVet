const express = require('express');
const mongoose = require('mongoose');
const { body, validationResult } = require('express-validator');

const Pet = require('../models/Pet');
const User = require('../models/User');
const FeedingSchedule = require('../models/FeedingSchedule');
const FeedingEvent = require('../models/FeedingEvent');
const AuditLog = require('../models/AuditLog');

const Notification = require('../models/Notification');

const { requireDeviceAuth } =
    require('../middleware/deviceAuthMiddleware');

const router = express.Router();

// All endpoints in this file require a registered, active IoT device.
router.use(requireDeviceAuth);

// POST /api/iot/feeding-events
// Record a completed, failed, or cancelled feeding attempt.
router.post(
    '/feeding-events',
    [
        body('eventId')
            .isString()
            .withMessage('Event ID is required.')
            .bail()
            .trim()
            .isLength({ min: 3, max: 150 })
            .withMessage('Event ID must contain 3 to 150 characters.')
            .bail()
            .matches(/^[A-Za-z0-9_-]+$/)
            .withMessage(
                'Event ID may contain only letters, numbers, hyphens, and underscores.'
            ),

        body('source')
            .optional()
            .isIn(['scheduled', 'manual'])
            .withMessage('Source must be scheduled or manual.'),

        body('status')
            .isIn(['completed', 'failed', 'cancelled'])
            .withMessage(
                'Status must be completed, failed, or cancelled.'
            ),

        body('requestedGrams')
            .isFloat({ min: 1, max: 5000 })
            .withMessage(
                'Requested food quantity must be between 1 and 5000 grams.'
            )
            .bail()
            .toFloat(),

        body('dispensedGrams')
            .optional({ nullable: true })
            .isFloat({ min: 0, max: 5000 })
            .withMessage(
                'Dispensed quantity must be between 0 and 5000 grams.'
            )
            .bail()
            .toFloat(),

        body('scheduleId')
            .optional({ nullable: true })
            .custom((value) => mongoose.isValidObjectId(value))
            .withMessage('Schedule ID must be a valid database ID.'),

        body('triggeredBy')
            .optional()
            .isMongoId()
            .withMessage('Triggering user ID must be valid.'),

        body('startedAt')
            .optional()
            .isISO8601()
            .withMessage('Start time must be a valid ISO date.')
            .bail()
            .toDate(),

        body('completedAt')
            .optional()
            .isISO8601()
            .withMessage('Completion time must be a valid ISO date.')
            .bail()
            .toDate(),

        body('failureReason')
            .optional()
            .isString()
            .withMessage('Failure reason must be text.')
            .bail()
            .trim()
            .isLength({ max: 1000 })
            .withMessage('Failure reason cannot exceed 1000 characters.')
    ],
    async (req, res, next) => {
        const errors = validationResult(req);

        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: 'Please correct the submitted event information.',
                errors: errors.array().map((error) => ({
                    field: error.path,
                    message: error.msg
                }))
            });
        }

        try {
            const device = req.device;

            // Only feeders may submit feeding events.
            if (device.deviceType !== 'feeder') {
                return res.status(403).json({
                    success: false,
                    message: 'Only feeder devices can submit feeding events.'
                });
            }

            // The pet must come from the authenticated device assignment,
            // not from a pet ID supplied by the device request.
            if (!device.petId) {
                return res.status(409).json({
                    success: false,
                    message: 'Assign this feeder to a verified pet first.'
                });
            }

            const pet = await Pet.findOne({
                _id: device.petId,
                registrationStatus: 'approved'
            }).select('_id name petCode ownerUserId');

            if (!pet) {
                return res.status(409).json({
                    success: false,
                    message: 'The assigned pet is not currently verified.'
                });
            }

            const source = req.body.source || 'scheduled';
            const status = req.body.status;
            const requestedGrams = req.body.requestedGrams;

            // Successful feeding must include a measured dispensed quantity.
            if (
                status === 'completed' &&
                (
                    req.body.dispensedGrams === undefined ||
                    req.body.dispensedGrams === null
                )
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        'Dispensed grams are required for a completed feeding.'
                });
            }

            let schedule;

            if (source === 'scheduled' && !req.body.scheduleId) {
                return res.status(400).json({
                    success: false,
                    message:
                        'Schedule ID is required for a scheduled feeding.'
                });
            }

            if (req.body.scheduleId) {
                schedule = await FeedingSchedule.findOne({
                    _id: req.body.scheduleId,
                    petId: pet._id,
                    deviceId: device._id
                });

                if (!schedule) {
                    return res.status(400).json({
                        success: false,
                        message:
                            'The schedule does not belong to this feeder and pet.'
                    });
                }

                if (
                    source === 'scheduled' &&
                    Number(schedule.amountGrams) !== Number(requestedGrams)
                ) {
                    return res.status(400).json({
                        success: false,
                        message:
                            'Requested grams do not match the feeding schedule.'
                    });
                }
            }

            let triggeredBy;

            if (source === 'manual') {
                if (!req.body.triggeredBy) {
                    return res.status(400).json({
                        success: false,
                        message:
                            'A veterinary user ID is required for manual feeding.'
                    });
                }

                const veterinaryUser = await User.findOne({
                    _id: req.body.triggeredBy,
                    role: 'veterinary',
                    status: 'active'
                }).select('_id');

                if (!veterinaryUser) {
                    return res.status(400).json({
                        success: false,
                        message:
                            'The triggering account must be an active veterinary user.'
                    });
                }

                triggeredBy = veterinaryUser._id;
            }

            const startedAt = req.body.startedAt
                ? new Date(req.body.startedAt)
                : new Date();

            const completedAt = req.body.completedAt
                ? new Date(req.body.completedAt)
                : new Date();

            if (completedAt < startedAt) {
                return res.status(400).json({
                    success: false,
                    message: 'Completion time cannot precede start time.'
                });
            }

            const event = await FeedingEvent.create({
                petId: pet._id,
                deviceId: device._id,
                scheduleId: schedule ? schedule._id : undefined,
                eventId: req.body.eventId,
                source,
                status,
                requestedGrams,
                dispensedGrams: req.body.dispensedGrams,
                startedAt,
                completedAt,
                triggeredBy,
                failureReason: req.body.failureReason || ''
            });

            // Notify the pet owner when a feeding attempt fails or is cancelled.
            if (pet.ownerUserId && ['failed', 'cancelled'].includes(status)) {
                const notificationType =
                    status === 'failed' ? 'feeding_failed' : 'feeding_cancelled';

                const notificationTitle =
                    status === 'failed'
                        ? `Feeding failed: ${pet.name}`
                        : `Feeding cancelled: ${pet.name}`;

                const outcome =
                    status === 'failed' ? 'failed' : 'was cancelled';

                const reasonText = event.failureReason
                    ? ` Reason: ${event.failureReason}`
                    : '';

                const notificationMessage =
                    `The feeding attempt for ${pet.name} ${outcome}.${reasonText}`
                        .slice(0, 1000);

                // Use the saved event ID to prevent duplicate notifications.
                const dedupeKey = `feeding-event:${event._id.toString()}`;

                try {
                    await Notification.updateOne(
                        {
                            userId: pet.ownerUserId,
                            dedupeKey
                        },
                        {
                            $setOnInsert: {
                                userId: pet.ownerUserId,
                                petId: pet._id,
                                type: notificationType,
                                title: notificationTitle,
                                message: notificationMessage,
                                relatedRecordType: 'feeding_event',
                                relatedRecordId: event._id,
                                dedupeKey,
                                priority: status === 'failed' ? 'high' : 'normal'
                            }
                        },
                        { upsert: true }
                    );
                } catch (notificationError) {
                    // Do not turn a successfully recorded feeding event into a failed
                    // device request just because notification creation failed.
                    console.error(
                        'Unable to create feeding notification:',
                        notificationError.message
                    );
                }
            }

            await AuditLog.create({
                source: 'device',
                action: 'FEEDING_EVENT_RECORDED',
                entityType: 'feeding_event',
                entityId: event._id,
                summary:
                    `Feeder ${device.deviceCode} reported a ${status} feeding event for pet ${pet.name}.`
            });

            return res.status(201).json({
                success: true,
                message: 'Feeding event recorded successfully.',
                event: {
                    id: event._id.toString(),
                    eventId: event.eventId,
                    petId: event.petId.toString(),
                    deviceId: event.deviceId.toString(),
                    scheduleId: event.scheduleId
                        ? event.scheduleId.toString()
                        : null,
                    source: event.source,
                    status: event.status,
                    requestedGrams: event.requestedGrams,
                    dispensedGrams: event.dispensedGrams ?? null,
                    startedAt: event.startedAt,
                    completedAt: event.completedAt || null,
                    failureReason: event.failureReason,
                    createdAt: event.createdAt
                }
            });
        } catch (error) {
            if (error.code === 11000) {
                return res.status(409).json({
                    success: false,
                    message:
                        'This event ID has already been recorded.'
                });
            }

            if (error.name === 'ValidationError') {
                return res.status(400).json({
                    success: false,
                    message: 'The feeding event failed validation.'
                });
            }

            return next(error);
        }
    }
);

module.exports = router;