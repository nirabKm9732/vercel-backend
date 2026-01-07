const express = require('express');
const { body } = require('express-validator');
const rateLimit = require('express-rate-limit');
const { authenticateToken } = require('../middleware/auth');
const { 
  register, 
  login, 
  getProfile, 
  logout, 
  verifyToken,
  refreshToken
} = require('../controllers/authController');

const router = express.Router();

// Stricter rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 requests per windowMs for auth
  message: 'Too many authentication attempts. Please try again later.',
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
});

// Register user
router.post('/register', authLimiter, [
  body('firstName').trim().notEmpty().withMessage('First name is required'),
  body('lastName').trim().notEmpty().withMessage('Last name is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('phone').isMobilePhone().withMessage('Valid phone number is required'),
  body('role').isIn(['patient', 'doctor', 'hospital', 'lab_assistant']).withMessage('Valid role is required'),
], register);

// Login user
router.post('/login', authLimiter, [
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password is required'),
], login);

// Get current user profile
router.get('/profile', authenticateToken, getProfile);

// Logout (client-side token removal)
router.post('/logout', authenticateToken, logout);

// Verify token endpoint
router.get('/verify', authenticateToken, verifyToken);

// Refresh token endpoint (public but requires valid refresh token)
router.post('/refresh', [
  body('refreshToken').notEmpty().withMessage('Refresh token is required')
], refreshToken);

module.exports = router;
