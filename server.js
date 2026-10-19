
require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const path = require('path');
const mongoose = require('mongoose');

const connectDB = require('./src/config/db');

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Add basic HTTP security headers.
app.use(helmet());

// Parse incoming JSON request bodies.
app.use(express.json({ limit: '10kb' }));

// Backend and database health-check endpoint.
app.get('/api/health', (req, res) => {
    const connected = mongoose.connection.readyState === 1;

    res.status(connected ? 200 : 503).json({
        status: connected ? 'ok' : 'unavailable',
        service: 'SmartVet API',
        database: connected ? 'connected' : 'disconnected',
        timestamp: new Date().toISOString()
    });
});

// Serve the frontend from the public folder.
app.use(express.static(path.join(__dirname, 'public')));

// Handle requests for unknown routes.
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'Route not found.'
    });
});

// Handle unexpected errors.
app.use((err, req, res, next) => {
    console.error('Server error:', err.message);

    res.status(500).json({
        success: false,
        message: 'Internal server error.'
    });
});

// Connect to MongoDB before starting the server.
async function startServer() {
    try {
        await connectDB();

        app.listen(PORT, '127.0.0.1', () => {
            console.log('=================================');
            console.log('       SmartVet Backend          ');
            console.log('=================================');
            console.log(`Homepage: http://127.0.0.1:${PORT}`);
            console.log(`Health:   http://127.0.0.1:${PORT}/api/health`);
            console.log('Status: Running');
        });
    } catch (error) {
        console.error(
            'SmartVet could not connect to MongoDB or start.'
        );
        console.error('Error:', error.message);
        process.exitCode = 1;
    }
}

startServer();
