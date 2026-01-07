const express = require('express');
const { body } = require('express-validator');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const {
  getTemplates,
  getTemplateById,
  createTemplate,
  updateTemplate,
  deleteTemplate
} = require('../controllers/prescriptionTemplateController');

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// Get all templates for the doctor
router.get('/', authorizeRoles('doctor'), getTemplates);

// Get single template by ID
router.get('/:id', authorizeRoles('doctor'), getTemplateById);

// Create new template
router.post('/', [
  authorizeRoles('doctor'),
  body('name').trim().notEmpty().withMessage('Template name is required'),
  body('diagnosis').trim().notEmpty().withMessage('Diagnosis is required'),
  body('advice').trim().notEmpty().withMessage('Advice is required')
], createTemplate);

// Update template
router.put('/:id', [
  authorizeRoles('doctor'),
  body('name').optional().trim().notEmpty().withMessage('Template name cannot be empty'),
  body('diagnosis').optional().trim().notEmpty().withMessage('Diagnosis cannot be empty'),
  body('advice').optional().trim().notEmpty().withMessage('Advice cannot be empty')
], updateTemplate);

// Delete template
router.delete('/:id', authorizeRoles('doctor'), deleteTemplate);

module.exports = router;







