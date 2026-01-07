const Razorpay = require('razorpay');
const crypto = require('crypto');
const Appointment = require('../models/Appointment');
const { validationResult } = require('express-validator');

// Initialize Razorpay
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

// Create payment order for appointment
const createPaymentOrder = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: errors.array()
      });
    }

    const { appointmentId, paymentType } = req.body; // paymentType: 'advance' | 'remaining'
    const userId = req.user._id;

    // Find appointment
    const appointment = await Appointment.findById(appointmentId)
      .populate('doctor', 'firstName lastName')
      .populate('patient', 'firstName lastName');

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: 'Appointment not found'
      });
    }

    // Verify user has access to this appointment
    const hasAccess = appointment.patient._id.toString() === userId.toString() ||
                     appointment.doctor._id.toString() === userId.toString();

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Determine amount based on payment type
    let amount;
    let receipt;
    if (paymentType === 'advance') {
      if (appointment.payment.advancePaymentStatus === 'paid') {
        return res.status(400).json({
          success: false,
          message: 'Advance payment already completed'
        });
      }
      amount = appointment.payment.advanceAmount;
      receipt = `advance_${appointmentId}_${Date.now()}`;
    } else if (paymentType === 'remaining') {
      if (appointment.payment.advancePaymentStatus !== 'paid') {
        return res.status(400).json({
          success: false,
          message: 'Advance payment must be completed first'
        });
      }
      if (appointment.payment.finalPaymentStatus === 'paid') {
        return res.status(400).json({
          success: false,
          message: 'Final payment already completed'
        });
      }
      amount = appointment.payment.remainingAmount;
      receipt = `remaining_${appointmentId}_${Date.now()}`;
    } else {
      return res.status(400).json({
        success: false,
        message: 'Invalid payment type'
      });
    }

    // Create Razorpay order
    const orderOptions = {
      amount: amount * 100, // Razorpay accepts amount in paise
      currency: 'INR',
      receipt,
      payment_capture: 1
    };

    const order = await razorpay.orders.create(orderOptions);

    // Update appointment with order details
    appointment.payment.orderId = order.id;
    await appointment.save();

    res.status(200).json({
      success: true,
      message: 'Payment order created successfully',
      data: {
        orderId: order.id,
        amount: amount,
        currency: 'INR',
        appointmentId,
        paymentType,
        key: process.env.RAZORPAY_KEY_ID,
        patientName: appointment.patient.firstName + ' ' + appointment.patient.lastName,
        doctorName: appointment.doctor.firstName + ' ' + appointment.doctor.lastName
      }
    });
  } catch (error) {
    console.error('Create payment order error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create payment order',
      error: error.message
    });
  }
};

// Verify payment signature and update appointment
const verifyPayment = async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      appointmentId,
      paymentType
    } = req.body;

    // Create signature to verify
    const body = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: 'Payment verification failed'
      });
    }

    // Find and update appointment
    const appointment = await Appointment.findById(appointmentId);
    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: 'Appointment not found'
      });
    }

    // Update payment status based on type
    if (paymentType === 'advance') {
      appointment.payment.advancePaymentStatus = 'paid';
      appointment.payment.paymentId = razorpay_payment_id;
    } else if (paymentType === 'remaining') {
      appointment.payment.finalPaymentStatus = 'paid';
    }

    await appointment.save();

    res.status(200).json({
      success: true,
      message: 'Payment verified and updated successfully',
      data: {
        paymentId: razorpay_payment_id,
        appointmentId,
        paymentType
      }
    });
  } catch (error) {
    console.error('Verify payment error:', error);
    res.status(500).json({
      success: false,
      message: 'Payment verification failed',
      error: error.message
    });
  }
};

// Handle payment failure
const handlePaymentFailure = async (req, res) => {
  try {
    const { appointmentId, paymentType, error: paymentError } = req.body;

    const appointment = await Appointment.findById(appointmentId);
    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: 'Appointment not found'
      });
    }

    // Update payment status to failed
    if (paymentType === 'advance') {
      appointment.payment.advancePaymentStatus = 'failed';
    } else if (paymentType === 'remaining') {
      appointment.payment.finalPaymentStatus = 'failed';
    }

    await appointment.save();

    res.status(200).json({
      success: true,
      message: 'Payment failure recorded'
    });
  } catch (error) {
    console.error('Handle payment failure error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to handle payment failure',
      error: error.message
    });
  }
};

// Get payment details for appointment
const getPaymentDetails = async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const userId = req.user._id;

    const appointment = await Appointment.findById(appointmentId)
      .select('payment status patient doctor');

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: 'Appointment not found'
      });
    }

    // Verify user access
    const hasAccess = appointment.patient.toString() === userId.toString() ||
                     appointment.doctor.toString() === userId.toString() ||
                     req.user.role === 'admin';

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        payment: appointment.payment,
        appointmentStatus: appointment.status
      }
    });
  } catch (error) {
    console.error('Get payment details error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch payment details',
      error: error.message
    });
  }
};

// Get payment history (admin only)
const getPaymentHistory = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }

    const { 
      page = 1, 
      limit = 20, 
      status, 
      paymentType, 
      startDate, 
      endDate 
    } = req.query;

    let filter = {};

    if (status) {
      filter.$or = [
        { 'payment.advancePaymentStatus': status },
        { 'payment.finalPaymentStatus': status }
      ];
    }

    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    const appointments = await Appointment.find(filter)
      .populate('patient', 'firstName lastName email')
      .populate('doctor', 'firstName lastName specialization')
      .select('payment status createdAt')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Appointment.countDocuments(filter);

    // Calculate summary statistics
    const totalRevenue = await Appointment.aggregate([
      {
        $match: {
          'payment.finalPaymentStatus': 'paid'
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$payment.totalAmount' }
        }
      }
    ]);

    res.status(200).json({
      success: true,
      data: {
        payments: appointments,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        },
        summary: {
          totalRevenue: totalRevenue[0]?.total || 0
        }
      }
    });
  } catch (error) {
    console.error('Get payment history error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch payment history',
      error: error.message
    });
  }
};

// Webhook handler for Razorpay events
const handleWebhook = async (req, res) => {
  try {
    const signature = req.headers['x-razorpay-signature'];
    const body = JSON.stringify(req.body);

    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET || '')
      .update(body)
      .digest('hex');

    if (signature !== expectedSignature) {
      return res.status(400).json({
        success: false,
        message: 'Invalid signature'
      });
    }

    const event = req.body;

    switch (event.event) {
      case 'payment.captured':
        // Handle successful payment
        console.log('Payment captured:', event.payload.payment.entity);
        break;
      case 'payment.failed':
        // Handle failed payment
        console.log('Payment failed:', event.payload.payment.entity);
        break;
      default:
        console.log('Unhandled webhook event:', event.event);
    }

    res.status(200).json({
      success: true,
      message: 'Webhook processed'
    });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({
      success: false,
      message: 'Webhook processing failed'
    });
  }
};

module.exports = {
  createPaymentOrder,
  verifyPayment,
  handlePaymentFailure,
  getPaymentDetails,
  getPaymentHistory,
  handleWebhook
};
