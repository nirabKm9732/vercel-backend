const express = require('express');
const { body } = require('express-validator');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const {
  getInsurancePlans,
  getInsurancePlanById,
  purchaseInsurance,
  getUserInsurancePolicies,
  fileInsuranceClaim,
  getInsuranceClaims,
  checkInsuranceEligibility
} = require('../controllers/insuranceController');

const router = express.Router();

// Public routes
router.get('/plans', getInsurancePlans);
router.get('/plans/:id', getInsurancePlanById);

// Protected routes
router.use(authenticateToken);

// Purchase insurance
router.post('/purchase', [
  authorizeRoles('patient'),
  body('planId').isMongoId().withMessage('Valid plan ID is required'),
  body('paymentFrequency').optional().isIn(['monthly', 'quarterly', 'annual']).withMessage('Invalid payment frequency')
], purchaseInsurance);

// Get user's insurance policies
router.get('/policies', getUserInsurancePolicies);

// File insurance claim
router.post('/claims', [
  body('policyId').notEmpty().withMessage('Policy ID is required'),
  body('claimType').trim().notEmpty().withMessage('Claim type is required'),
  body('claimAmount').isNumeric().withMessage('Valid claim amount is required'),
  body('serviceDate').isISO8601().withMessage('Valid service date is required'),
  body('providerName').trim().notEmpty().withMessage('Provider name is required')
], fileInsuranceClaim);

// Get insurance claims
router.get('/claims', getInsuranceClaims);

// Check insurance eligibility
router.get('/eligibility', checkInsuranceEligibility);

module.exports = router;
