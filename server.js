
require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const path = require('path');

const connectDB = require('./src/config/db');
const apiRoutes = require('./src/routes/apiRoutes');
const authRoutes = require('./src/routes/authRoutes');

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Add basic HTTP security headers.
app.use(helmet());

// Parse incoming JSON request bodies.
app.use(express.json({ limit: '10kb' }));

// Mount authentication and general API routes.
app.use('/api/auth', authRoutes);
app.use('/api', apiRoutes);

// Serve the frontend from the public folder.
app.use(express.static(path.join(__dirname, 'public')));

// Return a JSON response for unknown routes.
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'Route not found.'
    });
});

// Handle errors passed by routes and middleware.
app.use((err, req, res, next) => {
    console.error('Server error:', err.message);

    res.status(500).json({
        success: false,
        message: 'Internal server error.'
    });
});

// Connect to MongoDB before starting the web server.
async function startServer() {
    try {
        await connectDB();

        app.listen(PORT, '127.0.0.1', () => {
            console.log('=================================');
            console.log('       SmartVet Backend          ');
            console.log('=================================');
            console.log(`Homepage: http://127.0.0.1:${PORT}`);
            console.log(`API:      http://127.0.0.1:${PORT}/api`);
            console.log(`Health:   http://127.0.0.1:${PORT}/api/health`);
            console.log(`Login:    http://127.0.0.1:${PORT}/api/auth/login`);
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
