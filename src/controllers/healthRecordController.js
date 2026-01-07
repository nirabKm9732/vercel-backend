const HealthRecord = require('../models/HealthRecord');
const { validationResult } = require('express-validator');
const { cloudinary } = require('../config/cloudinary');

// Get all health records for a patient
const getHealthRecords = async (req, res) => {
  try {
    const { type, search } = req.query;
    const query = { patient: req.user._id, isActive: true };

    if (type && type !== 'all') {
      query.type = type;
    }

    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { doctor: { $regex: search, $options: 'i' } }
      ];
    }

    const records = await HealthRecord.find(query)
      .populate('doctorId', 'firstName lastName specialization')
      .sort({ date: -1 });

    res.status(200).json({
      success: true,
      data: { records }
    });
  } catch (error) {
    console.error('Get health records error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch health records',
      error: error.message
    });
  }
};

// Get single health record by ID
const getHealthRecordById = async (req, res) => {
  try {
    const { id } = req.params;

    const record = await HealthRecord.findOne({
      _id: id,
      patient: req.user._id
    }).populate('doctorId', 'firstName lastName specialization');

    if (!record) {
      return res.status(404).json({
        success: false,
        message: 'Health record not found'
      });
    }

    res.status(200).json({
      success: true,
      data: { record }
    });
  } catch (error) {
    console.error('Get health record error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch health record',
      error: error.message
    });
  }
};

// Create new health record
const createHealthRecord = async (req, res) => {
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
      type,
      title,
      date,
      doctor,
      doctorId,
      description,
      notes,
      tags
    } = req.body;

    const record = new HealthRecord({
      patient: req.user._id,
      type,
      title,
      date: date || new Date(),
      doctor,
      doctorId,
      description,
      notes,
      tags: tags || []
    });

    await record.save();
    await record.populate('doctorId', 'firstName lastName specialization');

    res.status(201).json({
      success: true,
      message: 'Health record created successfully',
      data: { record }
    });
  } catch (error) {
    console.error('Create health record error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create health record',
      error: error.message
    });
  }
};

// Update health record
const updateHealthRecord = async (req, res) => {
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
      type,
      title,
      date,
      doctor,
      doctorId,
      description,
      notes,
      tags
    } = req.body;

    const record = await HealthRecord.findOne({
      _id: id,
      patient: req.user._id
    });

    if (!record) {
      return res.status(404).json({
        success: false,
        message: 'Health record not found'
      });
    }

    // Update fields
    if (type !== undefined) record.type = type;
    if (title !== undefined) record.title = title;
    if (date !== undefined) record.date = date;
    if (doctor !== undefined) record.doctor = doctor;
    if (doctorId !== undefined) record.doctorId = doctorId;
    if (description !== undefined) record.description = description;
    if (notes !== undefined) record.notes = notes;
    if (tags !== undefined) record.tags = tags;

    await record.save();
    await record.populate('doctorId', 'firstName lastName specialization');

    res.status(200).json({
      success: true,
      message: 'Health record updated successfully',
      data: { record }
    });
  } catch (error) {
    console.error('Update health record error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update health record',
      error: error.message
    });
  }
};

// Delete health record (soft delete)
const deleteHealthRecord = async (req, res) => {
  try {
    const { id } = req.params;

    const record = await HealthRecord.findOne({
      _id: id,
      patient: req.user._id
    });

    if (!record) {
      return res.status(404).json({
        success: false,
        message: 'Health record not found'
      });
    }

    record.isActive = false;
    await record.save();

    res.status(200).json({
      success: true,
      message: 'Health record deleted successfully'
    });
  } catch (error) {
    console.error('Delete health record error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete health record',
      error: error.message
    });
  }
};

// Upload attachment to health record
const uploadAttachment = async (req, res) => {
  try {
    const { id } = req.params;
    const file = req.file;

    if (!file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    const record = await HealthRecord.findOne({
      _id: id,
      patient: req.user._id
    });

    if (!record) {
      return res.status(404).json({
        success: false,
        message: 'Health record not found'
      });
    }

    // Upload to Cloudinary
    const result = await cloudinary.uploader.upload(file.path, {
      folder: 'health-records',
      resource_type: 'auto'
    });

    record.attachments.push({
      url: result.secure_url,
      fileName: file.originalname,
      fileType: file.mimetype
    });

    await record.save();

    res.status(200).json({
      success: true,
      message: 'Attachment uploaded successfully',
      data: { record }
    });
  } catch (error) {
    console.error('Upload attachment error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload attachment',
      error: error.message
    });
  }
};

module.exports = {
  getHealthRecords,
  getHealthRecordById,
  createHealthRecord,
  updateHealthRecord,
  deleteHealthRecord,
  uploadAttachment
};







