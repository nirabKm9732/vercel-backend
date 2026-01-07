const mongoose = require('mongoose');

const testPackageSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true
  },
  category: {
    type: String,
    required: true,
    enum: ['blood_test', 'urine_test', 'imaging', 'pathology', 'cardiology', 'comprehensive_health_checkup', 'other']
  },
  tests: [{
    testName: {
      type: String,
      required: true
    },
    testCode: String,
    normalRange: String,
    unit: String,
    description: String
  }],
  price: {
    type: Number,
    required: true
  },
  discountPrice: {
    type: Number,
    default: 0
  },
  preparationInstructions: [String],
  fastingRequired: {
    type: Boolean,
    default: false
  },
  fastingHours: {
    type: Number,
    default: 0
  },
  sampleType: {
    type: String,
    enum: ['blood', 'urine', 'stool', 'saliva', 'other'],
    required: true
  },
  homeCollectionAvailable: {
    type: Boolean,
    default: true
  },
  homeCollectionFee: {
    type: Number,
    default: 0
  },
  reportDeliveryTime: {
    type: String,
    required: true // e.g., "24 hours", "2-3 days"
  },
  isActive: {
    type: Boolean,
    default: true
  },
  averageRating: {
    type: Number,
    default: 0,
    min: 0,
    max: 5
  },
  totalBookings: {
    type: Number,
    default: 0
  },
  labPartners: [{
    labName: String,
    contact: String,
    address: String,
    availability: [String] // Days of the week
  }]
}, {
  timestamps: true
});

const testBookingSchema = new mongoose.Schema({
  patient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  testPackage: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TestPackage',
    required: true
  },
  appointmentDate: {
    type: Date,
    required: true
  },
  timeSlot: {
    startTime: String,
    endTime: String
  },
  type: {
    type: String,
    enum: ['home_visit', 'lab_visit'],
    required: true
  },
  labAssistant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  selectedLab: {
    labName: String,
    contact: String,
    address: String
  },
  homeAddress: {
    street: String,
    city: String,
    state: String,
    zipCode: String,
    landmark: String
  },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'sample_collected', 'processing', 'completed', 'cancelled'],
    default: 'pending'
  },
  payment: {
    amount: {
      type: Number,
      required: true
    },
    advanceAmount: {
      type: Number,
      required: true
    },
    status: {
      type: String,
      enum: ['pending', 'paid', 'failed'],
      default: 'pending'
    },
    paymentId: String,
    orderId: String,
    paidAt: Date,
    refund: {
      status: {
        type: String,
        enum: ['none', 'pending', 'processing', 'completed', 'failed'],
        default: 'none'
      },
      amount: Number,
      refundId: String,
      initiatedAt: Date,
      completedAt: Date,
      reason: String,
      notes: String
    }
  },
  testReport: {
    reportUrl: String, // Cloudinary URL
    uploadedAt: Date,
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  notes: {
    patientNotes: String,
    labNotes: String
  },
  sampleCollectionDetails: {
    collectedAt: Date,
    collectedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    sampleId: String
  }
}, {
  timestamps: true
});

// Indexes
testPackageSchema.index({ category: 1, isActive: 1 });
testPackageSchema.index({ price: 1 });
testPackageSchema.index({ name: 'text', description: 'text' });

testBookingSchema.index({ patient: 1, appointmentDate: 1 });
testBookingSchema.index({ status: 1 });
testBookingSchema.index({ labAssistant: 1 });

const TestPackage = mongoose.model('TestPackage', testPackageSchema);
const TestBooking = mongoose.model('TestBooking', testBookingSchema);

module.exports = { TestPackage, TestBooking };
