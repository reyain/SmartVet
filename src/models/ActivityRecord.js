
const mongoose = require('mongoose');

// Optional summary of the sensor readings used for classification.
const sensorSummarySchema = new mongoose.Schema(
    {
        // Average magnitude of the measured acceleration, in m/s².
        averageAccelerationMagnitude: {
            type: Number,
            min: [0, 'Acceleration magnitude cannot be negative.']
        },

        // Variation in the measured acceleration magnitude.
        accelerationVariance: {
            type: Number,
            min: [0, 'Acceleration variance cannot be negative.']
        },

        // Number of sensor samples used for the classification.
        sampleCount: {
            type: Number,
            min: [1, 'Sample count must be at least 1.'],
            validate: {
                validator: Number.isInteger,
                message: 'Sample count must be a whole number.'
            }
        }
    },
    {
        _id: false,
        versionKey: false
    }
);

const activityRecordSchema = new mongoose.Schema(
    {
        // Pet being monitored.
        petId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Pet',
            required: [true, 'Pet reference is required.'],
            index: true
        },

        // Smart collar that generated the reading.
        // The Device model will be created in a later step.
        deviceId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Device',
            required: [true, 'Collar device reference is required.'],
            index: true
        },

        // Activity estimated from movement sensor readings.
        activity: {
            type: String,
            enum: [
                'walking',
                'running',
                'resting',
                'inactive',
                'unknown'
            ],
            required: [true, 'Activity classification is required.'],
            default: 'unknown',
            lowercase: true
        },

        // Time associated with this activity record.
        measuredAt: {
            type: Date,
            required: [true, 'Measurement time is required.'],
            default: Date.now
        },

        // Optional length of the summarized activity interval.
        durationSeconds: {
            type: Number,
            min: [0, 'Duration cannot be negative.'],
            max: [86400, 'Duration cannot exceed 24 hours.'],
            validate: {
                validator: function (value) {
                    return value === undefined ||
                        Number.isInteger(value);
                },
                message: 'Duration must be a whole number of seconds.'
            }
        },

        // Optional summary used to evaluate the activity classification.
        sensorSummary: {
            type: sensorSummarySchema,
            default: undefined
        }
    },
    {
        timestamps: true,
        versionKey: false
    }
);

// Retrieve a pet's activity history, newest first.
activityRecordSchema.index({
    petId: 1,
    measuredAt: -1
});

// Retrieve records reported by a specific collar.
activityRecordSchema.index({
    deviceId: 1,
    measuredAt: -1
});

const ActivityRecord = mongoose.model(
    'ActivityRecord',
    activityRecordSchema
);

module.exports = ActivityRecord;
