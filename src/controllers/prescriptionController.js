const Prescription = require('../models/Prescription');
const Appointment = require('../models/Appointment');
const User = require('../models/User');
const { validationResult } = require('express-validator');
const { cloudinary, deleteFromCloudinary } = require('../config/cloudinary');

// Create prescription (doctor only)
const createPrescription = async (req, res) => {
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
        message: 'Only doctors can create prescriptions'
      });
    }

    const {
      appointmentId,
      patientId,
      diagnosis,
      medications,
      labTests,
      advice,
      followUpRequired,
      followUpDate,
      validUntil
    } = req.body;

    // Verify appointment exists and belongs to the doctor
    const appointment = await Appointment.findOne({
      _id: appointmentId,
      doctor: req.user._id,
      status: { $in: ['confirmed', 'completed'] }
    }).populate('patient');

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: 'Appointment not found or access denied'
      });
    }

    // Check if prescription already exists for this appointment
    const existingPrescription = await Prescription.findOne({ appointment: appointmentId });
    if (existingPrescription) {
      return res.status(400).json({
        success: false,
        message: 'Prescription already exists for this appointment'
      });
    }

    // Set default valid until date (30 days from now)
    const defaultValidUntil = new Date();
    defaultValidUntil.setDate(defaultValidUntil.getDate() + 30);

    const prescription = new Prescription({
      appointment: appointmentId,
      patient: patientId || appointment.patient._id,
      doctor: req.user._id,
      diagnosis,
      medications: medications || [],
      labTests: labTests || [],
      advice,
      followUpRequired: followUpRequired || false,
      followUpDate: followUpRequired ? followUpDate : null,
      validUntil: validUntil || defaultValidUntil
    });

    await prescription.save();

    // Update appointment with prescription reference
    appointment.prescription = prescription._id;
    if (appointment.status === 'confirmed') {
      appointment.status = 'completed';
    }
    await appointment.save();

    await prescription.populate([
      { path: 'doctor', select: 'firstName lastName specialization qualification' },
      { path: 'patient', select: 'firstName lastName email phone dateOfBirth' },
      { path: 'medications.medicine', select: 'name genericName strength' }
    ]);

    res.status(201).json({
      success: true,
      message: 'Prescription created successfully',
      data: { prescription }
    });
  } catch (error) {
    console.error('Create prescription error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create prescription',
      error: error.message
    });
  }
};

// Upload prescription image
const uploadPrescriptionImage = async (req, res) => {
  try {
    const { id } = req.params;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No image file provided'
      });
    }

    const prescription = await Prescription.findById(id);
    if (!prescription) {
      return res.status(404).json({
        success: false,
        message: 'Prescription not found'
      });
    }

    // Check if user has access to this prescription
    const hasAccess = req.user.role === 'admin' || 
                     prescription.doctor.toString() === req.user._id.toString() ||
                     (req.user.role === 'patient' && prescription.patient.toString() === req.user._id.toString());

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // When using CloudinaryStorage, the file is already uploaded to Cloudinary
    // req.file contains the Cloudinary response
    // The structure may vary, so we check multiple possible properties
    const imageUrl = req.file.path || req.file.secure_url || req.file.url;
    const publicId = req.file.filename || req.file.public_id;
    
    if (!imageUrl) {
      console.error('Cloudinary upload response structure:', req.file);
      return res.status(500).json({
        success: false,
        message: 'Failed to get image URL from upload response',
        error: 'Invalid file response structure',
        debug: { fileKeys: Object.keys(req.file || {}) }
      });
    }

    // Delete old image if exists
    if (prescription.prescriptionImagePublicId) {
      try {
        await deleteFromCloudinary(prescription.prescriptionImagePublicId);
      } catch (destroyErr) {
        console.error('Failed to delete previous prescription image:', destroyErr);
        // Don't fail the upload if deletion fails
      }
    }

    prescription.prescriptionImage = imageUrl;
    prescription.prescriptionImagePublicId = publicId;
    await prescription.save();

    res.status(200).json({
      success: true,
      message: 'Prescription image uploaded successfully',
      data: {
        prescriptionImage: imageUrl
      }
    });
  } catch (error) {
    console.error('Upload prescription image error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload prescription image',
      error: error.message
    });
  }
};

// Get user's prescriptions
const getUserPrescriptions = async (req, res) => {
  try {
    const userId = req.user._id;
    const userRole = req.user.role;
    const { page = 1, limit = 10, appointment } = req.query;

    let filter = {};

    // Set filter based on user role
    if (userRole === 'patient') {
      filter.patient = userId;
    } else if (userRole === 'doctor') {
      filter.doctor = userId;
    } else if (userRole !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    if (appointment) {
      filter.appointment = appointment;
    }

    const prescriptions = await Prescription.find(filter)
      .populate('doctor', 'firstName lastName specialization qualification profileImage')
      .populate('patient', 'firstName lastName email phone dateOfBirth profileImage')
      .populate('appointment', 'appointmentDate status consultationType')
      .populate('medications.medicine', 'name genericName strength dosageForm')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Prescription.countDocuments(filter);

    res.status(200).json({
      success: true,
      data: {
        prescriptions,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Get prescriptions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch prescriptions',
      error: error.message
    });
  }
};

// Get prescription by ID
const getPrescriptionById = async (req, res) => {
  try {
    const { id } = req.params;

    const prescription = await Prescription.findById(id)
      .populate('doctor', 'firstName lastName specialization qualification profileImage experience')
      .populate('patient', 'firstName lastName email phone dateOfBirth gender address profileImage')
      .populate('appointment', 'appointmentDate status consultationType symptoms')
      .populate('medications.medicine', 'name genericName strength dosageForm manufacturer');

    if (!prescription) {
      return res.status(404).json({
        success: false,
        message: 'Prescription not found'
      });
    }

    // Check if user has access to this prescription
    const hasAccess = req.user.role === 'admin' || 
                     prescription.doctor._id.toString() === req.user._id.toString() ||
                     prescription.patient._id.toString() === req.user._id.toString();

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    res.status(200).json({
      success: true,
      data: { prescription }
    });
  } catch (error) {
    console.error('Get prescription error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch prescription',
      error: error.message
    });
  }
};

// Download prescription
const downloadPrescription = async (req, res) => {
  try {
    const { id } = req.params;

    const prescription = await Prescription.findById(id)
      .populate('doctor', 'firstName lastName specialization qualification')
      .populate('patient', 'firstName lastName dateOfBirth gender')
      .populate('medications.medicine', 'name genericName strength dosageForm');

    if (!prescription) {
      return res.status(404).json({
        success: false,
        message: 'Prescription not found'
      });
    }

    // Check if user has access to download this prescription
    const hasAccess = req.user.role === 'admin' || 
                     prescription.doctor._id.toString() === req.user._id.toString() ||
                     prescription.patient._id.toString() === req.user._id.toString();

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    if (!prescription.prescriptionImage) {
      return res.status(404).json({
        success: false,
        message: 'Prescription image not available'
      });
    }

    // Check if prescription is still valid
    if (new Date() > prescription.validUntil) {
      return res.status(400).json({
        success: false,
        message: 'Prescription has expired'
      });
    }

    // Increment download count
    prescription.downloadCount += 1;
    await prescription.save();

    res.status(200).json({
      success: true,
      message: 'Prescription download ready',
      data: {
        downloadUrl: prescription.prescriptionImage,
        prescription
      }
    });
  } catch (error) {
    console.error('Download prescription error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to download prescription',
      error: error.message
    });
  }
};

// Update prescription (doctor only)
const updatePrescription = async (req, res) => {
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
        message: 'Only doctors can update prescriptions'
      });
    }

    const { id } = req.params;
    const prescription = await Prescription.findOne({
      _id: id,
      doctor: req.user._id
    });

    if (!prescription) {
      return res.status(404).json({
        success: false,
        message: 'Prescription not found or access denied'
      });
    }

    const updateData = { ...req.body };
    delete updateData._id;
    delete updateData.doctor;
    delete updateData.patient;
    delete updateData.appointment;
    delete updateData.createdAt;
    delete updateData.downloadCount;

    const updatedPrescription = await Prescription.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    ).populate([
      { path: 'doctor', select: 'firstName lastName specialization qualification' },
      { path: 'patient', select: 'firstName lastName email phone' },
      { path: 'medications.medicine', select: 'name genericName strength' }
    ]);

    res.status(200).json({
      success: true,
      message: 'Prescription updated successfully',
      data: { prescription: updatedPrescription }
    });
  } catch (error) {
    console.error('Update prescription error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update prescription',
      error: error.message
    });
  }
};

// Deactivate prescription
const deactivatePrescription = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const prescription = await Prescription.findOne({
      _id: id,
      doctor: req.user._id
    });

    if (!prescription) {
      return res.status(404).json({
        success: false,
        message: 'Prescription not found or access denied'
      });
    }

    prescription.isActive = false;
    prescription.deactivationReason = reason;
    await prescription.save();

    res.status(200).json({
      success: true,
      message: 'Prescription deactivated successfully'
    });
  } catch (error) {
    console.error('Deactivate prescription error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to deactivate prescription',
      error: error.message
    });
  }
};

module.exports = {
  createPrescription,
  uploadPrescriptionImage,
  getUserPrescriptions,
  getPrescriptionById,
  downloadPrescription,
  updatePrescription,
  deactivatePrescription
};
