
const mongoose = require('mongoose');

const feedingScheduleSchema = new mongoose.Schema(
    {
        // Pet associated with this feeding schedule.
        petId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Pet',
            required: [true, 'Pet reference is required.'],
            index: true
        },

        // Feeder assigned to this schedule.
        // The Device model will be created in a later step.
        deviceId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Device',
            default: undefined
        },

        // Time in 24-hour HH:mm format, for example 08:00.
        timeOfDay: {
            type: String,
            required: [true, 'Feeding time is required.'],
            trim: true,
            validate: {
                validator: function (value) {
                    return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
                },
                message: 'Feeding time must use HH:mm format.'
            }
        },

        // Days when feeding should occur:
        // 0 = Sunday, 1 = Monday, ..., 6 = Saturday.
        daysOfWeek: {
            type: [{
                type: Number,
                enum: [0, 1, 2, 3, 4, 5, 6]
            }],
            required: [true, 'At least one feeding day is required.'],
            validate: [
                {
                    validator: function (days) {
                        return Array.isArray(days) && days.length > 0;
                    },
                    message: 'Select at least one feeding day.'
                },
                {
                    validator: function (days) {
                        return Array.isArray(days) &&
                            new Set(days).size === days.length;
                    },
                    message: 'Feeding days cannot contain duplicates.'
                }
            ]
        },

        // Requested amount of food to dispense.
        amountGrams: {
            type: Number,
            required: [true, 'Food quantity is required.'],
            min: [1, 'Food quantity must be at least 1 gram.'],
            max: [5000, 'Food quantity cannot exceed 5000 grams.']
        },

        // Time zone used to interpret the scheduled feeding time.
        timezone: {
            type: String,
            required: true,
            trim: true,
            default: 'Asia/Manila',
            validate: {
                validator: function (value) {
                    if (!value) return false;

                    try {
                        new Intl.DateTimeFormat('en-US', {
                            timeZone: value
                        });

                        return true;
                    } catch {
                        return false;
                    }
                },
                message: 'A valid time zone is required.'
            }
        },

        // Whether the schedule is enabled.
        isActive: {
            type: Boolean,
            default: true,
            required: true
        },

        // Veterinary staff member who configured the schedule.
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: [true, 'Creating user is required.']
        }
    },
    {
        timestamps: true,
        versionKey: false
    }
);

// Find active schedules for a pet.
feedingScheduleSchema.index({
    petId: 1,
    isActive: 1
});

// Find active schedules assigned to a particular feeder.
feedingScheduleSchema.index({
    deviceId: 1,
    isActive: 1
});

const FeedingSchedule = mongoose.model(
    'FeedingSchedule',
    feedingScheduleSchema
);

module.exports = FeedingSchedule;
