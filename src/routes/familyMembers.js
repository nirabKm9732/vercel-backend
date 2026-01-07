const express = require('express');
const { body } = require('express-validator');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const {
  getFamilyMembers,
  getFamilyMemberById,
  createFamilyMember,
  updateFamilyMember,
  deleteFamilyMember
} = require('../controllers/familyMemberController');

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// Get all family members
router.get('/', getFamilyMembers);

// Get single family member
router.get('/:id', getFamilyMemberById);

// Create family member
router.post('/', [
  body('firstName').trim().notEmpty().withMessage('First name is required'),
  body('lastName').trim().notEmpty().withMessage('Last name is required'),
  body('relationship').isIn(['spouse', 'child', 'parent', 'sibling', 'other']).withMessage('Valid relationship is required'),
  body('dateOfBirth').isISO8601().withMessage('Valid date of birth is required'),
  body('gender').isIn(['male', 'female', 'other']).withMessage('Valid gender is required')
], createFamilyMember);

// Update family member
router.put('/:id', [
  body('firstName').optional().trim().notEmpty().withMessage('First name cannot be empty'),
  body('lastName').optional().trim().notEmpty().withMessage('Last name cannot be empty')
], updateFamilyMember);

// Delete family member
router.delete('/:id', deleteFamilyMember);

module.exports = router;







