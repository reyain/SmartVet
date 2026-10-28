
const User = require('../src/models/User');
const Pet = require('../src/models/Pet');
const VaccinationRecord = require('../src/models/VaccinationRecord');
const FeedingSchedule = require('../src/models/FeedingSchedule');
const FeedingEvent = require('../src/models/FeedingEvent');
const ActivityRecord = require('../src/models/ActivityRecord');
const Device = require('../src/models/Device');
const Notification = require('../src/models/Notification');
const AuditLog = require('../src/models/AuditLog');

const mongoose = require('mongoose');

let passed = 0;
let failed = 0;

function expectValid(label, Model, data) {
    const validationError = new Model(data).validateSync();

    if (validationError) {
        failed++;
        console.error(`FAIL: ${label} should be valid.`);
        console.error(validationError.message);
        return;
    }

    passed++;
    console.log(`PASS: ${label}`);
}

function expectInvalid(label, Model, data, expectedField) {
    const validationError = new Model(data).validateSync();

    if (
        !validationError ||
        !validationError.errors[expectedField]
    ) {
        failed++;
        console.error(
            `FAIL: ${label} should reject the field "${expectedField}".`
        );

        if (validationError) {
            console.error(validationError.message);
        }

        return;
    }

    passed++;
    console.log(`PASS: ${label}`);
}

// Use dummy IDs for validation only.
// These are not real users, pets, or devices.
const ownerId = new mongoose.Types.ObjectId();
const veterinaryId = new mongoose.Types.ObjectId();
const petId = new mongoose.Types.ObjectId();
const deviceId = new mongoose.Types.ObjectId();

const validUser = {
    fullName: 'Test Pet Owner',
    email: 'test.owner@example.com',
    passwordHash: 'test-hash-only',
    role: 'owner'
};

const validPet = {
    ownerUserId: ownerId,
    name: 'Bruno',
    species: 'dog'
};

const validVaccination = {
    petId,
    vaccineName: 'Test Vaccine',
    administeredDate: new Date(Date.now() - 86400000),
    administeredBy: veterinaryId
};

const validSchedule = {
    petId,
    timeOfDay: '08:00',
    daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    amountGrams: 35,
    timezone: 'Asia/Manila',
    createdBy: veterinaryId
};

const validFeedingEvent = {
    petId,
    deviceId,
    eventId: 'test-feeding-event-001',
    source: 'scheduled',
    requestedGrams: 35
};

const validActivityRecord = {
    petId,
    deviceId,
    activity: 'walking',
    measuredAt: new Date(),
    durationSeconds: 60,
    sensorSummary: {
        averageAccelerationMagnitude: 9.8,
        accelerationVariance: 0.4,
        sampleCount: 10
    }
};

const validDevice = {
    deviceCode: 'SV-FEEDER-TEST-001',
    deviceType: 'feeder',
    credentialHash: 'test-hash-only',
    createdBy: veterinaryId
};

const validNotification = {
    userId: ownerId,
    type: 'vaccination_due',
    title: 'Vaccination reminder',
    message: 'A vaccination due date is approaching.',
    dedupeKey: 'test-vaccination-reminder-001'
};

const validAuditLog = {
    actorUserId: veterinaryId,
    source: 'user',
    action: 'PET_APPROVED',
    entityType: 'pet',
    entityId: petId,
    summary: 'Test pet registration approval.'
};

console.log('\n=== VALID DATA TESTS ===');

expectValid('User accepts valid data', User, validUser);
expectValid('Pet accepts valid data', Pet, validPet);
expectValid(
    'VaccinationRecord accepts valid data',
    VaccinationRecord,
    validVaccination
);
expectValid(
    'FeedingSchedule accepts valid data',
    FeedingSchedule,
    validSchedule
);
expectValid(
    'FeedingEvent accepts valid data',
    FeedingEvent,
    validFeedingEvent
);
expectValid(
    'ActivityRecord accepts valid data',
    ActivityRecord,
    validActivityRecord
);

expectValid(
    'ActivityRecord accepts sleeping activity',
    ActivityRecord,
    {
        ...validActivityRecord,
        activity: 'sleeping'
    }
);

expectValid('Device accepts valid data', Device, validDevice);
expectValid(
    'Notification accepts valid data',
    Notification,
    validNotification
);
expectValid('AuditLog accepts valid data', AuditLog, validAuditLog);

console.log('\n=== INVALID DATA TESTS ===');

expectInvalid(
    'User rejects an unsupported role',
    User,
    { ...validUser, role: 'superuser' },
    'role'
);

expectInvalid(
    'Pet rejects an unsupported species',
    Pet,
    { ...validPet, species: 'dragon' },
    'species'
);

expectInvalid(
    'VaccinationRecord rejects a future administration date',
    VaccinationRecord,
    {
        ...validVaccination,
        administeredDate: new Date(Date.now() + 86400000)
    },
    'administeredDate'
);

expectInvalid(
    'FeedingSchedule rejects an invalid time',
    FeedingSchedule,
    { ...validSchedule, timeOfDay: '25:61' },
    'timeOfDay'
);

expectInvalid(
    'FeedingEvent rejects negative dispensed weight',
    FeedingEvent,
    { ...validFeedingEvent, dispensedGrams: -1 },
    'dispensedGrams'
);

expectInvalid(
    'ActivityRecord rejects an unsupported activity',
    ActivityRecord,
    { ...validActivityRecord, activity: 'flying' },
    'activity'
);

expectInvalid(
    'Device rejects an unsupported device type',
    Device,
    { ...validDevice, deviceType: 'camera' },
    'deviceType'
);

expectInvalid(
    'Notification rejects an unsupported type',
    Notification,
    { ...validNotification, type: 'password_reset' },
    'type'
);

expectInvalid(
    'AuditLog rejects an unsupported entity type',
    AuditLog,
    { ...validAuditLog, entityType: 'unsupported_entity' },
    'entityType'
);

console.log('\n=== TEST SUMMARY ===');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total:  ${passed + failed}`);

if (failed > 0) {
    process.exitCode = 1;
} else {
    console.log('\nAll model validation tests passed.');
}
