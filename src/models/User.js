
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
    {
        fullName: {
            type: String,
            required: [true, 'Full name is required.'],
            trim: true,
            minlength: 2,
            maxlength: 120
        },

        email: {
            type: String,
            required: [true, 'Email address is required.'],
            unique: true,
            lowercase: true,
            trim: true,
            maxlength: 254
        },

        passwordHash: {
            type: String,
            required: [true, 'Password hash is required.'],
            select: false
        },

        role: {
            type: String,
            enum: ['admin', 'veterinary', 'owner'],
            default: 'owner',
            required: true
        },

                phone: {
            type: String,
            trim: true,
            maxlength: 30,
            default: ''
        },

        address: {
            type: String,
            trim: true,
            maxlength: 250,
            default: ''
        },

        profilePhotoFilename: {
            type: String,
            default: '',
            maxlength: 100
        },

        profilePhotoContentType: {
            type: String,
            enum: ['', 'image/jpeg', 'image/png', 'image/webp'],
            default: ''
        },

        profilePhotoOriginalName: {
            type: String,
            default: '',
            maxlength: 255
        },

        profilePhotoSize: {
            type: Number,
            default: 0,
            min: 0
        },

        status: {
            type: String,
            enum: ['active', 'disabled'],
            default: 'active',
            required: true
        },

        lastLoginAt: {
            type: Date,
            default: null
        }
    },
    {
        timestamps: true,
        versionKey: false,
        toJSON: {
            transform: (doc, ret) => {
                delete ret.passwordHash;
                return ret;
            }
        }
    }
);

const User = mongoose.model('User', userSchema);

module.exports = User;
