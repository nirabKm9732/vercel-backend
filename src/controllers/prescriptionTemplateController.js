const PrescriptionTemplate = require('../models/PrescriptionTemplate');
const { validationResult } = require('express-validator');

// Get all templates for a doctor
const getTemplates = async (req, res) => {
  try {
    const { category, search } = req.query;
    const query = { doctor: req.user._id, isActive: true };

    if (category && category !== 'all') {
      query.category = category;
    }

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { diagnosis: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    const templates = await PrescriptionTemplate.find(query)
      .populate('medications.medicine', 'name genericName strength')
      .sort({ usageCount: -1, createdAt: -1 });

    res.status(200).json({
      success: true,
      data: { templates }
    });
  } catch (error) {
    console.error('Get templates error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch templates',
      error: error.message
    });
  }
};

// Get single template by ID
const getTemplateById = async (req, res) => {
  try {
    const { id } = req.params;

    const template = await PrescriptionTemplate.findOne({
      _id: id,
      doctor: req.user._id
    }).populate('medications.medicine', 'name genericName strength');

    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Template not found'
      });
    }

    res.status(200).json({
      success: true,
      data: { template }
    });
  } catch (error) {
    console.error('Get template error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch template',
      error: error.message
    });
  }
};

// Create new template
const createTemplate = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: errors.array()
      });
    }

    if (req.user.role !== 'doctor') {
      return res.status(403).json({
        success: false,
        message: 'Only doctors can create templates'
      });
    }

    const {
      name,
      description,
      diagnosis,
      medications,
      labTests,
      advice,
      followUpRequired,
      defaultFollowUpDays,
      category
    } = req.body;

    const template = new PrescriptionTemplate({
      doctor: req.user._id,
      name,
      description,
      diagnosis,
      medications: medications || [],
      labTests: labTests || [],
      advice,
      followUpRequired: followUpRequired || false,
      defaultFollowUpDays: defaultFollowUpDays || 7,
      category: category || 'general'
    });

    await template.save();
    await template.populate('medications.medicine', 'name genericName strength');

    res.status(201).json({
      success: true,
      message: 'Template created successfully',
      data: { template }
    });
  } catch (error) {
    console.error('Create template error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create template',
      error: error.message
    });
  }
};

// Update template
const updateTemplate = async (req, res) => {
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
      name,
      description,
      diagnosis,
      medications,
      labTests,
      advice,
      followUpRequired,
      defaultFollowUpDays,
      category
    } = req.body;

    const template = await PrescriptionTemplate.findOne({
      _id: id,
      doctor: req.user._id
    });

    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Template not found'
      });
    }

    // Update fields
    if (name !== undefined) template.name = name;
    if (description !== undefined) template.description = description;
    if (diagnosis !== undefined) template.diagnosis = diagnosis;
    if (medications !== undefined) template.medications = medications;
    if (labTests !== undefined) template.labTests = labTests;
    if (advice !== undefined) template.advice = advice;
    if (followUpRequired !== undefined) template.followUpRequired = followUpRequired;
    if (defaultFollowUpDays !== undefined) template.defaultFollowUpDays = defaultFollowUpDays;
    if (category !== undefined) template.category = category;

    await template.save();
    await template.populate('medications.medicine', 'name genericName strength');

    res.status(200).json({
      success: true,
      message: 'Template updated successfully',
      data: { template }
    });
  } catch (error) {
    console.error('Update template error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update template',
      error: error.message
    });
  }
};

// Delete template (soft delete)
const deleteTemplate = async (req, res) => {
  try {
    const { id } = req.params;

    const template = await PrescriptionTemplate.findOne({
      _id: id,
      doctor: req.user._id
    });

    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Template not found'
      });
    }

    template.isActive = false;
    await template.save();

    res.status(200).json({
      success: true,
      message: 'Template deleted successfully'
    });
  } catch (error) {
    console.error('Delete template error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete template',
      error: error.message
    });
  }
};

// Increment usage count when template is used
const incrementUsage = async (templateId) => {
  try {
    await PrescriptionTemplate.findByIdAndUpdate(templateId, {
      $inc: { usageCount: 1 }
    });
  } catch (error) {
    console.error('Increment usage error:', error);
  }
};

module.exports = {
  getTemplates,
  getTemplateById,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  incrementUsage
};







