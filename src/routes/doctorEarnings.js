const express = require('express');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const {
  getEarningsSummary,
  getPaymentHistory,
  getEarningsStats
} = require('../controllers/doctorEarningsController');

const router = express.Router();

// All routes require authentication and doctor role
router.use(authenticateToken);
router.use(authorizeRoles('doctor'));

// Get earnings summary
router.get('/summary', getEarningsSummary);

// Get payment history
router.get('/history', getPaymentHistory);

// Get earnings statistics
router.get('/stats', getEarningsStats);

module.exports = router;







