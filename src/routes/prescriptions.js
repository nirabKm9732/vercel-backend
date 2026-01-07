const express = require('express');
const { body } = require('express-validator');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { uploadConfig } = require('../config/cloudinary');
const {
  createPrescription,
  uploadPrescriptionImage,
  getUserPrescriptions,
  getPrescriptionById,
  downloadPrescription,
  updatePrescription,
  deactivatePrescription
} = require('../controllers/prescriptionController');

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// Get user's prescriptions
router.get('/', getUserPrescriptions);

// Get prescription by ID
router.get('/:id', getPrescriptionById);

// Download prescription
router.get('/:id/download', downloadPrescription);

// Create prescription (doctors only)
router.post('/', [
  authorizeRoles('doctor'),
  body('appointmentId').isMongoId().withMessage('Valid appointment ID is required'),
  body('diagnosis').trim().notEmpty().withMessage('Diagnosis is required'),
  body('advice').optional().trim()
], createPrescription);

// Upload prescription image - uses CloudinaryStorage for direct upload
router.post('/:id/upload', (req, res, next) => {
  uploadConfig.prescription(req, res, (err) => {
    if (err) {
      console.error('Multer upload error:', err);
      return res.status(400).json({
        success: false,
        message: err.message || 'File upload failed',
        error: err.toString()
      });
    }
    next();
  });
}, uploadPrescriptionImage);

// Update prescription (doctors only)
router.put('/:id', [
  authorizeRoles('doctor'),
  body('diagnosis').optional().trim().notEmpty().withMessage('Diagnosis cannot be empty')
], updatePrescription);

// Deactivate prescription (doctors only)
router.put('/:id/deactivate', [
  authorizeRoles('doctor'),
  body('reason').trim().notEmpty().withMessage('Reason is required')
], deactivatePrescription);

module.exports = router;
