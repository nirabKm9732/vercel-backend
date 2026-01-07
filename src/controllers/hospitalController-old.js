const { Hospital, HospitalBooking } = require('../models/Hospital');
const User = require('../models/User');
const { validationResult } = require('express-validator');

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
      page = 1,
      limit = 10
    } = req.query;

    let filter = { 
      role: 'hospital',
      isActive: true,
      isVerified: true
    };

    // Search functionality
    if (search) {
      filter.$or = [
        { hospitalName: { $regex: search, $options: 'i' } },
        { 'address.city': { $regex: search, $options: 'i' } },
        { departments: { $in: [new RegExp(search, 'i')] } }
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
      filter.hospitalType = hospitalType;
    }

    // Department filter
    if (department) {
      filter.departments = { $in: [new RegExp(department, 'i')] };
    }

    // Available beds filter
    if (availableBeds) {
      filter.availableBeds = { $gt: parseInt(availableBeds) };
    }

    // Emergency filter (hospitals with emergency departments)
    if (emergency === 'true') {
      filter.$or = [
        { hospitalType: 'emergency' },
        { departments: { $in: [/emergency/i] } }
      ];
    }

    const hospitals = await User.find(filter)
      .select('-password -__v')
      .sort({ hospitalName: 1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await User.countDocuments(filter);

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
    
    const hospital = await User.findOne({
      _id: id,
      role: 'hospital',
      isActive: true
    }).select('-password -__v');

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

    const occupancyRate = hospital.totalBeds > 0 
      ? ((hospital.totalBeds - hospital.availableBeds) / hospital.totalBeds * 100).toFixed(1)
      : 0;

    res.status(200).json({
      success: true,
      data: { 
        hospital,
        stats: {
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
      admissionDate,
      department,
      roomType,
      reasonForAdmission,
      urgency = 'routine',
      estimatedStayDuration,
      referringDoctorId,
      insurance
    } = req.body;

    // Verify hospital exists
    const hospital = await User.findOne({
      _id: hospitalId,
      role: 'hospital',
      isActive: true
    });

    if (!hospital) {
      return res.status(404).json({
        success: false,
        message: 'Hospital not found'
      });
    }

    // Check if hospital has available beds
    if (hospital.availableBeds <= 0) {
      return res.status(400).json({
        success: false,
        message: 'No beds available at this hospital'
      });
    }

    // Check if department exists in hospital
    if (!hospital.departments.some(dept => dept.toLowerCase().includes(department.toLowerCase()))) {
      return res.status(400).json({
        success: false,
        message: `Department '${department}' not available at this hospital`
      });
    }

    // Create hospital booking
    const booking = new HospitalBooking({
      patient: patientId,
      hospital: hospitalId,
      referringDoctor: referringDoctorId,
      admissionDate: new Date(admissionDate),
      department,
      roomType,
      reasonForAdmission,
      urgency,
      estimatedStayDuration,
      insurance: insurance || {
        isInsuranceCovered: false
      }
    });

    await booking.save();

    // Populate booking details
    await booking.populate([
      { path: 'hospital', select: 'hospitalName address phone departments' },
      { path: 'patient', select: 'firstName lastName email phone address' },
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
    const userRole = req.user.role;
    const { status, page = 1, limit = 10 } = req.query;

    let filter = {};

    // Set filter based on user role
    if (userRole === 'patient') {
      filter.patient = userId;
    } else if (userRole === 'hospital') {
      filter.hospital = userId;
    } else if (userRole !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    if (status) {
      filter.status = status;
    }

    const bookings = await HospitalBooking.find(filter)
      .populate('hospital', 'hospitalName address phone')
      .populate('patient', 'firstName lastName email phone')
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

// Update admission status (hospital/admin only)
const updateAdmissionStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, bedNumber, notes } = req.body;
    const userId = req.user._id;

    if (req.user.role !== 'hospital' && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Only hospitals can update admission status'
      });
    }

    const booking = await HospitalBooking.findById(id);
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Verify hospital ownership
    if (req.user.role === 'hospital' && booking.hospital.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const oldStatus = booking.status;
    booking.status = status;

    if (bedNumber) {
      booking.bedNumber = bedNumber;
    }

    if (notes) {
      booking.adminNotes = notes;
    }

    // Handle bed availability updates
    if (status === 'confirmed' && oldStatus === 'pending') {
      // Decrease available beds
      await User.findByIdAndUpdate(
        booking.hospital,
        { $inc: { availableBeds: -1 } }
      );
    } else if (status === 'discharged' && oldStatus === 'admitted') {
      // Increase available beds
      await User.findByIdAndUpdate(
        booking.hospital,
        { $inc: { availableBeds: 1 } }
      );
      booking.dischargeDate = new Date();
    } else if (status === 'cancelled' && ['confirmed', 'admitted'].includes(oldStatus)) {
      // Restore bed if booking was confirmed/admitted
      await User.findByIdAndUpdate(
        booking.hospital,
        { $inc: { availableBeds: 1 } }
      );
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

// Add medical record (hospital staff only)
const addMedicalRecord = async (req, res) => {
  try {
    const { id } = req.params;
    const { recordType, content, attachments } = req.body;
    const userId = req.user._id;

    if (req.user.role !== 'hospital' && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Only hospital staff can add medical records'
      });
    }

    const booking = await HospitalBooking.findById(id);
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Verify hospital ownership
    if (req.user.role === 'hospital' && booking.hospital.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Add medical record
    booking.medicalRecords.push({
      recordType,
      content,
      attachments: attachments || [],
      createdBy: userId,
      createdAt: new Date()
    });

    await booking.save();

    res.status(200).json({
      success: true,
      message: 'Medical record added successfully',
      data: { booking }
    });
  } catch (error) {
    console.error('Add medical record error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add medical record',
      error: error.message
    });
  }
};

// Get hospital dashboard (hospital role only)
const getHospitalDashboard = async (req, res) => {
  try {
    if (req.user.role !== 'hospital') {
      return res.status(403).json({
        success: false,
        message: 'Only hospitals can access this dashboard'
      });
    }

    const hospitalId = req.user._id;

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
        status: 'pending'
      }),
      
      // Current patients
      HospitalBooking.countDocuments({
        hospital: hospitalId,
        status: 'admitted'
      }),
      
      // This month's admissions
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
          hospital: hospitalId,
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

    const hospital = await User.findById(hospitalId).select('hospitalName totalBeds availableBeds');

    res.status(200).json({
      success: true,
      data: {
        hospital,
        stats: {
          todayAdmissions: stats[0],
          pendingRequests: stats[1],
          currentPatients: stats[2],
          monthlyAdmissions: stats[3],
          occupancyRate: hospital.totalBeds > 0 
            ? ((hospital.totalBeds - hospital.availableBeds) / hospital.totalBeds * 100).toFixed(1)
            : 0
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
  updateAdmissionStatus,
  addMedicalRecord,
  getHospitalDashboard
};
