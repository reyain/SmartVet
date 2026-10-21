const express = require('express');
const mongoose = require('mongoose');

const FeedingEvent = require('../models/FeedingEvent');

const {
    requireAuth,
    authorizeRoles
} = require('../middleware/authMiddleware');

const router = express.Router();

// Only authenticated veterinary staff can view feeding history.
router.use(requireAuth, authorizeRoles('veterinary'));

const allowedStatuses = [
    'running',
    'completed',
    'failed',
    'cancelled'
];

// GET /api/clinic/feeding-events
// Retrieve the latest feeding events, optionally filtered by pet,
// feeder device, or feeding status.
router.get('/', async (req, res, next) => {
    try {
        const filter = {};

        // Validate optional pet and device database IDs.
        for (const field of ['petId', 'deviceId']) {
            if (req.query[field] !== undefined) {
                if (
                    typeof req.query[field] !== 'string' ||
                    !mongoose.isValidObjectId(req.query[field])
                ) {
                    return res.status(400).json({
                        success: false,
                        message: `A valid ${field} is required.`
                    });
                }

                filter[field] = req.query[field];
            }
        }

        // Validate the optional status filter.
        if (req.query.status !== undefined) {
            if (
                typeof req.query.status !== 'string' ||
                !allowedStatuses.includes(req.query.status)
            ) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid feeding event status.'
                });
            }

            filter.status = req.query.status;
        }

        const records = await FeedingEvent.find(filter)
            .populate('petId', 'name petCode species')
            .populate('deviceId', 'deviceCode deviceType status')
            .populate(
                'scheduleId',
                'timeOfDay daysOfWeek amountGrams timezone isActive'
            )
            .populate('triggeredBy', 'fullName')
            .sort({ startedAt: -1 })
            .limit(200)
            .lean();

        const events = records.map((event) => ({
            id: event._id.toString(),
            eventId: event.eventId,

            pet: event.petId ? {
                id: event.petId._id.toString(),
                name: event.petId.name,
                petCode: event.petId.petCode,
                species: event.petId.species
            } : null,

            feeder: event.deviceId ? {
                id: event.deviceId._id.toString(),
                deviceCode: event.deviceId.deviceCode,
                deviceType: event.deviceId.deviceType,
                status: event.deviceId.status
            } : null,

            schedule: event.scheduleId
                ? {
                    id: event.scheduleId._id.toString(),
                    timeOfDay: event.scheduleId.timeOfDay,
                    daysOfWeek: event.scheduleId.daysOfWeek,
                    amountGrams: event.scheduleId.amountGrams,
                    timezone: event.scheduleId.timezone,
                    isActive: event.scheduleId.isActive
                }
                : null,

            source: event.source,
            status: event.status,
            requestedGrams: event.requestedGrams,
            dispensedGrams: event.dispensedGrams,
            startedAt: event.startedAt,
            completedAt: event.completedAt,

            triggeredBy: event.triggeredBy
                ? {
                    id: event.triggeredBy._id.toString(),
                    fullName: event.triggeredBy.fullName
                }
                : null,

            failureReason: event.failureReason,
            createdAt: event.createdAt,
            updatedAt: event.updatedAt
        }));

        return res.status(200).json({
            success: true,
            count: events.length,
            events
        });
    } catch (error) {
        return next(error);
    }
});

module.exports = router;