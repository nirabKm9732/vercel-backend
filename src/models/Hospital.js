const mongoose = require('mongoose');

const hospitalSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['general', 'specialty', 'emergency', 'multispecialty'],
    required: true
  },
  address: {
    street: {
      type: String,
      required: true
    },
    city: {
      type: String,
      required: true
    },
    state: {
      type: String,
      required: true
    },
    zipCode: {
      type: String,
      required: true
    },
    landmark: String
  },
  contact: {
    phone: {
      type: String,
      required: true
    },
    email: {
      type: String,
      required: true
    },
    emergencyNumber: String
  },
  departments: [{
    name: {
      type: String,
      required: true
    },
    description: String,
    headOfDepartment: String,
    contact: String
  }],
  facilities: [{
    type: String // ICU, Operation Theater, Ambulance, etc.
  }],
  bedCapacity: {
    general: {
      total: Number,
      available: Number
    },
    icu: {
      total: Number,
      available: Number
    },
    emergency: {
      total: Number,
      available: Number
    },
    private: {
      total: Number,
      available: Number
    }
  },
  pricing: {
    generalBed: {
      type: Number,
      required: true
    },
    icuBed: {
      type: Number,
      required: true
    },
    emergencyBed: {
      type: Number,
      required: true
    },
    privateBed: {
      type: Number,
      required: true
    },
    consultationFee: {
      type: Number,
      required: true
    }
  },
  images: [String], // Cloudinary URLs
  ratings: {
    averageRating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5
    },
    totalReviews: {
      type: Number,
      default: 0
    }
  },
  accreditations: [String], // NABH, JCI, etc.
  insuranceAccepted: [String],
  isActive: {
    type: Boolean,
    default: true
  },
  operatingHours: {
    weekdays: {
      open: String,
      close: String
    },
    weekends: {
      open: String,
      close: String
    },
    emergency24x7: {
      type: Boolean,
      default: true
    }
  }
}, {
  timestamps: true
});

const hospitalBookingSchema = new mongoose.Schema({
  patient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  hospital: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Hospital',
    required: true
  },
  bedType: {
    type: String,
    enum: ['general', 'icu', 'emergency', 'private'],
    required: true
  },
  admissionDate: {
    type: Date,
    required: true
  },
  estimatedDischarge: Date,
  actualDischarge: Date,
  status: {
    type: String,
    enum: ['requested', 'confirmed', 'admitted', 'discharged', 'cancelled'],
    default: 'requested'
  },
  adminConfirmation: {
    confirmedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    confirmedAt: Date,
    notes: String
  },
  referringDoctor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  department: String,
  reason: {
    type: String,
    required: true
  },
  medicalHistory: String,
  emergencyContact: {
    name: {
      type: String,
      required: true
    },
    phone: {
      type: String,
      required: true
    },
    relationship: {
      type: String,
      required: true
    }
  },
  payment: {
    advanceAmount: {
      type: Number,
      required: true
    },
    estimatedTotal: Number,
    finalAmount: Number,
    status: {
      type: String,
      enum: ['pending', 'advance_paid', 'fully_paid'],
      default: 'pending'
    },
    paymentId: String,
    orderId: String
  },
  billing: {
    bedCharges: Number,
    consultationCharges: Number,
    medicineCharges: Number,
    otherCharges: Number,
    totalCharges: Number,
    insuranceCovered: Number,
    patientPayable: Number
  },
  assignedBed: {
    bedNumber: String,
    ward: String,
    floor: String
  },
  documents: [{
    type: String,
    description: String,
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  notes: {
    patientNotes: String,
    hospitalNotes: String,
    adminNotes: String
  }
}, {
  timestamps: true
});

// Indexes
hospitalSchema.index({ 'address.city': 1, type: 1 });
hospitalSchema.index({ name: 'text', description: 'text' });
hospitalSchema.index({ isActive: 1 });

hospitalBookingSchema.index({ patient: 1, admissionDate: 1 });
hospitalBookingSchema.index({ hospital: 1, status: 1 });
hospitalBookingSchema.index({ status: 1 });

const Hospital = mongoose.model('Hospital', hospitalSchema);
const HospitalBooking = mongoose.model('HospitalBooking', hospitalBookingSchema);

module.exports = { Hospital, HospitalBooking };
