const FamilyMember = require('../models/FamilyMember');
const { validationResult } = require('express-validator');

// Get all family members for a patient
const getFamilyMembers = async (req, res) => {
  try {
    const familyMembers = await FamilyMember.find({
      patient: req.user._id,
      isActive: true
    }).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: { familyMembers }
    });
  } catch (error) {
    console.error('Get family members error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch family members',
      error: error.message
    });
  }
};

// Get single family member by ID
const getFamilyMemberById = async (req, res) => {
  try {
    const { id } = req.params;

    const familyMember = await FamilyMember.findOne({
      _id: id,
      patient: req.user._id
    });

    if (!familyMember) {
      return res.status(404).json({
        success: false,
        message: 'Family member not found'
      });
    }

    res.status(200).json({
      success: true,
      data: { familyMember }
    });
  } catch (error) {
    console.error('Get family member error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch family member',
      error: error.message
    });
  }
};

// Create new family member
const createFamilyMember = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: errors.array()
      });
    }

    const {
      firstName,
      lastName,
      relationship,
      dateOfBirth,
      gender,
      phone,
      email,
      bloodGroup,
      allergies,
      medicalHistory,
      emergencyContact
    } = req.body;

    const familyMember = new FamilyMember({
      patient: req.user._id,
      firstName,
      lastName,
      relationship,
      dateOfBirth,
      gender,
      phone,
      email,
      bloodGroup: bloodGroup || 'Unknown',
      allergies: allergies || [],
      medicalHistory: medicalHistory || [],
      emergencyContact: emergencyContact || false
    });

    await familyMember.save();

    res.status(201).json({
      success: true,
      message: 'Family member added successfully',
      data: { familyMember }
    });
  } catch (error) {
    console.error('Create family member error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add family member',
      error: error.message
    });
  }
};

// Update family member
const updateFamilyMember = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: errors.array()
      });
    }

    const { id } = req.params;
    const {
      firstName,
      lastName,
      relationship,
      dateOfBirth,
      gender,
      phone,
      email,
      bloodGroup,
      allergies,
      medicalHistory,
      emergencyContact
    } = req.body;

    const familyMember = await FamilyMember.findOne({
      _id: id,
      patient: req.user._id
    });

    if (!familyMember) {
      return res.status(404).json({
        success: false,
        message: 'Family member not found'
      });
    }

    // Update fields
    if (firstName !== undefined) familyMember.firstName = firstName;
    if (lastName !== undefined) familyMember.lastName = lastName;
    if (relationship !== undefined) familyMember.relationship = relationship;
    if (dateOfBirth !== undefined) familyMember.dateOfBirth = dateOfBirth;
    if (gender !== undefined) familyMember.gender = gender;
    if (phone !== undefined) familyMember.phone = phone;
    if (email !== undefined) familyMember.email = email;
    if (bloodGroup !== undefined) familyMember.bloodGroup = bloodGroup;
    if (allergies !== undefined) familyMember.allergies = allergies;
    if (medicalHistory !== undefined) familyMember.medicalHistory = medicalHistory;
    if (emergencyContact !== undefined) familyMember.emergencyContact = emergencyContact;

    await familyMember.save();

    res.status(200).json({
      success: true,
      message: 'Family member updated successfully',
      data: { familyMember }
    });
  } catch (error) {
    console.error('Update family member error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update family member',
      error: error.message
    });
  }
};

// Delete family member (soft delete)
const deleteFamilyMember = async (req, res) => {
  try {
    const { id } = req.params;

    const familyMember = await FamilyMember.findOne({
      _id: id,
      patient: req.user._id
    });

    if (!familyMember) {
      return res.status(404).json({
        success: false,
        message: 'Family member not found'
      });
    }

    familyMember.isActive = false;
    await familyMember.save();

    res.status(200).json({
      success: true,
      message: 'Family member removed successfully'
    });
  } catch (error) {
    console.error('Delete family member error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove family member',
      error: error.message
    });
  }
};

module.exports = {
  getFamilyMembers,
  getFamilyMemberById,
  createFamilyMember,
  updateFamilyMember,
  deleteFamilyMember
};







