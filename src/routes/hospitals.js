const express = require('express');
const router = express.Router();
const { 
  getHospitals,
  getHospitalById,
  createAdmissionRequest,
  getUserBookings,
  updateAdmissionStatus,
  uploadMedicalDocuments,
  getHospitalDashboard
} = require('../controllers/hospitalController');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { body } = require('express-validator');

// Validation rules for admission request
const validateAdmissionRequest = [
  body('hospitalId')
    .isMongoId()
    .withMessage('Valid hospital ID is required'),
  body('admissionDate')
    .isISO8601()
    .toDate()
    .withMessage('Valid admission date is required'),
  body('department')
    .notEmpty()
    .trim()
    .withMessage('Department is required'),
  body('roomType')
    .isIn(['general', 'private', 'semi_private', 'icu', 'emergency'])
    .withMessage('Valid room type is required'),
  body('reasonForAdmission')
    .notEmpty()
    .trim()
    .withMessage('Reason for admission is required'),
  body('urgency')
    .optional()
    .isIn(['routine', 'urgent', 'emergency'])
    .withMessage('Valid urgency level required'),
  body('estimatedStayDuration')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Estimated stay duration must be a positive number'),
  body('referringDoctorId')
    .optional()
    .isMongoId()
    .withMessage('Valid doctor ID is required if provided')
];

// Public routes
router.get('/', getHospitals); // Get all hospitals with filters
router.get('/:id', getHospitalById); // Get hospital details by ID

// Protected routes - require authentication
router.use(authenticateToken);

// Patient routes
router.post('/admission-request', validateAdmissionRequest, createAdmissionRequest); // Create admission request
router.get('/bookings/my-bookings', getUserBookings); // Get user's bookings (patient/hospital)

// Hospital/Admin routes
router.put('/:id/status', [
  body('status')
    .isIn(['pending', 'confirmed', 'admitted', 'discharged', 'cancelled'])
    .withMessage('Valid status is required'),
  body('bedNumber')
    .optional()
    .notEmpty()
    .withMessage('Bed number cannot be empty if provided'),
  body('notes')
    .optional()
    .trim()
], updateAdmissionStatus);

router.post('/:id/medical-record', [
  body('recordType')
    .isIn(['admission_note', 'progress_note', 'discharge_summary', 'test_result', 'medication_chart'])
    .withMessage('Valid record type is required'),
  body('content')
    .notEmpty()
    .trim()
    .withMessage('Record content is required')
], uploadMedicalDocuments);

// Hospital dashboard (hospital role only)
router.get('/dashboard/statistics', getHospitalDashboard);

module.exports = router;
