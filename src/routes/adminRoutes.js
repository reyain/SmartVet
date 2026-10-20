
const express = require('express');

const {
    requireAuth,
    authorizeRoles
} = require('../middleware/authMiddleware');

const router = express.Router();

// Only authenticated administrators can access this API area.
router.get(
    '/',
    requireAuth,
    authorizeRoles('admin'),
    (req, res) => {
        res.status(200).json({
            success: true,
            area: 'admin',
            message: 'Administrator access verified.',
            user: {
                id: req.user.id,
                fullName: req.user.fullName,
                role: req.user.role
            }
        });
    }
);

module.exports = router;
