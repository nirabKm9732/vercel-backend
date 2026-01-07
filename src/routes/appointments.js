const express = require('express');
const { body, param } = require('express-validator');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const {
  createAppointment,
  getUserAppointments,
  getAppointmentById,
  updateAppointmentStatus,
  rescheduleAppointment,
  addAppointmentFeedback,
  getDoctorAvailability,
  payAdvance
} = require('../controllers/appointmentController');

const router = express.Router();

// Public routes
router.get('/doctors/:doctorId/availability', getDoctorAvailability);

// Protected routes
router.use(authenticateToken);

// Create appointment (patient only)
router.post('/', authorizeRoles('patient'), [
  body('doctorId').isMongoId().withMessage('Valid doctor ID required'),
  body('appointmentDate').isISO8601().withMessage('Valid date required'),
  body('timeSlot.startTime').notEmpty().withMessage('Start time required'),
  body('timeSlot.endTime').notEmpty().withMessage('End time required'),
  body('symptoms').notEmpty().withMessage('Symptoms are required'),
  body('urgency').optional().isIn(['low', 'medium', 'high', 'emergency']),
  body('consultationType').optional().isIn(['video', 'in_person'])
], createAppointment);

// Get user's appointments (patient/doctor)
router.get('/', getUserAppointments);

// Get appointment by ID
router.get('/:id', [
  param('id').isMongoId().withMessage('Valid appointment ID required')
], getAppointmentById);

// Update appointment status (doctor only)
router.put('/:id/status', authorizeRoles('doctor'), [
  param('id').isMongoId().withMessage('Valid appointment ID required'),
  body('status').isIn(['confirmed', 'completed', 'cancelled', 'no_show']).withMessage('Valid status required'),
  body('cancelReason').optional().notEmpty().withMessage('Cancel reason required when cancelling')
], updateAppointmentStatus);

// Pay advance (patient only)
router.put('/:id/pay-advance', authorizeRoles('patient'), [
  param('id').isMongoId().withMessage('Valid appointment ID required')
], payAdvance);

// Reschedule appointment
router.put('/:id/reschedule', [
  param('id').isMongoId().withMessage('Valid appointment ID required'),
  body('appointmentDate').isISO8601().withMessage('Valid date required'),
  body('timeSlot.startTime').notEmpty().withMessage('Start time required'),
  body('timeSlot.endTime').notEmpty().withMessage('End time required')
], rescheduleAppointment);

// Add feedback (patient only)
router.post('/:id/feedback', authorizeRoles('patient'), [
  param('id').isMongoId().withMessage('Valid appointment ID required'),
  body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),
  body('comment').optional().trim().notEmpty().withMessage('Comment cannot be empty')
], addAppointmentFeedback);

module.exports = router;
