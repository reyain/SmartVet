
const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
    {
        // User who should receive this notification.
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: [true, 'Notification recipient is required.'],
            index: true
        },

        // Related pet, when the notification concerns a particular pet.
        petId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Pet',
            default: undefined
        },

        // Notification category.
        type: {
            type: String,
            enum: [
                'vaccination_due',
                'vaccination_overdue',
                'feeding_completed',
                'feeding_failed',
                'registration_approved',
                'registration_needs_verification',
                'device_offline',
                'activity_update',
                'general'
            ],
            required: [true, 'Notification type is required.']
        },

        // Short notification heading.
        title: {
            type: String,
            required: [true, 'Notification title is required.'],
            trim: true,
            minlength: 1,
            maxlength: 150
        },

        // Main notification message.
        message: {
            type: String,
            required: [true, 'Notification message is required.'],
            trim: true,
            minlength: 1,
            maxlength: 1000
        },

        // Optional reference to the record related to this notification.
        relatedRecordType: {
            type: String,
            enum: [
                'pet',
                'vaccination_record',
                'feeding_event',
                'device'
            ],
            default: undefined
        },

        relatedRecordId: {
            type: mongoose.Schema.Types.ObjectId,
            default: undefined
        },

        // Optional key used to prevent duplicate notifications
        // for the same user and event.
        dedupeKey: {
            type: String,
            trim: true,
            maxlength: 200,
            default: undefined
        },

        // Priority displayed by the application.
        priority: {
            type: String,
            enum: ['normal', 'high'],
            default: 'normal',
            required: true
        },

        // Null means the notification has not been read.
        readAt: {
            type: Date,
            default: null
        }
    },
    {
        timestamps: true,
        versionKey: false
    }
);

// Retrieve a user's notifications, newest first.
notificationSchema.index({
    userId: 1,
    createdAt: -1
});

// Quickly retrieve unread notifications.
notificationSchema.index({
    userId: 1,
    readAt: 1,
    createdAt: -1
});

// Prevent duplicate notifications for the same user and event
// when a dedupeKey is provided.
notificationSchema.index(
    {
        userId: 1,
        dedupeKey: 1
    },
    {
        unique: true,
        partialFilterExpression: {
            dedupeKey: { $type: 'string' }
        }
    }
);

const Notification = mongoose.model(
    'Notification',
    notificationSchema
);

module.exports = Notification;
