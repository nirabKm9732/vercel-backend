const express = require('express');
const { body, param } = require('express-validator');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const {
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
} = require('../controllers/medicineController');

const router = express.Router();

// Public routes
router.get('/', getMedicines);
router.get('/categories', getMedicineCategories);

// Protected routes
router.use(authenticateToken);

// Order management routes
router.post('/orders', authorizeRoles('patient', 'doctor'), [
  body('items').isArray({ min: 1 }).withMessage('At least one item is required'),
  body('items.*.medicineId').isMongoId().withMessage('Valid medicine ID required'),
  body('items.*.quantity').isInt({ min: 1 }).withMessage('Quantity must be at least 1'),
  body('deliveryAddress.name').notEmpty().withMessage('Delivery name required'),
  body('deliveryAddress.phone').notEmpty().withMessage('Phone number required'),
  body('deliveryAddress.street').notEmpty().withMessage('Street address required'),
  body('deliveryAddress.city').notEmpty().withMessage('City required'),
  body('deliveryAddress.state').notEmpty().withMessage('State required'),
  body('deliveryAddress.zipCode').notEmpty().withMessage('ZIP code required'),
  body('paymentMethod').optional().isIn(['online', 'cod']).withMessage('Valid payment method required')
], createMedicineOrder);

router.get('/orders/my-orders', getUserOrders);
router.get('/orders/:id', getOrderById);

// Admin/Pharmacy routes
router.get('/orders', authorizeRoles('admin', 'pharmacy'), getAllOrders);
router.put('/orders/:id/status', authorizeRoles('admin', 'pharmacy'), [
  param('id').isMongoId().withMessage('Valid order ID required'),
  body('status').isIn(['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled']).withMessage('Valid status required')
], updateOrderStatus);
router.put('/orders/:id/deliver', authorizeRoles('admin', 'pharmacy'), [
  param('id').isMongoId().withMessage('Valid order ID required')
], markOrderDelivered);

// Cancel order
router.put('/orders/:id/cancel', [
  param('id').isMongoId().withMessage('Valid order ID required'),
  body('reason').optional().notEmpty().withMessage('Cancel reason cannot be empty')
], cancelOrder);

// Keep dynamic route last to avoid capturing '/orders' etc.
router.get('/:id', getMedicineById);

module.exports = router;
