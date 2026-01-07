const mongoose = require('mongoose');

const medicineOrderSchema = new mongoose.Schema({
  patient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  orderNumber: {
    type: String,
    required: true,
    unique: true,
    default: function() {
      // Generate default order number if not provided
      const timestamp = Date.now();
      const random = Math.floor(Math.random() * 1000);
      return `MO${timestamp}${String(random).padStart(3, '0')}`;
    }
  },
  items: [{
    medicine: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Medicine',
      required: true
    },
    quantity: {
      type: Number,
      required: true,
      min: 1
    },
    priceAtTime: {
      type: Number,
      required: true
    },
    subtotal: {
      type: Number,
      required: true
    }
  }],
  prescription: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Prescription'
  },
  prescriptionImageUrl: {
    type: String, // Cloudinary URL for uploaded prescription image
    default: ''
  },
  prescriptionImagePublicId: {
    type: String,
    default: ''
  },
  prescriptionRequired: {
    type: Boolean,
    default: false
  },
  pricing: {
    subtotal: {
      type: Number,
      required: true
    },
    deliveryFee: {
      type: Number,
      default: 0
    },
    discount: {
      type: Number,
      default: 0
    },
    tax: {
      type: Number,
      required: true
    },
    total: {
      type: Number,
      required: true
    }
  },
  deliveryAddress: {
    name: {
      type: String,
      required: true
    },
    phone: {
      type: String,
      required: true
    },
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
  payment: {
    method: {
      type: String,
      enum: ['online', 'cod'],
      required: true
    },
    status: {
      type: String,
      enum: ['pending', 'paid', 'failed'],
      default: 'pending'
    },
    paymentId: String,
    orderId: String,
    amount: {
      type: Number,
      required: true
    }
  },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'],
    default: 'pending'
  },
  tracking: {
    trackingNumber: String,
    carrier: String,
    estimatedDelivery: Date,
    updates: [{
      status: String,
      message: String,
      timestamp: {
        type: Date,
        default: Date.now
      },
      location: String
    }]
  },
  pharmacy: {
    name: String,
    phone: String,
    address: String
  },
  notes: {
    patientNotes: String,
    pharmacyNotes: String,
    deliveryNotes: String
  },
  cancelReason: String,
  refund: {
    status: {
      type: String,
      enum: ['none', 'requested', 'processing', 'completed'],
      default: 'none'
    },
    amount: Number,
    reason: String,
    processedAt: Date
  }
}, {
  timestamps: true
});

// Generate order number - must run before validation
medicineOrderSchema.pre('validate', async function(next) {
  if (this.isNew && !this.orderNumber) {
    try {
      // Use a more unique approach to avoid race conditions
      const timestamp = Date.now();
      const random = Math.floor(Math.random() * 1000);
      this.orderNumber = `MO${timestamp}${String(random).padStart(3, '0')}`;
    } catch (error) {
      // Fallback if generation fails
      this.orderNumber = `MO${Date.now()}${Math.floor(Math.random() * 10000)}`;
    }
  }
  next();
});

// Calculate pricing
medicineOrderSchema.methods.calculatePricing = function() {
  this.pricing.subtotal = this.items.reduce((sum, item) => sum + item.subtotal, 0);
  
  // Delivery fee logic
  if (this.pricing.subtotal < 500) {
    this.pricing.deliveryFee = 50;
  } else if (this.pricing.subtotal < 1000) {
    this.pricing.deliveryFee = 25;
  } else {
    this.pricing.deliveryFee = 0;
  }
  
  // Tax calculation (5% GST)
  this.pricing.tax = Math.round((this.pricing.subtotal + this.pricing.deliveryFee) * 0.05);
  
  // Total calculation
  this.pricing.total = this.pricing.subtotal + this.pricing.deliveryFee + this.pricing.tax - this.pricing.discount;
  this.payment.amount = this.pricing.total;
};

// Indexes for better performance
medicineOrderSchema.index({ patient: 1, createdAt: -1 });
medicineOrderSchema.index({ orderNumber: 1 });
medicineOrderSchema.index({ status: 1 });
medicineOrderSchema.index({ 'payment.status': 1 });

module.exports = mongoose.model('MedicineOrder', medicineOrderSchema);
