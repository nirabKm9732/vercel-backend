const express = require('express');
const { body } = require('express-validator');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const multer = require('multer');
const {
  getHealthRecords,
  getHealthRecordById,
  createHealthRecord,
  updateHealthRecord,
  deleteHealthRecord,
  uploadAttachment
} = require('../controllers/healthRecordController');

const router = express.Router();
const upload = multer({ dest: 'uploads/' });

// All routes require authentication
router.use(authenticateToken);

// Get all health records
router.get('/', getHealthRecords);

// Get single health record
router.get('/:id', getHealthRecordById);

// Create health record
router.post('/', [
  body('type').isIn(['checkup', 'test_result', 'vaccination', 'surgery', 'medication', 'allergy', 'other']).withMessage('Valid type is required'),
  body('title').trim().notEmpty().withMessage('Title is required'),
  body('description').trim().notEmpty().withMessage('Description is required')
], createHealthRecord);

// Update health record
router.put('/:id', [
  body('title').optional().trim().notEmpty().withMessage('Title cannot be empty'),
  body('description').optional().trim().notEmpty().withMessage('Description cannot be empty')
], updateHealthRecord);

// Delete health record
router.delete('/:id', deleteHealthRecord);

// Upload attachment
router.post('/:id/attachments', upload.single('file'), uploadAttachment);

module.exports = router;







