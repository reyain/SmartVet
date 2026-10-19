
const mongoose = require('mongoose');

const vaccinationRecordSchema = new mongoose.Schema(
    {
        // Pet that received the vaccination.
        petId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Pet',
            required: [true, 'Pet reference is required.'],
            index: true
        },

        // Name of the vaccine administered.
        vaccineName: {
            type: String,
            required: [true, 'Vaccine name is required.'],
            trim: true,
            minlength: 2,
            maxlength: 150
        },

        // Date the vaccination was actually administered.
        administeredDate: {
            type: Date,
            required: [true, 'Administration date is required.'],
            validate: {
                validator: function (value) {
                    return value <= new Date();
                },
                message: 'Administration date cannot be in the future.'
            }
        },

        // Next vaccination due date, when applicable.
        nextDueDate: {
            type: Date,
            default: undefined,
            validate: {
                validator: function (value) {
                    if (!value || !this.administeredDate) {
                        return true;
                    }

                    return value >= this.administeredDate;
                },
                message:
                    'Next due date cannot be earlier than the administration date.'
            }
        },

        // Optional vaccine batch or lot number.
        batchNumber: {
            type: String,
            trim: true,
            maxlength: 100,
            default: ''
        },

        // Optional product manufacturer.
        manufacturer: {
            type: String,
            trim: true,
            maxlength: 150,
            default: ''
        },

        // Optional dosage information recorded by veterinary personnel.
        dosage: {
            type: String,
            trim: true,
            maxlength: 100,
            default: ''
        },

        // Veterinary staff member who recorded the vaccination.
        administeredBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: [true, 'Veterinary personnel reference is required.']
        },

        // Additional vaccination information.
        notes: {
            type: String,
            trim: true,
            maxlength: 2000,
            default: ''
        }
    },
    {
        timestamps: true,
        versionKey: false
    }
);

// Retrieve a pet's vaccination history by date.
vaccinationRecordSchema.index({
    petId: 1,
    administeredDate: -1
});

// Help locate upcoming or overdue vaccination records.
vaccinationRecordSchema.index({
    nextDueDate: 1
});

const VaccinationRecord = mongoose.model(
    'VaccinationRecord',
    vaccinationRecordSchema
);

module.exports = VaccinationRecord;
