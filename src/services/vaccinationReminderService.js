
const Pet = require('../models/Pet');
const User = require('../models/User');
const VaccinationRecord = require('../models/VaccinationRecord');
const Notification = require('../models/Notification');

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const REMINDER_WINDOW_DAYS = 7;

function toUtcDateOnly(value) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return null;
    }

    return new Date(
        Date.UTC(
            date.getUTCFullYear(),
            date.getUTCMonth(),
            date.getUTCDate()
        )
    );
}

function formatDateOnly(value) {
    return value.toISOString().slice(0, 10);
}

async function generateVaccinationReminders() {
    const now = new Date();
    const today = toUtcDateOnly(now);
    const windowEnd = new Date(
        today.getTime() + REMINDER_WINDOW_DAYS * DAY_IN_MS
    );

    const records = await VaccinationRecord.find({
        nextDueDate: { $type: 'date' }
    })
        .select('petId vaccineName nextDueDate')
        .populate({
            path: 'petId',
            select: 'name petCode ownerUserId registrationStatus',
            populate: {
                path: 'ownerUserId',
                select: 'fullName email'
            }
        })
        .lean();

    let eligible = 0;
    let created = 0;
    let duplicates = 0;
    let skipped = 0;

    for (const record of records) {
        const pet = record.petId;

        // Only create reminders for approved pets with an owner.
        if (
            !pet ||
            pet.registrationStatus !== 'approved' ||
            !pet.ownerUserId
        ) {
            skipped += 1;
            continue;
        }

        const dueDate = toUtcDateOnly(record.nextDueDate);

        if (!dueDate) {
            skipped += 1;
            continue;
        }

        let type;
        let title;
        let priority;
        let message;

        const dueDateText = formatDateOnly(dueDate);

        if (dueDate.getTime() < today.getTime()) {
            type = 'vaccination_overdue';
            title = 'Vaccination Overdue';
            priority = 'high';
            message =
                `${pet.name}'s ${record.vaccineName} vaccination was due ` +
                `on ${dueDateText}. Please contact your veterinary clinic ` +
                'to confirm the next steps.';
        } else if (dueDate.getTime() <= windowEnd.getTime()) {
            type = 'vaccination_due';
            title = 'Vaccination Due Soon';
            priority = 'normal';
            message =
                `${pet.name}'s ${record.vaccineName} vaccination is due ` +
                `on ${dueDateText}. Please contact your veterinary clinic ` +
                'to confirm the schedule.';
        } else {
            skipped += 1;
            continue;
        }

        const owner = pet.ownerUserId;
        const ownerUserId = owner._id || owner;

        // The same record, due date, and notification type should
        // generate at most one notification for the same owner.
        const dedupeKey =
            `${type}:${record._id.toString()}:${dueDateText}`;

        eligible += 1;

        try {
            await Notification.create({
                userId: ownerUserId,
                petId: pet._id,
                type,
                title,
                message,
                relatedRecordType: 'vaccination_record',
                relatedRecordId: record._id,
                dedupeKey,
                priority,
                readAt: null
            });

            created += 1;
        } catch (error) {
            if (error.code === 11000) {
                duplicates += 1;
                continue;
            }

            throw error;
        }
    }

    return {
        scanned: records.length,
        eligible,
        created,
        duplicates,
        skipped
    };
}

module.exports = {
    generateVaccinationReminders
};
