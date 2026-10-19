
const mongoose = require('mongoose');

const feedingEventSchema = new mongoose.Schema(
    {
        // Pet associated with this feeding attempt.
        petId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Pet',
            required: [true, 'Pet reference is required.'],
            index: true
        },

        // Feeder that performed or attempted the operation.
        deviceId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Device',
            required: [true, 'Feeder device reference is required.'],
            index: true
        },

        // Feeding schedule that triggered the event, if applicable.
        scheduleId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FeedingSchedule',
            default: undefined
        },

        // Unique identifier for this event.
        // Repeated submissions must not create duplicate events.
        eventId: {
            type: String,
            required: [true, 'Event ID is required.'],
            trim: true,
            unique: true,
            immutable: true,
            maxlength: 150
        },

        // Whether this event was scheduled or manually triggered.
        source: {
            type: String,
            enum: ['scheduled', 'manual'],
            required: true,
            default: 'scheduled'
        },

        // Current outcome of the feeding attempt.
        status: {
            type: String,
            enum: ['running', 'completed', 'failed', 'cancelled'],
            required: true,
            default: 'running',
            index: true
        },

        // Intended quantity of food in grams.
        requestedGrams: {
            type: Number,
            required: [true, 'Requested food quantity is required.'],
            min: [1, 'Requested quantity must be at least 1 gram.'],
            max: [5000, 'Requested quantity cannot exceed 5000 grams.']
        },

        // Actual measured quantity dispensed, when available.
        dispensedGrams: {
            type: Number,
            default: undefined,
            min: [0, 'Dispensed quantity cannot be negative.'],
            max: [5000, 'Dispensed quantity cannot exceed 5000 grams.']
        },

        // Time the feeding attempt began.
        startedAt: {
            type: Date,
            required: [true, 'Start time is required.'],
            default: Date.now
        },

        // Time the feeding attempt ended, if it has ended.
        completedAt: {
            type: Date,
            default: undefined,
            validate: {
                validator: function (value) {
                    if (!value || !this.startedAt) {
                        return true;
                    }

                    return value >= this.startedAt;
                },
                message: 'Completion time cannot precede start time.'
            }
        },

        // Veterinary user who requested a manual feeding, if applicable.
        triggeredBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: undefined
        },

        // Explanation when dispensing fails or is cancelled.
        failureReason: {
            type: String,
            trim: true,
            maxlength: 1000,
            default: ''
        }
    },
    {
        timestamps: true,
        versionKey: false
    }
);

// Retrieve a pet's feeding history from newest to oldest.
feedingEventSchema.index({
    petId: 1,
    startedAt: -1
});

// Retrieve events reported by a particular feeder.
feedingEventSchema.index({
    deviceId: 1,
    startedAt: -1
});

// Find events for a particular schedule.
feedingEventSchema.index({
    scheduleId: 1,
    startedAt: -1
});

const FeedingEvent = mongoose.model(
    'FeedingEvent',
    feedingEventSchema
);

module.exports = FeedingEvent;
