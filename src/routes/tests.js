const express = require('express');
const { body, param } = require('express-validator');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const {
  getTestPackages,
  getTestPackageById,
  bookTestAppointment,
  getUserTestBookings,
  getTestBookingById,
  updateBookingStatus,
  uploadTestReport,
  cancelTestBooking,
  getLabAssistantBookings
} = require('../controllers/testController');

const router = express.Router();

// Public routes
router.get('/', getTestPackages);
router.get('/:id', getTestPackageById);

// Protected routes
router.use(authenticateToken);

// Test booking routes (patients)
router.post('/bookings', authorizeRoles('patient'), [
  body('testPackageId').isMongoId().withMessage('Valid test package ID required'),
  body('appointmentDate').isISO8601().withMessage('Valid appointment date required'),
  body('type').isIn(['home_visit', 'lab_visit']).withMessage('Valid booking type required'),
  body('homeAddress').if(body('type').equals('home_visit')).notEmpty().withMessage('Home address required for home visit'),
  body('selectedLab').if(body('type').equals('lab_visit')).notEmpty().withMessage('Lab selection required for lab visit')
], bookTestAppointment);

router.get('/bookings/my-bookings', getUserTestBookings);
router.get('/bookings/:id', getTestBookingById);

// Cancel booking
router.put('/bookings/:id/cancel', [
  param('id').isMongoId().withMessage('Valid booking ID required'),
  body('reason').optional().notEmpty().withMessage('Cancel reason cannot be empty')
], cancelTestBooking);

// Lab assistant routes
router.get('/lab/bookings', authorizeRoles('lab_assistant'), getLabAssistantBookings);

router.put('/bookings/:id/status', authorizeRoles('lab_assistant', 'admin'), [
  param('id').isMongoId().withMessage('Valid booking ID required'),
  body('status').isIn(['pending', 'confirmed', 'sample_collected', 'processing', 'completed', 'cancelled']).withMessage('Valid status required')
], updateBookingStatus);

router.post('/bookings/:id/report', authorizeRoles('lab_assistant', 'admin'), [
  param('id').isMongoId().withMessage('Valid booking ID required'),
  body('reportUrl').isURL().withMessage('Valid report URL required')
], uploadTestReport);

module.exports = router;
