const crypto = require('crypto');
const Device = require('../models/Device');

// Authenticate a registered IoT device using its device token.
// The database stores only the SHA-256 hash, never the raw token.
async function requireDeviceAuth(req, res, next) {
    try {
        const deviceToken = req.get('X-Device-Token');

        if (
            typeof deviceToken !== 'string' ||
            !/^[a-fA-F0-9]{64}$/.test(deviceToken)
        ) {
            return res.status(401).json({
                success: false,
                message: 'Valid device credentials are required.'
            });
        }

        const credentialHash = crypto
            .createHash('sha256')
            .update(deviceToken, 'utf8')
            .digest('hex');

        const device = await Device.findOne({
            credentialHash
        }).select('+credentialHash');

        if (!device) {
            return res.status(401).json({
                success: false,
                message: 'Invalid device credentials.'
            });
        }

        if (device.status !== 'active') {
            return res.status(403).json({
                success: false,
                message: 'This device is not active.'
            });
        }

        // Record the last successful communication from this device.
        const now = new Date();
        device.lastSeenAt = now;
        device.lastSyncAt = now;

        await device.save();

        // Make the authenticated device available to the route handler.
        req.device = device;

        return next();
    } catch (error) {
        return next(error);
    }
}

module.exports = {
    requireDeviceAuth
};