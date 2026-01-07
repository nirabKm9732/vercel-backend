const mongoose = require('mongoose');

const medicineSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  genericName: {
    type: String,
    required: true,
    trim: true
  },
  manufacturer: {
    type: String,
    required: true
  },
  category: {
    type: String,
    required: true,
    enum: ['antibiotic', 'painkiller', 'vitamin', 'supplement', 'prescription', 'otc', 'other']
  },
  description: {
    type: String,
    required: true
  },
  dosageForm: {
    type: String,
    required: true,
    enum: ['tablet', 'capsule', 'syrup', 'injection', 'cream', 'drops', 'inhaler', 'other']
  },
  strength: {
    value: {
      type: Number,
      required: true
    },
    unit: {
      type: String,
      required: true,
      enum: ['mg', 'g', 'ml', 'units', '%', 'other']
    }
  },
  price: {
    mrp: {
      type: Number,
      required: true
    },
    sellingPrice: {
      type: Number,
      required: true
    },
    discount: {
      type: Number,
      default: 0
    }
  },
  inventory: {
    stock: {
      type: Number,
      required: true,
      default: 0
    },
    lowStockThreshold: {
      type: Number,
      default: 10
    }
  },
  images: [{
    type: String, // Cloudinary URLs
    required: true
  }],
  sideEffects: [String],
  contraindications: [String],
  interactions: [String],
  storageInstructions: String,
  expiryDate: {
    type: Date,
    required: true
  },
  prescriptionRequired: {
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true
  },
  tags: [String], // For search optimization
  avgRating: {
    type: Number,
    default: 0,
    min: 0,
    max: 5
  },
  totalReviews: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Indexes for search and performance
medicineSchema.index({ name: 'text', genericName: 'text', manufacturer: 'text' });
medicineSchema.index({ category: 1 });
medicineSchema.index({ 'price.sellingPrice': 1 });
medicineSchema.index({ isActive: 1 });
medicineSchema.index({ avgRating: -1 });

module.exports = mongoose.model('Medicine', medicineSchema);
