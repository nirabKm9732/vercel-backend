const mongoose = require('mongoose');

const prescriptionTemplateSchema = new mongoose.Schema({
  doctor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
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
  defaultFollowUpDays: {
    type: Number,
    default: 7
  },
  category: {
    type: String,
    enum: ['general', 'cardiology', 'diabetes', 'hypertension', 'respiratory', 'gastroenterology', 'orthopedics', 'pediatrics', 'gynecology', 'dermatology', 'other'],
    default: 'general'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  usageCount: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Index for better performance
prescriptionTemplateSchema.index({ doctor: 1, createdAt: -1 });
prescriptionTemplateSchema.index({ doctor: 1, category: 1 });
prescriptionTemplateSchema.index({ doctor: 1, isActive: 1 });

module.exports = mongoose.model('PrescriptionTemplate', prescriptionTemplateSchema);







