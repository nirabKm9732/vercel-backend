const mongoose = require('mongoose');

const insuranceSchema = new mongoose.Schema({
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
    enum: ['health', 'dental', 'vision', 'accident', 'critical_illness', 'comprehensive'],
    required: true
  },
  provider: {
    type: String,
    required: true
  },
  coverageAmount: {
    type: Number,
    required: true
  },
  premiumStructure: {
    monthly: {
      type: Number,
      required: true
    },
    quarterly: {
      type: Number,
      required: true
    },
    annual: {
      type: Number,
      required: true
    }
  },
  benefits: [{
    type: {
      type: String,
      required: true
    },
    description: String,
    coveragePercentage: {
      type: Number,
      default: 80
    },
    maxLimit: Number,
    waitingPeriod: Number // in days
  }],
  deductible: {
    type: Number,
    default: 0
  },
  duration: {
    type: Number, // in months
    required: true,
    default: 12
  },
  eligibilityCriteria: [String],
  exclusions: [String],
  isActive: {
    type: Boolean,
    default: true
  },
  termsAndConditions: {
    type: String,
    required: true
  },
  features: [String],
  ageLimit: {
    min: {
      type: Number,
      default: 18
    },
    max: {
      type: Number,
      default: 65
    }
  }
}, {
  timestamps: true
});

const userInsuranceSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  policy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'InsurancePolicy',
    required: true
  },
  policyNumber: {
    type: String,
    required: true,
    unique: true
  },
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: true
  },
  status: {
    type: String,
    enum: ['active', 'expired', 'cancelled', 'pending_approval'],
    default: 'active'
  },
  premiumPaid: {
    type: Number,
    required: true
  },
  claimsUsed: {
    type: Number,
    default: 0
  },
  totalClaimAmount: {
    type: Number,
    default: 0
  },
  benefitsUsed: [{
    benefit: String,
    usedDate: Date,
    amount: Number
  }]
}, {
  timestamps: true
});

// Indexes
insuranceSchema.index({ type: 1, isActive: 1 });
insuranceSchema.index({ provider: 1 });
userInsuranceSchema.index({ user: 1, status: 1 });
userInsuranceSchema.index({ endDate: 1 });

const Insurance = mongoose.model('Insurance', insuranceSchema);
const UserInsurance = mongoose.model('UserInsurance', userInsuranceSchema);

module.exports = Insurance;
