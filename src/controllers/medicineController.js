const Medicine = require('../models/Medicine');
const MedicineOrder = require('../models/MedicineOrder');
const User = require('../models/User');
const { validationResult } = require('express-validator');

// Get all medicines with search and filters
const getMedicines = async (req, res) => {
  try {
    const {
      search,
      category,
      minPrice,
      maxPrice,
      prescriptionRequired,
      sortBy = 'name',
      sortOrder = 'asc',
      page = 1,
      limit = 20
    } = req.query;

    let filter = { isActive: true };

    // Search functionality
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { genericName: { $regex: search, $options: 'i' } },
        { manufacturer: { $regex: search, $options: 'i' } },
        { tags: { $in: [new RegExp(search, 'i')] } }
      ];
    }

    // Category filter
    if (category) {
      filter.category = category;
    }

    // Price range filter
    if (minPrice || maxPrice) {
      filter['price.sellingPrice'] = {};
      if (minPrice) filter['price.sellingPrice'].$gte = parseFloat(minPrice);
      if (maxPrice) filter['price.sellingPrice'].$lte = parseFloat(maxPrice);
    }

    // Prescription required filter
    if (prescriptionRequired !== undefined) {
      filter.prescriptionRequired = prescriptionRequired === 'true';
    }

    // Sorting
    const sortOptions = {};
    if (sortBy === 'price') {
      sortOptions['price.sellingPrice'] = sortOrder === 'desc' ? -1 : 1;
    } else if (sortBy === 'rating') {
      sortOptions.avgRating = sortOrder === 'desc' ? -1 : 1;
    } else {
      sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;
    }

    const medicines = await Medicine.find(filter)
      .sort(sortOptions)
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Medicine.countDocuments(filter);

    res.status(200).json({
      success: true,
      data: {
        medicines,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Get medicines error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch medicines',
      error: error.message
    });
  }
};

// Get single medicine by ID
const getMedicineById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const medicine = await Medicine.findOne({
      _id: id,
      isActive: true
    });

    if (!medicine) {
      return res.status(404).json({
        success: false,
        message: 'Medicine not found'
      });
    }

    res.status(200).json({
      success: true,
      data: { medicine }
    });
  } catch (error) {
    console.error('Get medicine error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch medicine',
      error: error.message
    });
  }
};

// Create medicine order
const createMedicineOrder = async (req, res) => {
  try {
    console.log('Create order request body:', JSON.stringify(req.body, null, 2));
    console.log('User:', req.user?._id);
    
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.error('Validation errors:', errors.array());
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: errors.array()
      });
    }

    const patientId = req.user._id;
    
    // Check if patient has complete address
    const patient = await User.findById(patientId);
    if (!patient || !patient.address || !patient.address.street || !patient.address.city || !patient.address.state || !patient.address.zipCode) {
      return res.status(400).json({
        success: false,
        message: 'Please complete your profile address before placing an order. Address (street, city, state, and zip code) is required.'
      });
    }
    
    const {
      items,
      deliveryAddress,
      paymentMethod = 'cod',
      prescriptionId,
      prescriptionImageUrl,
      prescriptionImagePublicId,
      notes
    } = req.body;
    
    console.log('Processing order for patient:', patientId);
    console.log('Items count:', items?.length);
    console.log('Delivery address:', deliveryAddress);

    // Validate items and calculate pricing
    const orderItems = [];
    let prescriptionRequired = false;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Order must contain at least one item'
      });
    }

    for (const item of items) {
      if (!item.medicineId) {
        return res.status(400).json({
          success: false,
          message: 'Each item must have a medicineId'
        });
      }
      
      if (!item.quantity || item.quantity < 1) {
        return res.status(400).json({
          success: false,
          message: 'Each item must have a quantity of at least 1'
        });
      }
      
      console.log(`Processing item: medicineId=${item.medicineId}, quantity=${item.quantity}`);
      
      const medicine = await Medicine.findById(item.medicineId);
      if (!medicine) {
        console.error(`Medicine not found: ${item.medicineId}`);
        return res.status(400).json({
          success: false,
          message: `Medicine not found: ${item.medicineId}`
        });
      }
      
      if (!medicine.isActive) {
        console.error(`Medicine is inactive: ${item.medicineId}`);
        return res.status(400).json({
          success: false,
          message: `Medicine is no longer available: ${medicine.name}`
        });
      }

      // Check stock availability
      const availableStock = medicine.inventory?.stock || 0;
      if (availableStock < item.quantity) {
        console.error(`Insufficient stock for ${medicine.name}. Available: ${availableStock}, Requested: ${item.quantity}`);
        return res.status(400).json({
          success: false,
          message: `Insufficient stock for ${medicine.name}. Available: ${availableStock}, Requested: ${item.quantity}`
        });
      }

      if (medicine.prescriptionRequired) {
        prescriptionRequired = true;
      }

      const sellingPrice = medicine.price?.sellingPrice || 0;
      const subtotal = sellingPrice * item.quantity;
      
      orderItems.push({
        medicine: medicine._id,
        quantity: item.quantity,
        priceAtTime: sellingPrice,
        subtotal
      });
      
      console.log(`Added item: ${medicine.name}, quantity=${item.quantity}, price=${sellingPrice}, subtotal=${subtotal}`);
    }

    // Check if prescription is required but not provided
    if (prescriptionRequired && !prescriptionId && !prescriptionImageUrl) {
      console.error('Prescription required but not provided');
      return res.status(400).json({
        success: false,
        message: 'Prescription required for one or more medicines. Please upload a prescription or consult a doctor.'
      });
    }

    // Validate delivery address
    if (!deliveryAddress || !deliveryAddress.name || !deliveryAddress.phone || 
        !deliveryAddress.street || !deliveryAddress.city || !deliveryAddress.state || !deliveryAddress.zipCode) {
      console.error('Invalid delivery address:', deliveryAddress);
      return res.status(400).json({
        success: false,
        message: 'Complete delivery address is required'
      });
    }

    console.log('Creating order document...');
    
    // Create order
    const order = new MedicineOrder({
      patient: patientId,
      items: orderItems,
      prescription: prescriptionId || undefined,
      prescriptionImageUrl: prescriptionImageUrl || undefined,
      prescriptionImagePublicId: prescriptionImagePublicId || undefined,
      prescriptionRequired,
      deliveryAddress: {
        name: deliveryAddress.name.trim(),
        phone: deliveryAddress.phone.trim(),
        street: deliveryAddress.street.trim(),
        city: deliveryAddress.city.trim(),
        state: deliveryAddress.state.trim(),
        zipCode: deliveryAddress.zipCode.trim(),
        landmark: deliveryAddress.landmark ? deliveryAddress.landmark.trim() : undefined
      },
      payment: {
        method: paymentMethod || 'cod',
        status: 'pending',
        amount: 0 // Will be calculated
      },
      pricing: {
        subtotal: 0,
        deliveryFee: 0,
        discount: 0,
        tax: 0,
        total: 0
      },
      notes: notes ? {
        patientNotes: notes
      } : undefined
    });

    console.log('Order document created, calculating pricing...');
    
    // Calculate pricing (this also sets payment.amount)
    order.calculatePricing();
    
    console.log('Pricing calculated:', {
      subtotal: order.pricing.subtotal,
      deliveryFee: order.pricing.deliveryFee,
      tax: order.pricing.tax,
      total: order.pricing.total
    });
    
    // Save order (order number will be generated by pre-save hook)
    console.log('Saving order to database...');
    await order.save();
    console.log('Order saved successfully. Order number:', order.orderNumber);

    // Populate order details
    await order.populate([
      { path: 'items.medicine', select: 'name genericName manufacturer images' },
      { path: 'patient', select: 'firstName lastName email phone' },
      { path: 'prescription', select: 'diagnosis createdAt' }
    ]);

    res.status(201).json({
      success: true,
      message: 'Order created successfully',
      data: { order }
    });
  } catch (error) {
    console.error('Create medicine order error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Failed to create order',
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

// Get user's medicine orders
const getUserOrders = async (req, res) => {
  try {
    const userId = req.user._id;
    const { status, page = 1, limit = 10 } = req.query;

    let filter = { patient: userId };
    if (status) {
      filter.status = status;
    }

    const orders = await MedicineOrder.find(filter)
      .populate('items.medicine', 'name genericName manufacturer images')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await MedicineOrder.countDocuments(filter);

    res.status(200).json({
      success: true,
      data: {
        orders,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Get user orders error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch orders',
      error: error.message
    });
  }
};

// Get order by ID
const getOrderById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const order = await MedicineOrder.findById(id)
      .populate('items.medicine', 'name genericName manufacturer images dosageForm strength')
      .populate('patient', 'firstName lastName email phone')
      .populate('prescription', 'diagnosis createdAt');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Check if user has access to this order
    // Allow the user who placed the order (patient/doctor) or admin
    const isOrderOwner = order.patient._id.toString() === userId.toString();
    const isAdmin = req.user.role === 'admin';
    
    if (!isOrderOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    res.status(200).json({
      success: true,
      data: { order }
    });
  } catch (error) {
    console.error('Get order error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch order',
      error: error.message
    });
  }
};

// Admin/Pharmacy: Get all orders with filters
const getAllOrders = async (req, res) => {
  try {
    const { status, patient, page = 1, limit = 20, sort = '-createdAt' } = req.query;

    const filter = {};
    if (status) filter.status = status;
    if (patient) filter.patient = patient;

    const query = MedicineOrder.find(filter)
      .populate('items.medicine', 'name genericName manufacturer images')
      .populate('patient', 'firstName lastName email phone')
      .populate('prescription', 'diagnosis createdAt')
      .sort(sort)
      .limit(parseInt(limit) * 1)
      .skip((parseInt(page) - 1) * parseInt(limit));

    const [orders, total] = await Promise.all([
      query,
      MedicineOrder.countDocuments(filter)
    ]);

    res.status(200).json({
      success: true,
      data: {
        orders,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });
  } catch (error) {
    console.error('Get all orders error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch orders',
      error: error.message
    });
  }
};

// Update order status (admin/pharmacy only)
const updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, trackingNumber, carrier, notes } = req.body;

    if (req.user.role !== 'admin' && req.user.role !== 'pharmacy') {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const order = await MedicineOrder.findById(id);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Update order status
    order.status = status;

    // Add tracking info if provided
    if (trackingNumber) {
      order.tracking.trackingNumber = trackingNumber;
      order.tracking.carrier = carrier;
      
      // Add tracking update
      order.tracking.updates.push({
        status: status,
        message: `Order ${status}${trackingNumber ? ` - Tracking: ${trackingNumber}` : ''}`,
        timestamp: new Date(),
        location: 'Pharmacy'
      });
    }

    // Add notes
    if (notes) {
      order.notes.pharmacyNotes = notes;
    }

    // Update stock when order is confirmed
    if (status === 'confirmed' && order.status !== 'confirmed') {
      for (const item of order.items) {
        await Medicine.findByIdAndUpdate(
          item.medicine,
          { $inc: { 'inventory.stock': -item.quantity } }
        );
      }
    }

    await order.save();

    res.status(200).json({
      success: true,
      message: 'Order status updated successfully',
      data: { order }
    });
  } catch (error) {
    console.error('Update order status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update order status',
      error: error.message
    });
  }
};

// Admin/Pharmacy: Mark order as delivered
const markOrderDelivered = async (req, res) => {
  try {
    const { id } = req.params;

    const order = await MedicineOrder.findById(id);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Only allow marking as delivered if appropriate
    if (!['shipped', 'processing', 'confirmed'].includes(order.status)) {
      // Still allow admin to force-deliver, but warn via message
      console.warn(`Force delivering order ${id} from status ${order.status}`);
    }

    order.status = 'delivered';
    order.tracking.updates.push({
      status: 'delivered',
      message: 'Order delivered to customer',
      timestamp: new Date(),
      location: 'Destination'
    });

    // Mark COD payments as paid upon delivery (if applicable)
    if (order.payment?.method === 'cod') {
      order.payment.status = 'paid';
    }

    await order.save();

    await order.populate([
      { path: 'items.medicine', select: 'name genericName' },
      { path: 'patient', select: 'firstName lastName email phone' }
    ]);

    res.status(200).json({
      success: true,
      message: 'Order marked as delivered',
      data: { order }
    });
  } catch (error) {
    console.error('Mark order delivered error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark order as delivered',
      error: error.message
    });
  }
};

// Cancel order
const cancelOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const userId = req.user._id;

    const order = await MedicineOrder.findById(id);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Check if user can cancel this order
    if (order.patient.toString() !== userId.toString() && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Check if order can be cancelled
    if (['shipped', 'delivered'].includes(order.status)) {
      return res.status(400).json({
        success: false,
        message: 'Cannot cancel order that has been shipped or delivered'
      });
    }

    order.status = 'cancelled';
    order.cancelReason = reason;

    // Restore stock if order was confirmed
    if (order.status === 'confirmed') {
      for (const item of order.items) {
        await Medicine.findByIdAndUpdate(
          item.medicine,
          { $inc: { 'inventory.stock': item.quantity } }
        );
      }
    }

    await order.save();

    res.status(200).json({
      success: true,
      message: 'Order cancelled successfully',
      data: { order }
    });
  } catch (error) {
    console.error('Cancel order error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel order',
      error: error.message
    });
  }
};

// Get medicine categories
const getMedicineCategories = async (req, res) => {
  try {
    const categories = await Medicine.distinct('category', { isActive: true });
    
    res.status(200).json({
      success: true,
      data: { categories }
    });
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch categories',
      error: error.message
    });
  }
};

module.exports = {
  getMedicines,
  getMedicineById,
  createMedicineOrder,
  getUserOrders,
  getOrderById,
  getAllOrders,
  updateOrderStatus,
  markOrderDelivered,
  cancelOrder,
  getMedicineCategories
};
