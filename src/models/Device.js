
const mongoose = require('mongoose');

const deviceSchema = new mongoose.Schema(
    {
        // Unique identifier assigned to the physical IoT device.
        deviceCode: {
            type: String,
            required: [true, 'Device code is required.'],
            trim: true,
            uppercase: true,
            unique: true,
            immutable: true,
            maxlength: 100
        },

        // Type of device registered in SmartVet.
        deviceType: {
            type: String,
            enum: ['feeder', 'collar'],
            required: [true, 'Device type is required.'],
            lowercase: true
        },

        // Pet currently assigned to this device.
        petId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Pet',
            default: undefined,
            index: true
        },

        // Administrative status of the device.
        status: {
            type: String,
            enum: ['active', 'disabled', 'revoked'],
            default: 'active',
            required: true,
            index: true
        },

        // Hash of the device authentication credential.
        // Never store a raw device token in this field.
        credentialHash: {
            type: String,
            required: [true, 'Device credential hash is required.'],
            select: false
        },

        // Last time the backend accepted a valid device message.
        lastSeenAt: {
            type: Date,
            default: null
        },

        // Last successful synchronization with the backend.
        lastSyncAt: {
            type: Date,
            default: null
        },

        // Version of the firmware running on the device.
        firmwareVersion: {
            type: String,
            trim: true,
            maxlength: 50,
            default: ''
        },

        // Optional information about device installation.
        description: {
            type: String,
            trim: true,
            maxlength: 500,
            default: ''
        },

        // User who registered the device in SmartVet.
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: [true, 'Registering user is required.']
        }
    },
    {
        timestamps: true,
        versionKey: false
    }
);

// Retrieve devices assigned to a particular pet.
deviceSchema.index({
    petId: 1,
    deviceType: 1
});

// Retrieve active devices by type.
deviceSchema.index({
    deviceType: 1,
    status: 1
});

const Device = mongoose.model('Device', deviceSchema);

module.exports = Device;
