const express = require('express');
const { body, param } = require('express-validator');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const {
  createAppointmentPayment,
  createMedicinePayment,
  createTestPayment,
  createHospitalPayment,
  verifyPayment,
  handlePaymentFailure,
  getPaymentStatus,
  getPaymentAnalytics,
  handleWebhook
} = require('../controllers/paymentController');

const router = express.Router();

// Webhook endpoint (no authentication required)
router.post('/webhook', handleWebhook);

// Protected routes
router.use(authenticateToken);

// Create payment orders
router.post('/create-order', [
  body('appointmentId').isMongoId().withMessage('Valid appointment ID required'),
  body('paymentType').isIn(['advance', 'remaining', 'full']).withMessage('Valid payment type required')
], createAppointmentPayment);

router.post('/create-order/medicine', [
  body('orderId').isMongoId().withMessage('Valid medicine order ID required')
], createMedicinePayment);

router.post('/create-order/test', [
  body('bookingId').isMongoId().withMessage('Valid test booking ID required')
], createTestPayment);

router.post('/create-order/hospital', [
  body('bookingId').isMongoId().withMessage('Valid hospital booking ID required')
], createHospitalPayment);

// Verify payment (generic)
router.post('/verify', [
  body('razorpay_order_id').notEmpty().withMessage('Order ID required'),
  body('razorpay_payment_id').notEmpty().withMessage('Payment ID required'),
  body('razorpay_signature').notEmpty().withMessage('Signature required'),
  body('type').isIn(['appointment', 'medicine', 'test', 'hospital']).withMessage('Valid type required'),
  body('paymentType').optional().isIn(['advance', 'remaining', 'full']).withMessage('Valid appointment payment type')
], verifyPayment);

// Handle payment failure (generic)
router.post('/failure', [
  body('razorpay_order_id').notEmpty().withMessage('Order ID required'),
  body('type').isIn(['appointment', 'medicine', 'test', 'hospital']).withMessage('Valid type required'),
  body('paymentType').optional().isIn(['advance', 'remaining', 'full'])
], handlePaymentFailure);

// Get payment details for specific appointment
router.get('/appointment/:appointmentId', [
  param('appointmentId').isMongoId().withMessage('Valid appointment ID required')
], getPaymentStatus);

// Get payment history (admin only)
router.get('/history', authorizeRoles('admin'), getPaymentAnalytics);

module.exports = router;
