const mongoose = require('mongoose');

const prescriptionSchema = new mongoose.Schema({
  appointment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Appointment',
    required: true
  },
  patient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  doctor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  diagnosis: {
    type: String,
    required: true
  },
  medications: [{
    medicine: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Medicine',
      required: true
    },
    dosage: {
      type: String,
      required: true
    },
    frequency: {
      type: String,
      required: true,
      enum: ['once_daily', 'twice_daily', 'thrice_daily', 'four_times_daily', 'as_needed', 'custom']
    },
    customFrequency: String,
    duration: {
      type: String,
      required: true
    },
    instructions: String,
    beforeFood: {
      type: Boolean,
      default: false
    },
    afterFood: {
      type: Boolean,
      default: false
    }
  }],
  labTests: [{
    testName: String,
    testCode: String,
    instructions: String,
    urgent: {
      type: Boolean,
      default: false
    }
  }],
  advice: {
    type: String,
    required: true
  },
  followUpRequired: {
    type: Boolean,
    default: false
  },
  followUpDate: Date,
  prescriptionImage: {
    type: String, // Cloudinary URL
    default: ''
  },
  prescriptionImagePublicId: {
    type: String,
    default: ''
  },
  validUntil: {
    type: Date,
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  downloadCount: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Index for better performance
prescriptionSchema.index({ patient: 1, createdAt: -1 });
prescriptionSchema.index({ doctor: 1, createdAt: -1 });
prescriptionSchema.index({ appointment: 1 });

module.exports = mongoose.model('Prescription', prescriptionSchema);
