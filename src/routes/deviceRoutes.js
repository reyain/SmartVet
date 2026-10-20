
const express = require('express');
const mongoose = require('mongoose');
const crypto = require('crypto');
const { body, param, validationResult } = require('express-validator');

const Device = require('../models/Device');
const Pet = require('../models/Pet');
const AuditLog = require('../models/AuditLog');

const {
    requireAuth,
    authorizeRoles
} = require('../middleware/authMiddleware');

const router = express.Router();

// Every device-management endpoint requires an authenticated
// veterinary user.
router.use(requireAuth, authorizeRoles('veterinary'));

function validateRequest(req, res) {
    const errors = validationResult(req);

    if (errors.isEmpty()) {
        return true;
    }

    res.status(400).json({
        success: false,
        message: 'Please correct the submitted information.',
        errors: errors.array().map((error) => ({
            field: error.path,
            message: error.msg
        }))
    });

    return false;
}

// Record important device-management actions.
async function writeDeviceAudit(req, action, device, summary) {
    await AuditLog.create({
        actorUserId: req.user.id,
        source: 'user',
        action,
        entityType: 'device',
        entityId: device._id,
        summary,
        requestId: req.id || ''
    });
}

// Return safe device information without exposing its credential hash.
function serializeDevice(device) {
    let pet = null;

    if (device.petId) {
        const petValue = device.petId;
        const petObjectId = petValue._id || petValue;

        pet = {
            id: petObjectId.toString(),
            name: petValue.name || null,
            petCode: petValue.petCode || null,
            species: petValue.species || null
        };
    }

    let registeredBy = null;

    if (device.createdBy) {
        const userValue = device.createdBy;
        const userObjectId = userValue._id || userValue;

        registeredBy = {
            id: userObjectId.toString(),
            fullName: userValue.fullName || null
        };
    }

    return {
        id: device._id.toString(),
        deviceCode: device.deviceCode,
        deviceType: device.deviceType,
        pet,
        status: device.status,
        lastSeenAt: device.lastSeenAt || null,
        lastSyncAt: device.lastSyncAt || null,
        firmwareVersion: device.firmwareVersion || '',
        description: device.description || '',
        registeredBy,
        createdAt: device.createdAt,
        updatedAt: device.updatedAt
    };
}

// POST /api/clinic/devices
// Register a feeder or collar and return its device token once.
router.post(
    '/',
    [
        body('deviceCode')
            .isString()
            .withMessage('Device code must be text.')
            .bail()
            .trim()
            .isLength({ min: 3, max: 100 })
            .withMessage('Device code must contain 3 to 100 characters.')
            .bail()
            .matches(/^[A-Za-z0-9_-]+$/)
            .withMessage(
                'Device code may contain only letters, numbers, hyphens, and underscores.'
            ),

        body('deviceType')
            .isString()
            .withMessage('Device type is required.')
            .bail()
            .trim()
            .toLowerCase()
            .isIn(['feeder', 'collar'])
            .withMessage('Device type must be feeder or collar.'),

        body('petId')
            .optional({ nullable: true })
            .custom((value) => mongoose.isValidObjectId(value))
            .withMessage('Pet ID must be a valid database ID.'),

        body('firmwareVersion')
            .optional()
            .isString()
            .withMessage('Firmware version must be text.')
            .bail()
            .trim()
            .isLength({ max: 50 })
            .withMessage('Firmware version cannot exceed 50 characters.'),

        body('description')
            .optional()
            .isString()
            .withMessage('Description must be text.')
            .bail()
            .trim()
            .isLength({ max: 500 })
            .withMessage('Description cannot exceed 500 characters.')
    ],
    async (req, res, next) => {
        if (!validateRequest(req, res)) {
            return;
        }

        try {
            const {
                deviceCode,
                deviceType,
                petId,
                firmwareVersion,
                description
            } = req.body;

            // A device can only be associated with a verified pet.
            if (petId) {
                const pet = await Pet.findOne({
                    _id: petId,
                    registrationStatus: 'approved'
                }).select('_id');

                if (!pet) {
                    return res.status(400).json({
                        success: false,
                        message: 'The pet does not exist or is not verified.'
                    });
                }
            }

            // Generate a high-entropy credential for future device
            // authentication. Only its hash will be stored in MongoDB.
            const deviceToken = crypto.randomBytes(32).toString('hex');

            const credentialHash = crypto
                .createHash('sha256')
                .update(deviceToken, 'utf8')
                .digest('hex');

            const device = await Device.create({
                deviceCode,
                deviceType,
                petId: petId || undefined,
                credentialHash,
                firmwareVersion: firmwareVersion || '',
                description: description || '',
                createdBy: req.user.id
            });

            await writeDeviceAudit(
                req,
                'DEVICE_REGISTERED',
                device,
                `Registered ${device.deviceType} device ${device.deviceCode}.`
            );

            return res.status(201).json({
                success: true,
                message:
                    'Device registered. Store its device token securely; it will not be returned in the device list.',
                device: serializeDevice(device),
                deviceToken
            });
        } catch (error) {
            if (error.code === 11000) {
                return res.status(409).json({
                    success: false,
                    message: 'That device code is already registered.'
                });
            }

            return next(error);
        }
    }
);

// GET /api/clinic/devices
// List registered devices without returning authentication credentials.
router.get('/', async (req, res, next) => {
    try {
        const devices = await Device.find({})
            .populate('petId', 'name petCode species')
            .populate('createdBy', 'fullName')
            .sort({ createdAt: -1 })
            .limit(200)
            .lean();

        return res.status(200).json({
            success: true,
            count: devices.length,
            devices: devices.map(serializeDevice)
        });
    } catch (error) {
        return next(error);
    }
});

// PATCH /api/clinic/devices/:deviceId/assignment
// Assign a device to a verified pet, or unassign it with petId: null.
router.patch(
    '/:deviceId/assignment',
    [
        param('deviceId')
            .isMongoId()
            .withMessage('Invalid device ID.'),

        body('petId')
            .exists({ values: 'undefined' })
            .withMessage('Provide petId. Use null to unassign the device.')
            .bail()
            .custom((value) => {
                return value === null ||
                    mongoose.isValidObjectId(value);
            })
            .withMessage('Pet ID must be valid or null.')
    ],
    async (req, res, next) => {
        if (!validateRequest(req, res)) {
            return;
        }

        try {
            const device = await Device.findById(req.params.deviceId);

            if (!device) {
                return res.status(404).json({
                    success: false,
                    message: 'Device not found.'
                });
            }

            if (device.status !== 'active') {
                return res.status(409).json({
                    success: false,
                    message: 'Only active devices can be assigned.'
                });
            }

            const { petId } = req.body;

            if (petId !== null) {
                const pet = await Pet.findOne({
                    _id: petId,
                    registrationStatus: 'approved'
                }).select('_id');

                if (!pet) {
                    return res.status(400).json({
                        success: false,
                        message: 'The pet does not exist or is not verified.'
                    });
                }

                device.petId = pet._id;
            } else {
                device.petId = undefined;
            }

            await device.save();

            await writeDeviceAudit(
                req,
                'DEVICE_ASSIGNMENT_UPDATED',
                device,
                petId === null
                    ? `Unassigned device ${device.deviceCode}.`
                    : `Updated the pet assignment for device ${device.deviceCode}.`
            );

            const updatedDevice = await Device.findById(device._id)
                .populate('petId', 'name petCode species')
                .populate('createdBy', 'fullName')
                .lean();

            return res.status(200).json({
                success: true,
                message: 'Device assignment updated.',
                device: serializeDevice(updatedDevice)
            });
        } catch (error) {
            return next(error);
        }
    }
);

// PATCH /api/clinic/devices/:deviceId/status
// Disable a device or permanently revoke it.
router.patch(
    '/:deviceId/status',
    [
        param('deviceId')
            .isMongoId()
            .withMessage('Invalid device ID.'),

        body('status')
            .isString()
            .withMessage('Device status is required.')
            .bail()
            .trim()
            .toLowerCase()
            .isIn(['active', 'disabled', 'revoked'])
            .withMessage(
                'Status must be active, disabled, or revoked.'
            )
    ],
    async (req, res, next) => {
        if (!validateRequest(req, res)) {
            return;
        }

        try {
            const device = await Device.findById(req.params.deviceId);

            if (!device) {
                return res.status(404).json({
                    success: false,
                    message: 'Device not found.'
                });
            }

            const previousStatus = device.status;
            const newStatus = req.body.status;

            // Revocation is treated as a terminal state.
            if (
                previousStatus === 'revoked' &&
                newStatus !== 'revoked'
            ) {
                return res.status(409).json({
                    success: false,
                    message:
                        'A revoked device cannot be reactivated. Register a replacement device.'
                });
            }

            device.status = newStatus;
            await device.save();

            await writeDeviceAudit(
                req,
                'DEVICE_STATUS_UPDATED',
                device,
                `Changed device ${device.deviceCode} status from ${previousStatus} to ${newStatus}.`
            );

            return res.status(200).json({
                success: true,
                message: 'Device status updated.',
                device: serializeDevice(device)
            });
        } catch (error) {
            return next(error);
        }
    }
);

module.exports = router;
