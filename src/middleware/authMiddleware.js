
const User = require('../models/User');

const {
    verifyAccessToken
} = require('../services/authService');

// Require a valid token and an active user account.
async function requireAuth(req, res, next) {
    const authorization = req.get('authorization') || '';
    const match = authorization.match(/^Bearer\s+(\S+)$/i);

    if (!match) {
        return res.status(401).json({
            success: false,
            message: 'Authentication is required.'
        });
    }

    let tokenData;

    // Verify signature, expiry, issuer, and audience.
    try {
        tokenData = verifyAccessToken(match[1]);
    } catch (error) {
        return res.status(401).json({
            success: false,
            message: 'Invalid or expired authentication token.'
        });
    }

    try {
        // Retrieve current account information from MongoDB.
        // Do not trust a role supplied by the browser or token.
        const user = await User.findById(tokenData.userId)
            .select('_id fullName email role status');

        if (!user || user.status !== 'active') {
            return res.status(401).json({
                success: false,
                message: 'Authentication is required.'
            });
        }

        // Make trusted user information available to later middleware
        // and route handlers.
        req.user = {
            id: user._id.toString(),
            fullName: user.fullName,
            email: user.email,
            role: user.role,
            status: user.status
        };

        req.auth = {
            expiresAt: tokenData.expiresAt
        };

        return next();
    } catch (error) {
        // Pass unexpected database or server errors to Express.
        return next(error);
    }
}

// Restrict a route to one or more user roles.
// Example: authorizeRoles('admin', 'veterinary')
function authorizeRoles(...allowedRoles) {
    return function (req, res, next) {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: 'Authentication is required.'
            });
        }

        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: 'You do not have permission to access this resource.'
            });
        }

        return next();
    };
}

module.exports = {
    requireAuth,
    authorizeRoles
};
