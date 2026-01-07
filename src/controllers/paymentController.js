const Razorpay = require('razorpay');
const crypto = require('crypto');
const Appointment = require('../models/Appointment');
const Medicine = require('../models/Medicine');
const MedicineOrder = require('../models/MedicineOrder');
const { TestPackage, TestBooking } = require('../models/TestPackage');
const { Hospital, HospitalBooking } = require('../models/Hospital');
const { validationResult } = require('express-validator');

// Initialize Razorpay
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// Create Razorpay order for appointment
const createAppointmentPayment = async (req, res) => {
  try {
    const { appointmentId, paymentType = 'full' } = req.body;

    // Basic configuration checks for Razorpay
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      return res.status(500).json({
        success: false,
        message: 'Payment gateway not configured. Please set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in backend .env',
        error: 'MISSING_RAZORPAY_CONFIG'
      });
    }
    
    const appointment = await Appointment.findOne({
      _id: appointmentId,
      patient: req.user._id
    }).populate('doctor', 'firstName lastName consultationFee');

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: 'Appointment not found'
      });
    }

    if (appointment.payment.finalPaymentStatus === 'paid' && paymentType !== 'advance') {
      return res.status(400).json({
        success: false,
        message: 'Payment already completed for this appointment'
      });
    }

    let amount;
    let receipt;

    const appointmentIdStr = (appointmentId || '').toString();
    if (paymentType === 'advance') {
      if (appointment.payment.advancePaymentStatus === 'paid') {
        return res.status(400).json({
          success: false,
          message: 'Advance payment already completed'
        });
      }
      amount = appointment.payment.advanceAmount;
      receipt = `appt_adv_${appointmentIdStr.slice(-20)}`;
    } else if (paymentType === 'remaining') {
      if (appointment.payment.advancePaymentStatus !== 'paid') {
        return res.status(400).json({
          success: false,
          message: 'Advance payment must be completed first'
        });
      }
      if (appointment.status !== 'confirmed') {
        return res.status(400).json({
          success: false,
          message: 'Doctor must confirm the appointment before paying the remaining amount'
        });
      }
      if (!appointment.payment.remainingAmount || appointment.payment.remainingAmount <= 0) {
        return res.status(400).json({
          success: false,
          message: 'No remaining balance is due for this appointment'
        });
      }
      amount = appointment.payment.remainingAmount;
      receipt = `appt_rem_${appointmentIdStr.slice(-20)}`;
    } else {
      // Full payment
      if (appointment.payment.advancePaymentStatus === 'paid') {
        return res.status(400).json({
          success: false,
          message: 'Advance already collected. Please pay the remaining balance instead.'
        });
      }
      amount = appointment.payment.totalAmount;
      receipt = `appt_full_${appointmentIdStr.slice(-20)}`;
    }

    // Validate amount to avoid gateway errors
    if (!amount || isNaN(amount) || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid payment amount for this appointment. Please contact support.',
        error: 'INVALID_AMOUNT'
      });
    }

    // Razorpay minimum amount is ₹1 (i.e., 100 paise). Also ensure integer paise.
    const amountRupees = Math.max(1, Math.round(amount)); // enforce minimum ₹1 and round rupees
    const amountPaise = amountRupees * 100;

    let order;
    try {
      order = await razorpay.orders.create({
        amount: amountPaise, // Integer paise, min 100
        currency: 'INR',
        receipt,
        notes: {
          type: 'appointment',
          paymentType,
          appointmentId: appointmentIdStr,
          patientId: req.user._id.toString(),
          doctorId: appointment.doctor._id.toString()
        }
      });
    } catch (gatewayError) {
      console.error('Razorpay order creation failed:', gatewayError?.error || gatewayError);
      return res.status(502).json({
        success: false,
        message: 'Payment gateway error while creating order. Please verify Razorpay sandbox keys and try again.',
        error: gatewayError?.error?.description || gatewayError?.message || 'RAZORPAY_ORDER_CREATE_FAILED'
      });
    }

    // Update appointment with order details
    appointment.payment.orderId = order.id;
    await appointment.save();

    res.status(200).json({
      success: true,
      data: {
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        key: process.env.RAZORPAY_KEY_ID,
        appointmentDetails: {
          id: appointment._id,
          doctorName: `${appointment.doctor.firstName} ${appointment.doctor.lastName}`,
          appointmentDate: appointment.appointmentDate,
          timeSlot: appointment.timeSlot,
          paymentType
        }
      }
    });
  } catch (error) {
    console.error('Create appointment payment error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create payment order',
      error: error.message
    });
  }
};

// Create Razorpay order for medicine order
const createMedicinePayment = async (req, res) => {
  try {
    const { orderId } = req.body;
    
    const order = await MedicineOrder.findOne({
      _id: orderId,
      patient: req.user._id
    }).populate('items.medicine', 'name');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Medicine order not found'
      });
    }

    if (order.payment.status === 'paid') {
      return res.status(400).json({
        success: false,
        message: 'Payment already completed for this order'
      });
    }

    const amount = order.pricing.total * 100; // Convert to paise

    const razorpayOrder = await razorpay.orders.create({
      amount,
      currency: 'INR',
      receipt: `medicine_${orderId}`,
      notes: {
        type: 'medicine',
        orderId: orderId.toString(),
        patientId: req.user._id.toString(),
        itemsCount: order.items.length
      }
    });

    // Update order with razorpay order details
    order.payment.orderId = razorpayOrder.id;
    await order.save();

    res.status(200).json({
      success: true,
      data: {
        orderId: razorpayOrder.id,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency,
        key: process.env.RAZORPAY_KEY_ID,
        orderDetails: {
          id: order._id,
          itemsCount: order.items.length,
          total: order.pricing.total
        }
      }
    });
  } catch (error) {
    console.error('Create medicine payment error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create payment order',
      error: error.message
    });
  }
};

// Create Razorpay order for test booking
const createTestPayment = async (req, res) => {
  try {
    const { bookingId } = req.body;

    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      return res.status(500).json({
        success: false,
        message: 'Payment gateway not configured. Please set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in backend .env',
        error: 'MISSING_RAZORPAY_CONFIG'
      });
    }

    const booking = await TestBooking.findOne({
      _id: bookingId,
      patient: req.user._id
    }).populate('testPackage', 'name');

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Test booking not found'
      });
    }

    if (booking.payment.status === 'paid') {
      return res.status(400).json({
        success: false,
        message: 'Payment already completed for this booking'
      });
    }

    const amount = booking.payment.amount;

    if (!amount || isNaN(amount) || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid payment amount for this booking. Please contact support.',
        error: 'INVALID_AMOUNT'
      });
    }

    const amountRupees = Math.max(1, Math.round(amount));
    const amountPaise = amountRupees * 100;
    const bookingIdStr = (bookingId || '').toString();
    const receipt = `test_${bookingIdStr.slice(-28)}`; // keep under 40 characters

    let order;
    try {
      order = await razorpay.orders.create({
        amount: amountPaise,
        currency: 'INR',
        receipt,
        notes: {
          type: 'test',
          bookingId: bookingIdStr,
          patientId: req.user._id.toString(),
          testPackageId: booking.testPackage?._id?.toString?.() || ''
        }
      });
    } catch (gatewayError) {
      console.error('Razorpay order creation failed (test):', gatewayError?.error || gatewayError);
      return res.status(502).json({
        success: false,
        message: 'Payment gateway error while creating order. Please verify Razorpay sandbox keys and try again.',
        error: gatewayError?.error?.description || gatewayError?.message || 'RAZORPAY_ORDER_CREATE_FAILED'
      });
    }

    booking.payment.orderId = order.id;
    booking.payment.amount = amountRupees; // store normalized amount
    await booking.save();

    res.status(200).json({
      success: true,
      data: {
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        key: process.env.RAZORPAY_KEY_ID,
        bookingDetails: {
          id: booking._id,
          testName: booking.testPackage?.name,
          appointmentDate: booking.appointmentDate,
          type: booking.type
        }
      }
    });
  } catch (error) {
    console.error('Create test payment error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create payment order',
      error: error.message
    });
  }
};

// Create Razorpay order for hospital booking
const createHospitalPayment = async (req, res) => {
  try {
    const { bookingId } = req.body;
    
    const booking = await HospitalBooking.findOne({
      _id: bookingId,
      patient: req.user._id
    }).populate('hospital', 'name');

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Hospital booking not found'
      });
    }

    if (booking.payment.status === 'advance_paid' || booking.payment.status === 'fully_paid') {
      return res.status(400).json({
        success: false,
        message: 'Payment already completed for this booking'
      });
    }

    const amount = booking.payment.advanceAmount * 100; // Convert to paise

    const order = await razorpay.orders.create({
      amount,
      currency: 'INR',
      receipt: `hospital_${bookingId}`,
      notes: {
        type: 'hospital',
        bookingId: bookingId.toString(),
        patientId: req.user._id.toString(),
        hospitalId: booking.hospital._id.toString()
      }
    });

    // Update booking with order details
    booking.payment.orderId = order.id;
    await booking.save();

    res.status(200).json({
      success: true,
      data: {
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        key: process.env.RAZORPAY_KEY_ID,
        bookingDetails: {
          id: booking._id,
          hospitalName: booking.hospital.name,
          admissionDate: booking.admissionDate,
          bedType: booking.bedType,
          advanceAmount: booking.payment.advanceAmount
        }
      }
    });
  } catch (error) {
    console.error('Create hospital payment error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create payment order',
      error: error.message
    });
  }
};

// Verify payment and update status
const verifyPayment = async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      type, // appointment, medicine, test, hospital
      paymentType // for appointments: advance, remaining, full
    } = req.body;

    // Verify signature
    const sign = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSign = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(sign.toString())
      .digest('hex');

    if (razorpay_signature !== expectedSign) {
      return res.status(400).json({
        success: false,
        message: 'Invalid payment signature'
      });
    }

    // Update payment status based on type
    let updatedRecord;
    switch (type) {
      case 'appointment':
        const updateFields = {
          'payment.paymentId': razorpay_payment_id
        };

        if (paymentType === 'advance') {
          updateFields['payment.advancePaymentStatus'] = 'paid';
        } else if (paymentType === 'remaining') {
          updateFields['payment.finalPaymentStatus'] = 'paid';
          updateFields['payment.remainingAmount'] = 0;
        } else {
          // Full payment
          updateFields['payment.advancePaymentStatus'] = 'paid';
          updateFields['payment.finalPaymentStatus'] = 'paid';
          updateFields['payment.remainingAmount'] = 0;
        }

        updatedRecord = await Appointment.findOneAndUpdate(
          { 'payment.orderId': razorpay_order_id },
          updateFields,
          { new: true }
        ).populate('doctor', 'firstName lastName');
        break;

      case 'medicine':
        updatedRecord = await MedicineOrder.findOneAndUpdate(
          { 'payment.orderId': razorpay_order_id },
          {
            'payment.status': 'paid',
            'payment.paymentId': razorpay_payment_id,
            'payment.paidAt': new Date(),
            status: 'confirmed'
          },
          { new: true }
        );
        break;

      case 'test':
        updatedRecord = await TestBooking.findOneAndUpdate(
          { 'payment.orderId': razorpay_order_id },
          {
            'payment.status': 'paid',
            'payment.paymentId': razorpay_payment_id,
            'payment.paidAt': new Date(),
            status: 'confirmed'
          },
          { new: true }
        ).populate('testPackage', 'name');
        break;

      case 'hospital':
        updatedRecord = await HospitalBooking.findOneAndUpdate(
          { 'payment.orderId': razorpay_order_id },
          {
            'payment.status': 'advance_paid',
            'payment.paymentId': razorpay_payment_id,
            status: 'confirmed' // Move to confirmed status for hospital review
          },
          { new: true }
        ).populate('hospital', 'name');
        break;

      default:
        return res.status(400).json({
          success: false,
          message: 'Invalid payment type'
        });
    }

    if (!updatedRecord) {
      return res.status(404).json({
        success: false,
        message: 'Record not found for this payment'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Payment verified successfully',
      data: {
        type,
        paymentType,
        paymentId: razorpay_payment_id,
        record: updatedRecord
      }
    });
  } catch (error) {
    console.error('Verify payment error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify payment',
      error: error.message
    });
  }
};

// Handle payment failure
const handlePaymentFailure = async (req, res) => {
  try {
    const { razorpay_order_id, type, paymentType, reason } = req.body;

    let updatedRecord;
    switch (type) {
      case 'appointment':
        const updateFields = {};
        if (paymentType === 'advance') {
          updateFields['payment.advancePaymentStatus'] = 'failed';
        } else if (paymentType === 'remaining') {
          updateFields['payment.finalPaymentStatus'] = 'failed';
        } else {
          updateFields['payment.advancePaymentStatus'] = 'failed';
          updateFields['payment.finalPaymentStatus'] = 'failed';
        }

        updatedRecord = await Appointment.findOneAndUpdate(
          { 'payment.orderId': razorpay_order_id },
          {
            ...updateFields,
            paymentFailureReason: reason
          },
          { new: true }
        );
        break;

      case 'medicine':
        updatedRecord = await MedicineOrder.findOneAndUpdate(
          { 'payment.orderId': razorpay_order_id },
          {
            'payment.status': 'failed',
            status: 'payment_failed',
            paymentFailureReason: reason
          },
          { new: true }
        );
        break;

      case 'test':
        updatedRecord = await TestBooking.findOneAndUpdate(
          { 'payment.orderId': razorpay_order_id },
          {
            'payment.status': 'failed',
            status: 'payment_failed',
            paymentFailureReason: reason
          },
          { new: true }
        );
        break;

      case 'hospital':
        updatedRecord = await HospitalBooking.findOneAndUpdate(
          { 'payment.orderId': razorpay_order_id },
          {
            'payment.status': 'failed',
            status: 'payment_failed',
            paymentFailureReason: reason
          },
          { new: true }
        );
        break;

      default:
        return res.status(400).json({
          success: false,
          message: 'Invalid payment type'
        });
    }

    if (!updatedRecord) {
      return res.status(404).json({
        success: false,
        message: 'Record not found for this payment'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Payment failure recorded',
      data: {
        type,
        record: updatedRecord
      }
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

// Get payment status
const getPaymentStatus = async (req, res) => {
  try {
    const { type, id } = req.params;

    let record;
    switch (type) {
      case 'appointment':
        record = await Appointment.findOne({
          _id: id,
          patient: req.user._id
        }).select('payment status');
        break;

      case 'medicine':
        record = await MedicineOrder.findOne({
          _id: id,
          patient: req.user._id
        }).select('payment status pricing');
        break;

      case 'test':
        record = await TestBooking.findOne({
          _id: id,
          patient: req.user._id
        }).select('payment status');
        break;

      case 'hospital':
        record = await HospitalBooking.findOne({
          _id: id,
          patient: req.user._id
        }).select('payment status');
        break;

      default:
        return res.status(400).json({
          success: false,
          message: 'Invalid type'
        });
    }

    if (!record) {
      return res.status(404).json({
        success: false,
        message: 'Record not found'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        type,
        paymentStatus: record.payment,
        record
      }
    });
  } catch (error) {
    console.error('Get payment status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch payment status',
      error: error.message
    });
  }
};

// Refund payment (admin only)
const refundPayment = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Only admins can initiate refunds'
      });
    }

    const { paymentId, amount, reason } = req.body;

    // Initiate refund with Razorpay
    const refund = await razorpay.payments.refund(paymentId, {
      amount: amount * 100, // Convert to paise
      notes: {
        reason,
        refunded_by: req.user._id.toString()
      }
    });

    res.status(200).json({
      success: true,
      message: 'Refund initiated successfully',
      data: {
        refundId: refund.id,
        amount: refund.amount / 100, // Convert back to rupees
        status: refund.status
      }
    });
  } catch (error) {
    console.error('Refund payment error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to initiate refund',
      error: error.message
    });
  }
};

// Get payment analytics (admin only)
const getPaymentAnalytics = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const { startDate, endDate } = req.query;
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    const [appointmentStats, medicineStats, testStats, hospitalStats] = await Promise.all([
      // Appointment payments
      Appointment.aggregate([
        {
          $match: {
            createdAt: { $gte: start, $lte: end },
            'payment.finalPaymentStatus': 'paid'
          }
        },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: '$payment.totalAmount' },
            totalTransactions: { $sum: 1 }
          }
        }
      ]),

      // Medicine payments
      MedicineOrder.aggregate([
        {
          $match: {
            'payment.paidAt': { $gte: start, $lte: end },
            'payment.status': 'paid'
          }
        },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: '$pricing.total' },
            totalTransactions: { $sum: 1 }
          }
        }
      ]),

      // Test payments
      TestBooking.aggregate([
        {
          $match: {
            'payment.paidAt': { $gte: start, $lte: end },
            'payment.status': 'paid'
          }
        },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: '$payment.amount' },
            totalTransactions: { $sum: 1 }
          }
        }
      ]),

      // Hospital payments
      HospitalBooking.aggregate([
        {
          $match: {
            createdAt: { $gte: start, $lte: end },
            'payment.status': { $in: ['advance_paid', 'fully_paid'] }
          }
        },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: '$payment.advanceAmount' },
            totalTransactions: { $sum: 1 }
          }
        }
      ])
    ]);

    const analytics = {
      appointments: appointmentStats[0] || { totalRevenue: 0, totalTransactions: 0 },
      medicines: medicineStats[0] || { totalRevenue: 0, totalTransactions: 0 },
      tests: testStats[0] || { totalRevenue: 0, totalTransactions: 0 },
      hospitals: hospitalStats[0] || { totalRevenue: 0, totalTransactions: 0 }
    };

    const totalRevenue = Object.values(analytics).reduce((sum, stat) => sum + stat.totalRevenue, 0);
    const totalTransactions = Object.values(analytics).reduce((sum, stat) => sum + stat.totalTransactions, 0);

    res.status(200).json({
      success: true,
      data: {
        period: { startDate: start, endDate: end },
        summary: { totalRevenue, totalTransactions },
        breakdown: analytics
      }
    });
  } catch (error) {
    console.error('Get payment analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch payment analytics',
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
        console.log('Payment captured:', event.payload.payment.entity);
        break;
      case 'payment.failed':
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
  createAppointmentPayment,
  createMedicinePayment,
  createTestPayment,
  createHospitalPayment,
  verifyPayment,
  handlePaymentFailure,
  getPaymentStatus,
  refundPayment,
  getPaymentAnalytics,
  handleWebhook
};
