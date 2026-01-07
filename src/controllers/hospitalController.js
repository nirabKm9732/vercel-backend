const { Hospital, HospitalBooking } = require('../models/Hospital');
const User = require('../models/User');
const { validationResult } = require('express-validator');
const cloudinary = require('../config/cloudinary');
const mongoose = require('mongoose');

// Get all hospitals
const getHospitals = async (req, res) => {
  try {
    const {
      city,
      state,
      hospitalType,
      department,
      availableBeds,
      emergency,
      search,
      sortBy = 'name',
      sortOrder = 'asc',
      page = 1,
      limit = 10
    } = req.query;

    let filter = { isActive: true };

    // Search functionality
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { 'address.city': { $regex: search, $options: 'i' } },
        { 'departments.name': { $regex: search, $options: 'i' } }
      ];
    }

    // Location filters
    if (city) {
      filter['address.city'] = { $regex: city, $options: 'i' };
    }
    if (state) {
      filter['address.state'] = { $regex: state, $options: 'i' };
    }

    // Hospital type filter
    if (hospitalType) {
      filter.type = hospitalType;
    }

    // Department filter
    if (department) {
      filter['departments.name'] = { $regex: department, $options: 'i' };
    }

    // Available beds filter
    if (availableBeds) {
      filter.$or = [
        { 'bedCapacity.general.available': { $gte: parseInt(availableBeds) } },
        { 'bedCapacity.icu.available': { $gte: parseInt(availableBeds) } },
        { 'bedCapacity.private.available': { $gte: parseInt(availableBeds) } },
        { 'bedCapacity.emergency.available': { $gte: parseInt(availableBeds) } }
      ];
    }

    // Emergency filter
    if (emergency === 'true') {
      filter.$or = [
        { type: 'emergency' },
        { 'operatingHours.emergency24x7': true }
      ];
    }

    // Sorting
    const sortOptions = {};
    if (sortBy === 'rating') {
      sortOptions['ratings.averageRating'] = sortOrder === 'desc' ? -1 : 1;
    } else {
      sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;
    }

    const hospitals = await Hospital.find(filter)
      .sort(sortOptions)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .select('-__v');

    const total = await Hospital.countDocuments(filter);

    res.status(200).json({
      success: true,
      data: {
        hospitals,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Get hospitals error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch hospitals',
      error: error.message
    });
  }
};

// Get hospital by ID
const getHospitalById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const hospital = await Hospital.findOne({
      _id: id,
      isActive: true
    });

    if (!hospital) {
      return res.status(404).json({
        success: false,
        message: 'Hospital not found'
      });
    }

    // Get recent admission statistics
    const admissionStats = await HospitalBooking.aggregate([
      { $match: { hospital: hospital._id } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    // Calculate total available beds
    const totalAvailable = Object.values(hospital.bedCapacity).reduce((total, bedType) => {
      return total + (bedType.available || 0);
    }, 0);

    const totalBeds = Object.values(hospital.bedCapacity).reduce((total, bedType) => {
      return total + (bedType.total || 0);
    }, 0);

    const occupancyRate = totalBeds > 0 
      ? ((totalBeds - totalAvailable) / totalBeds * 100).toFixed(1)
      : 0;

    res.status(200).json({
      success: true,
      data: { 
        hospital,
        stats: {
          totalBeds,
          totalAvailable,
          occupancyRate,
          admissionStats
        }
      }
    });
  } catch (error) {
    console.error('Get hospital error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch hospital',
      error: error.message
    });
  }
};

// Create hospital admission request
const createAdmissionRequest = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: errors.array()
      });
    }

    const patientId = req.user._id;
    const {
      hospitalId,
      bedType = 'general',
      admissionDate,
      department,
      reason,
      medicalHistory,
      estimatedDischarge,
      referringDoctorId,
      emergencyContact
    } = req.body;

    // Verify hospital exists
    const hospital = await Hospital.findOne({
      _id: hospitalId,
      isActive: true
    });

    if (!hospital) {
      return res.status(404).json({
        success: false,
        message: 'Hospital not found'
      });
    }

    // Check if hospital has available beds of the requested type
    if (!hospital.bedCapacity[bedType] || hospital.bedCapacity[bedType].available <= 0) {
      return res.status(400).json({
        success: false,
        message: `No ${bedType} beds available at this hospital`
      });
    }

    // Check if department exists in hospital
    if (department) {
      const departmentExists = hospital.departments.some(dept => 
        dept.name.toLowerCase().includes(department.toLowerCase())
      );
      
      if (!departmentExists) {
        return res.status(400).json({
          success: false,
          message: `Department '${department}' not available at this hospital`
        });
      }
    }

    // Calculate estimated cost
    const bedPrice = hospital.pricing[`${bedType}Bed`] || hospital.pricing.generalBed;
    const consultationFee = hospital.pricing.consultationFee || 0;
    const estimatedDays = estimatedDischarge 
      ? Math.ceil((new Date(estimatedDischarge) - new Date(admissionDate)) / (1000 * 60 * 60 * 24))
      : 3; // Default 3 days

    const estimatedTotal = (bedPrice * estimatedDays) + consultationFee;
    const advanceAmount = Math.round(estimatedTotal * 0.3); // 30% advance

    // Create hospital booking
    const booking = new HospitalBooking({
      patient: patientId,
      hospital: hospitalId,
      bedType,
      admissionDate: new Date(admissionDate),
      estimatedDischarge: estimatedDischarge ? new Date(estimatedDischarge) : undefined,
      referringDoctor: referringDoctorId,
      department,
      reason,
      medicalHistory,
      emergencyContact,
      payment: {
        advanceAmount,
        estimatedTotal,
        status: 'pending'
      }
    });

    await booking.save();

    // Populate booking details
    await booking.populate([
      { path: 'hospital', select: 'name address contact departments' },
      { path: 'patient', select: 'firstName lastName email phone' },
      { path: 'referringDoctor', select: 'firstName lastName specialization' }
    ]);

    res.status(201).json({
      success: true,
      message: 'Hospital admission request created successfully',
      data: { booking }
    });
  } catch (error) {
    console.error('Create admission request error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create admission request',
      error: error.message
    });
  }
};

// Get user's hospital bookings
const getUserBookings = async (req, res) => {
  try {
    const userId = req.user._id;
    const { status, page = 1, limit = 10 } = req.query;

    let filter = { patient: userId };

    if (status) {
      filter.status = status;
    }

    const bookings = await HospitalBooking.find(filter)
      .populate('hospital', 'name address contact')
      .populate('referringDoctor', 'firstName lastName specialization')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await HospitalBooking.countDocuments(filter);

    res.status(200).json({
      success: true,
      data: {
        bookings,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Get user bookings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch bookings',
      error: error.message
    });
  }
};

// Get booking by ID
const getBookingById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const booking = await HospitalBooking.findById(id)
      .populate('hospital')
      .populate('patient', 'firstName lastName email phone dateOfBirth')
      .populate('referringDoctor', 'firstName lastName specialization')
      .populate('adminConfirmation.confirmedBy', 'firstName lastName');

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Check access rights
    const hasAccess = req.user.role === 'admin' || 
                     req.user.role === 'hospital' ||
                     booking.patient._id.toString() === req.user._id.toString();

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    res.status(200).json({
      success: true,
      data: { booking }
    });
  } catch (error) {
    console.error('Get booking error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch booking',
      error: error.message
    });
  }
};

// Update admission status (admin/hospital staff only)
const updateAdmissionStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, bedNumber, ward, floor, notes } = req.body;

    if (!['admin', 'hospital'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const booking = await HospitalBooking.findById(id);
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    const oldStatus = booking.status;
    booking.status = status;

    // Handle bed assignment
    if (bedNumber) {
      booking.assignedBed = {
        bedNumber,
        ward: ward || booking.assignedBed?.ward,
        floor: floor || booking.assignedBed?.floor
      };
    }

    // Handle admin confirmation
    if (status === 'confirmed' && oldStatus === 'requested') {
      booking.adminConfirmation = {
        confirmedBy: req.user._id,
        confirmedAt: new Date(),
        notes
      };

      // Decrease available beds
      await Hospital.findByIdAndUpdate(
        booking.hospital,
        { $inc: { [`bedCapacity.${booking.bedType}.available`]: -1 } }
      );
    }

    // Handle admission
    if (status === 'admitted' && oldStatus === 'confirmed') {
      // Bed is already reserved, just update status
    }

    // Handle discharge
    if (status === 'discharged' && ['confirmed', 'admitted'].includes(oldStatus)) {
      booking.actualDischarge = new Date();
      
      // Increase available beds
      await Hospital.findByIdAndUpdate(
        booking.hospital,
        { $inc: { [`bedCapacity.${booking.bedType}.available`]: 1 } }
      );
    }

    // Handle cancellation
    if (status === 'cancelled' && ['confirmed', 'admitted'].includes(oldStatus)) {
      // Restore bed availability
      await Hospital.findByIdAndUpdate(
        booking.hospital,
        { $inc: { [`bedCapacity.${booking.bedType}.available`]: 1 } }
      );
    }

    // Add notes
    if (notes) {
      if (req.user.role === 'admin') {
        booking.notes.adminNotes = notes;
      } else {
        booking.notes.hospitalNotes = notes;
      }
    }

    await booking.save();

    res.status(200).json({
      success: true,
      message: 'Admission status updated successfully',
      data: { booking }
    });
  } catch (error) {
    console.error('Update admission status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update admission status',
      error: error.message
    });
  }
};

// Cancel booking
const cancelBooking = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    
    const booking = await HospitalBooking.findById(id);
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Check if user can cancel
    const canCancel = req.user.role === 'admin' || 
                     (booking.patient.toString() === req.user._id.toString() && 
                      ['requested', 'confirmed'].includes(booking.status));

    if (!canCancel) {
      return res.status(400).json({
        success: false,
        message: 'Cannot cancel booking at this stage'
      });
    }

    const oldStatus = booking.status;
    booking.status = 'cancelled';
    booking.notes.patientNotes = reason;

    // Restore bed availability if it was reserved
    if (['confirmed', 'admitted'].includes(oldStatus)) {
      await Hospital.findByIdAndUpdate(
        booking.hospital,
        { $inc: { [`bedCapacity.${booking.bedType}.available`]: 1 } }
      );
    }

    await booking.save();

    res.status(200).json({
      success: true,
      message: 'Booking cancelled successfully',
      data: { booking }
    });
  } catch (error) {
    console.error('Cancel booking error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel booking',
      error: error.message
    });
  }
};

// Upload medical documents
const uploadMedicalDocuments = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No documents provided'
      });
    }

    const { id } = req.params;
    const booking = await HospitalBooking.findById(id);
    
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Check access rights
    const hasAccess = req.user.role === 'admin' || 
                     req.user.role === 'hospital' ||
                     booking.patient.toString() === req.user._id.toString();

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const uploadedDocuments = [];

    // Upload files to cloudinary
    for (const file of req.files) {
      const result = await cloudinary.uploader.upload(file.path, {
        folder: 'healthcare/hospital-documents',
        resource_type: 'auto'
      });

      uploadedDocuments.push({
        type: result.secure_url,
        description: file.originalname || 'Medical Document'
      });
    }

    // Add documents to booking
    booking.documents.push(...uploadedDocuments);
    await booking.save();

    res.status(200).json({
      success: true,
      message: 'Documents uploaded successfully',
      data: {
        uploadedDocuments
      }
    });
  } catch (error) {
    console.error('Upload documents error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload documents',
      error: error.message
    });
  }
};

// Get hospital dashboard stats (for hospital admin)
const getHospitalDashboard = async (req, res) => {
  try {
    const { hospitalId } = req.params;

    // Verify access
    if (req.user.role !== 'admin' && req.user.role !== 'hospital') {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const hospital = await Hospital.findById(hospitalId);
    if (!hospital) {
      return res.status(404).json({
        success: false,
        message: 'Hospital not found'
      });
    }

    // Get admission statistics
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const stats = await Promise.all([
      // Today's admissions
      HospitalBooking.countDocuments({
        hospital: hospitalId,
        admissionDate: { $gte: today, $lt: tomorrow },
        status: 'admitted'
      }),
      
      // Pending requests
      HospitalBooking.countDocuments({
        hospital: hospitalId,
        status: 'requested'
      }),
      
      // Current patients
      HospitalBooking.countDocuments({
        hospital: hospitalId,
        status: 'admitted'
      }),
      
      // This month's bookings
      HospitalBooking.countDocuments({
        hospital: hospitalId,
        createdAt: { 
          $gte: new Date(today.getFullYear(), today.getMonth(), 1),
          $lt: new Date(today.getFullYear(), today.getMonth() + 1, 1)
        }
      })
    ]);

    // Recent bookings
    const recentBookings = await HospitalBooking.find({
      hospital: hospitalId
    }).populate('patient', 'firstName lastName phone')
      .sort({ createdAt: -1 })
      .limit(5);

    // Department-wise occupancy
    const departmentStats = await HospitalBooking.aggregate([
      { 
        $match: { 
          hospital: mongoose.Types.ObjectId(hospitalId),
          status: 'admitted'
        }
      },
      {
        $group: {
          _id: '$department',
          count: { $sum: 1 }
        }
      }
    ]);

    // Calculate bed occupancy
    const totalAvailable = Object.values(hospital.bedCapacity).reduce((total, bedType) => {
      return total + (bedType.available || 0);
    }, 0);

    const totalBeds = Object.values(hospital.bedCapacity).reduce((total, bedType) => {
      return total + (bedType.total || 0);
    }, 0);

    const occupancyRate = totalBeds > 0 
      ? ((totalBeds - totalAvailable) / totalBeds * 100).toFixed(1)
      : 0;

    res.status(200).json({
      success: true,
      data: {
        hospital: {
          name: hospital.name,
          totalBeds,
          availableBeds: totalAvailable,
          bedCapacity: hospital.bedCapacity
        },
        stats: {
          todayAdmissions: stats[0],
          pendingRequests: stats[1],
          currentPatients: stats[2],
          monthlyBookings: stats[3],
          occupancyRate
        },
        recentBookings,
        departmentStats
      }
    });
  } catch (error) {
    console.error('Get hospital dashboard error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch hospital dashboard',
      error: error.message
    });
  }
};

module.exports = {
  getHospitals,
  getHospitalById,
  createAdmissionRequest,
  getUserBookings,
  getBookingById,
  updateAdmissionStatus,
  cancelBooking,
  uploadMedicalDocuments,
  getHospitalDashboard
};
