
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
