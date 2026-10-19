
const express = require('express');
const mongoose = require('mongoose');

const router = express.Router();

// Public API information endpoint.
router.get('/', (req, res) => {
    res.status(200).json({
        success: true,
        service: 'SmartVet API',
        version: '1.0.0',
        message: 'SmartVet API is responding.'
    });
});

// Public health-check endpoint.
router.get('/health', (req, res) => {
    const databaseConnected =
        mongoose.connection.readyState === 1;

    res.status(databaseConnected ? 200 : 503).json({
        status: databaseConnected ? 'ok' : 'unavailable',
        service: 'SmartVet API',
        database: databaseConnected
            ? 'connected'
            : 'disconnected',
        timestamp: new Date().toISOString()
    });
});

module.exports = router;
