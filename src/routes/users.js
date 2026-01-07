const express = require('express');
const { body } = require('express-validator');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const {
  getDoctors,
  getDoctorById,
  updateProfile,
  updateDoctorAvailability,
  getDashboardData,
  searchUsers
} = require('../controllers/userController');

const router = express.Router();

// Public routes
router.get('/doctors', getDoctors);
router.get('/doctors/:id', getDoctorById);

// Protected routes
router.use(authenticateToken);

// User profile routes
router.get('/dashboard', getDashboardData);
router.put('/profile', [
  body('firstName').optional().trim().notEmpty().withMessage('First name cannot be empty'),
  body('lastName').optional().trim().notEmpty().withMessage('Last name cannot be empty'),
  body('phone').optional().isMobilePhone().withMessage('Valid phone number required')
], updateProfile);

// Doctor-specific routes
router.put('/availability', authorizeRoles('doctor'), updateDoctorAvailability);

// Admin routes
router.get('/search', authorizeRoles('admin'), searchUsers);

module.exports = router;
