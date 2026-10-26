
require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const path = require('path');

const connectDB = require('./src/config/db');
const cron = require('node-cron');

const {
    generateVaccinationReminders
} = require('./src/services/vaccinationReminderService');

const apiRoutes = require('./src/routes/apiRoutes');
const authRoutes = require('./src/routes/authRoutes');
const adminRoutes = require('./src/routes/adminRoutes');
const clinicRoutes = require('./src/routes/clinicRoutes');
const ownerRoutes = require('./src/routes/ownerRoutes');
const deviceRoutes = require('./src/routes/deviceRoutes');
const feedingScheduleRoutes = require('./src/routes/feedingScheduleRoutes');
const feedingEventRoutes = require('./src/routes/feedingEventRoutes');
const iotRoutes = require('./src/routes/iotRoutes');

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            imgSrc: ["'self'", "data:", "blob:"]
        }
    }
}));
app.use(express.json({ limit: '10kb' }));

// Authentication endpoints.
app.use('/api/auth', authRoutes);

// Role-protected API areas.
app.use('/api/admin', adminRoutes);
app.use('/api/clinic/devices', deviceRoutes);
app.use('/api/clinic/feeding-schedules', feedingScheduleRoutes);
app.use('/api/clinic/feeding-events', feedingEventRoutes);
app.use('/api/iot', iotRoutes);
app.use('/api/clinic', clinicRoutes);
app.use('/api/owner', ownerRoutes);

// General API endpoints.
app.use('/api', apiRoutes);

// Serve the frontend.
app.use(express.static(path.join(__dirname, 'public')));

// Handle unknown routes.
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'Route not found.'
    });
});

// Handle unexpected server errors.
app.use((err, req, res, next) => {
    console.error('Server error:', err.message);

    res.status(500).json({
        success: false,
        message: 'Internal server error.'
    });
});

async function startServer() {
    try {
        await connectDB();

        
        // Run vaccination reminder scans and log results without
        // allowing a scan failure to stop the web server.
        async function runReminderScan(trigger) {
            try {
                const result = await generateVaccinationReminders();

                console.log(
                    `[Vaccination reminders] ${trigger} scan completed:`,
                    result
                );
            } catch (error) {
                console.error(
                    `[Vaccination reminders] ${trigger} scan failed:`,
                    error.message
                );
            }
        }

        // Run the reminder service every day at 8:00 AM
        // using Philippine local time.
        cron.schedule(
            '0 8 * * *',
            async () => {
                await runReminderScan('Scheduled');
            },
            {
                timezone: 'Asia/Manila'
            }
        );

        console.log(
            'Vaccination reminder schedule: daily at 8:00 AM (Asia/Manila)'
        );

        // Also check for reminders immediately after connecting
        // to MongoDB, rather than waiting for the next morning.
        void runReminderScan('Startup');


        app.listen(PORT, '127.0.0.1', () => {
            console.log('=================================');
            console.log('       SmartVet Backend          ');
            console.log('=================================');
            console.log(`Homepage: http://127.0.0.1:${PORT}`);
            console.log(`API:      http://127.0.0.1:${PORT}/api`);
            console.log(`Admin:    http://127.0.0.1:${PORT}/api/admin`);
            console.log(`Clinic:   http://127.0.0.1:${PORT}/api/clinic`);
            console.log(`Owner:    http://127.0.0.1:${PORT}/api/owner`);
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
