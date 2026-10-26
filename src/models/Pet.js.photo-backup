
const mongoose = require('mongoose');

const petSchema = new mongoose.Schema(
    {
        // Account of the pet's owner.
        ownerUserId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: [true, 'Pet owner is required.'],
            index: true
        },

        // Official Pet ID, assigned after approval.
        petCode: {
            type: String,
            trim: true,
            uppercase: true,
            unique: true,
            sparse: true,
            default: undefined
        },

        name: {
            type: String,
            required: [true, 'Pet name is required.'],
            trim: true,
            minlength: 1,
            maxlength: 100
        },

        species: {
            type: String,
            required: [true, 'Pet species is required.'],
            enum: ['dog', 'cat', 'rabbit', 'bird', 'other'],
            lowercase: true
        },

        breed: {
            type: String,
            trim: true,
            maxlength: 100,
            default: ''
        },

        sex: {
            type: String,
            enum: ['male', 'female', 'unknown'],
            default: 'unknown',
            lowercase: true
        },

        dateOfBirth: {
            type: Date,
            default: undefined,
            validate: {
                validator: function (value) {
                    return !value || value <= new Date();
                },
                message: 'Date of birth cannot be in the future.'
            }
        },

        color: {
            type: String,
            trim: true,
            maxlength: 100,
            default: ''
        },

        // Owner submissions begin as pending.
        registrationStatus: {
            type: String,
            enum: ['pending', 'approved', 'needs_verification'],
            default: 'pending',
            required: true,
            index: true
        },

        // Random identifier used to generate the QR code.
        // This is not the pet's complete record.
        qrIdentifier: {
            type: String,
            trim: true,
            unique: true,
            sparse: true,
            default: undefined,
            select: false
        },

        // Veterinary staff member who verified the pet.
        verifiedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: undefined
        },

        verifiedAt: {
            type: Date,
            default: undefined
        },

        verificationNotes: {
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

// Help retrieve a particular owner's pets efficiently.
petSchema.index({ ownerUserId: 1, createdAt: -1 });

// Help clinic staff find pets by registration status.
petSchema.index({ registrationStatus: 1, createdAt: -1 });

const Pet = mongoose.model('Pet', petSchema);

module.exports = Pet;
