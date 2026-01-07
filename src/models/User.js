const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  // Basic Information
  firstName: {
    type: String,
    required: true,
    trim: true
  },
  lastName: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  phone: {
    type: String,
    required: true,
    unique: true
  },
  role: {
    type: String,
    enum: ['patient', 'doctor', 'hospital', 'lab_assistant', 'admin'],
    required: true,
    default: 'patient'
  },
  
  // Profile Information
  dateOfBirth: {
    type: Date,
    required: function() { return this.role === 'patient'; }
  },
  gender: {
    type: String,
    enum: ['male', 'female', 'other'],
    required: function() { return this.role === 'patient'; }
  },
  address: {
    street: String,
    city: String,
    state: String,
    zipCode: String,
    country: {
      type: String,
      default: 'India'
    }
  },
  ratingAverage: {
    type: Number,
    default: 0
  },
  ratingCount: {
    type: Number,
    default: 0
  },
  profileImage: {
    type: String,
    default: ''
  },
  
  // Doctor-specific fields
  specialization: {
    type: String,
    required: function() { return this.role === 'doctor'; }
  },
  qualification: {
    type: String,
    required: function() { return this.role === 'doctor'; }
  },
  experience: {
    type: Number,
    required: function() { return this.role === 'doctor'; }
  },
  consultationFee: {
    type: Number,
    required: function() { return this.role === 'doctor'; }
  },
  availability: [{
    day: {
      type: String,
      enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
    },
    specificDate: {
      type: String
    },
    timeSlots: [{
      startTime: String,
      endTime: String,
      isAvailable: {
        type: Boolean,
        default: true
      }
    }]
  }],
  
  // Hospital-specific fields
  hospitalName: {
    type: String,
    required: function() { return this.role === 'hospital'; }
  },
  hospitalType: {
    type: String,
    enum: ['general', 'specialty', 'emergency', 'multispecialty'],
    required: function() { return this.role === 'hospital'; }
  },
  departments: [String],
  totalBeds: {
    type: Number,
    required: function() { return this.role === 'hospital'; }
  },
  availableBeds: {
    type: Number,
    required: function() { return this.role === 'hospital'; }
  },
  
  // Lab Assistant-specific fields
  labName: {
    type: String,
    required: function() { return this.role === 'lab_assistant'; }
  },
  certifications: [String],
  
  // Patient-specific fields
  medicalHistory: [{
    condition: String,
    diagnosedDate: Date,
    currentStatus: {
      type: String,
      enum: ['active', 'recovered', 'chronic']
    }
  }],
  allergies: [String],
  emergencyContact: {
    name: String,
    phone: String,
    relationship: String
  },
  insuranceInfo: {
    provider: String,
    policyNumber: String,
    coverage: String
  },
  insurancePolicies: [{
    plan: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Insurance'
    },
    policyNumber: String,
    startDate: Date,
    endDate: Date,
    premiumAmount: Number,
    paymentFrequency: {
      type: String,
      enum: ['monthly', 'quarterly', 'annual']
    },
    status: {
      type: String,
      enum: ['active', 'pending_payment', 'expired', 'cancelled'],
      default: 'pending_payment'
    },
    beneficiaries: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }],
    coverageUsed: {
      type: Number,
      default: 0
    },
    claims: [{
      claimNumber: String,
      claimType: String,
      claimAmount: Number,
      serviceDate: Date,
      providerName: String,
      diagnosis: String,
      treatmentDetails: String,
      documents: [String],
      status: {
        type: String,
        enum: ['pending', 'approved', 'rejected', 'processing'],
        default: 'pending'
      },
      submittedDate: Date,
      processedDate: Date,
      approvedAmount: Number,
      rejectionReason: String
    }]
  }],
  
  // Common fields
  isVerified: {
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastLogin: Date,
  
}, {
  timestamps: true
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Get full name
userSchema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.lastName}`;
});

module.exports = mongoose.model('User', userSchema);
