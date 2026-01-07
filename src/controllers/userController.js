const User = require('../models/User');
const { validationResult } = require('express-validator');

// Get all doctors with filtering
const getDoctors = async (req, res) => {
  try {
    const { 
      specialization, 
      location, 
      minFee, 
      maxFee, 
      rating, 
      page = 1, 
      limit = 10 
    } = req.query;

    let filter = { role: 'doctor', isActive: true };

    // Add filters
    if (specialization) {
      filter.specialization = { $regex: specialization, $options: 'i' };
    }

    if (location) {
      filter.$or = [
        { 'address.city': { $regex: location, $options: 'i' } },
        { 'address.state': { $regex: location, $options: 'i' } }
      ];
    }

    if (minFee || maxFee) {
      filter.consultationFee = {};
      if (minFee) filter.consultationFee.$gte = parseInt(minFee);
      if (maxFee) filter.consultationFee.$lte = parseInt(maxFee);
    }

    const doctors = await User.find(filter)
      .select('-password -__v')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await User.countDocuments(filter);

    res.status(200).json({
      success: true,
      data: {
        doctors,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Get doctors error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch doctors',
      error: error.message
    });
  }
};

// Get single doctor by ID
const getDoctorById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const doctor = await User.findOne({
      _id: id,
      role: 'doctor',
      isActive: true
    }).select('-password -__v');

    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: 'Doctor not found'
      });
    }

    res.status(200).json({
      success: true,
      data: { doctor }
    });
  } catch (error) {
    console.error('Get doctor error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch doctor',
      error: error.message
    });
  }
};

// Update user profile
const updateProfile = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: errors.array()
      });
    }

    const userId = req.user._id;
    const updateData = { ...req.body };
    
    // Remove sensitive fields that shouldn't be updated via this endpoint
    delete updateData.password;
    delete updateData.email;
    delete updateData.role;
    delete updateData._id;

    // Get current user to check role
    const currentUser = await User.findById(userId);
    if (!currentUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Validate address for all users
    // If address is being updated, validate it
    if (updateData.address !== undefined) {
      if (!updateData.address || !updateData.address.street || !updateData.address.city || !updateData.address.state || !updateData.address.zipCode) {
        return res.status(400).json({
          success: false,
          message: 'Address (street, city, state, and zip code) is required'
        });
      }
    }

    const user = await User.findByIdAndUpdate(
      userId,
      updateData,
      { new: true, runValidators: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: { user }
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update profile',
      error: error.message
    });
  }
};

// Update doctor availability
const updateDoctorAvailability = async (req, res) => {
  try {
    const { availability } = req.body;
    const doctorId = req.user._id;

    // Verify user is a doctor
    if (req.user.role !== 'doctor') {
      return res.status(403).json({
        success: false,
        message: 'Only doctors can update availability'
      });
    }

    let availabilityArray = [];
    
    if (availability?.weekly || availability?.dates) {
      const weeklyInput = Array.isArray(availability.weekly) ? availability.weekly : [];
      const dateInput = Array.isArray(availability.dates) ? availability.dates : [];

      weeklyInput.forEach((avail) => {
        if (!avail.day || !avail.timeSlots) {
          throw new Error(`Invalid weekly availability format: missing day or timeSlots`);
        }
        availabilityArray.push({
          day: avail.day.toLowerCase(),
          timeSlots: (avail.timeSlots || []).map((slot) => ({
            startTime: slot.startTime,
            endTime: slot.endTime,
            isAvailable: slot.isAvailable !== false
          }))
        });
      });

      dateInput.forEach((avail) => {
        if (!avail.date || !avail.timeSlots) {
          throw new Error(`Invalid date availability format: missing date or timeSlots`);
        }
        availabilityArray.push({
          specificDate: avail.date,
          timeSlots: (avail.timeSlots || []).map((slot) => ({
            startTime: slot.startTime,
            endTime: slot.endTime,
            isAvailable: slot.isAvailable !== false
          }))
        });
      });
    } else if (Array.isArray(availability)) {
      // Already in array format - validate and ensure proper structure
      availabilityArray = availability.map(avail => {
        if (!(avail.day || avail.specificDate) || !avail.timeSlots) {
          throw new Error(`Invalid availability format: missing day/date or timeSlots`);
        }
        return {
          day: avail.day ? avail.day.toLowerCase() : undefined,
          specificDate: avail.specificDate,
          timeSlots: Array.isArray(avail.timeSlots) ? avail.timeSlots.map((slot) => ({
            startTime: slot.startTime,
            endTime: slot.endTime,
            isAvailable: slot.isAvailable !== false
          })) : []
        };
      });
    } else if (typeof availability === 'object' && availability !== null) {
      // Convert object format { monday: { timeSlots: [...] }, ... } to array format
      const validDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
      
      for (const day of validDays) {
        if (availability[day]) {
          const dayData = availability[day];
          
          if (dayData.timeSlots && Array.isArray(dayData.timeSlots)) {
            availabilityArray.push({
              day: day,
              timeSlots: dayData.timeSlots
            });
          } else if (dayData.startTime && dayData.endTime) {
            availabilityArray.push({
              day: day,
              timeSlots: [{
                startTime: dayData.startTime,
                endTime: dayData.endTime,
                isAvailable: dayData.isAvailable !== false
              }]
            });
          } else if (Array.isArray(dayData)) {
            availabilityArray.push({
              day: day,
              timeSlots: dayData.map((slot) => ({
                startTime: slot.startTime,
                endTime: slot.endTime,
                isAvailable: slot.isAvailable !== false
              }))
            });
          }
        }
      }

      if (availability.dates && Array.isArray(availability.dates)) {
        availability.dates.forEach((dateEntry) => {
          if (dateEntry.date && dateEntry.timeSlots) {
            availabilityArray.push({
              specificDate: dateEntry.date,
              timeSlots: dateEntry.timeSlots.map((slot) => ({
                startTime: slot.startTime,
                endTime: slot.endTime,
                isAvailable: slot.isAvailable !== false
              }))
            });
          }
        });
      }
    }

    console.log('Updating availability for doctor:', doctorId);
    console.log('Availability array:', JSON.stringify(availabilityArray, null, 2));

    const doctor = await User.findByIdAndUpdate(
      doctorId,
      { availability: availabilityArray },
      { new: true, runValidators: true }
    ).select('-password');

    console.log('Updated doctor availability:', JSON.stringify(doctor.availability, null, 2));

    res.status(200).json({
      success: true,
      message: 'Availability updated successfully',
      data: { doctor }
    });
  } catch (error) {
    console.error('Update availability error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update availability',
      error: error.message
    });
  }
};

// Get user dashboard data
const getDashboardData = async (req, res) => {
  try {
    const userId = req.user._id;
    const userRole = req.user.role;

    let dashboardData = {};

    // Common data for all users
    dashboardData.user = await User.findById(userId).select('-password');

    // Role-specific dashboard data will be added based on requirements
    switch (userRole) {
      case 'patient':
        // Add patient-specific dashboard data
        dashboardData.upcomingAppointments = []; // Will be populated with actual appointments
        dashboardData.prescriptions = [];
        break;
      case 'doctor':
        // Add doctor-specific dashboard data
        dashboardData.todayAppointments = [];
        dashboardData.pendingAppointments = [];
        break;
      case 'hospital':
        // Add hospital-specific dashboard data
        dashboardData.occupancyRate = 0;
        dashboardData.pendingAdmissions = [];
        break;
      case 'lab_assistant':
        // Add lab assistant-specific dashboard data
        dashboardData.pendingTests = [];
        dashboardData.completedTests = [];
        break;
    }

    res.status(200).json({
      success: true,
      data: dashboardData
    });
  } catch (error) {
    console.error('Get dashboard error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard data',
      error: error.message
    });
  }
};

// Search users (admin only)
const searchUsers = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }

    const { 
      search, 
      role, 
      isActive, 
      isVerified, 
      page = 1, 
      limit = 20 
    } = req.query;

    let filter = {};

    if (search) {
      filter.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } }
      ];
    }

    if (role) filter.role = role;
    if (isActive !== undefined) filter.isActive = isActive === 'true';
    if (isVerified !== undefined) filter.isVerified = isVerified === 'true';

    const users = await User.find(filter)
      .select('-password')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await User.countDocuments(filter);

    res.status(200).json({
      success: true,
      data: {
        users,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Search users error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to search users',
      error: error.message
    });
  }
};

module.exports = {
  getDoctors,
  getDoctorById,
  updateProfile,
  updateDoctorAvailability,
  getDashboardData,
  searchUsers
};
