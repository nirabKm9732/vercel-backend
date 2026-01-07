const Appointment = require('../models/Appointment');
const User = require('../models/User');
const { validationResult } = require('express-validator');

// Create new appointment
const createAppointment = async (req, res) => {
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
    
    // Check if patient has complete address
    const patient = await User.findById(patientId);
    if (!patient || !patient.address || !patient.address.street || !patient.address.city || !patient.address.state || !patient.address.zipCode) {
      return res.status(400).json({
        success: false,
        message: 'Please complete your profile address before booking an appointment. Address (street, city, state, and zip code) is required.'
      });
    }

    const {
      doctorId,
      appointmentDate,
      timeSlot,
      symptoms,
      urgency = 'medium',
      consultationType = 'video'
    } = req.body;

    // Verify doctor exists and is active
    const doctor = await User.findOne({
      _id: doctorId,
      role: 'doctor',
      isActive: true
    });

    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: 'Doctor not found or not available'
      });
    }

    // Check if time slot is available
    const existingAppointment = await Appointment.findOne({
      doctor: doctorId,
      appointmentDate: new Date(appointmentDate),
      'timeSlot.startTime': timeSlot.startTime,
      status: { $in: ['pending', 'confirmed'] }
    });

    if (existingAppointment) {
      return res.status(400).json({
        success: false,
        message: 'Time slot is already booked'
      });
    }

    // Calculate payment amounts (30% advance)
    const totalAmount = doctor.consultationFee;
    const advanceAmount = Math.round(totalAmount * 0.3);
    const remainingAmount = totalAmount - advanceAmount;

    const appointment = new Appointment({
      patient: patientId,
      doctor: doctorId,
      appointmentDate: new Date(appointmentDate),
      timeSlot,
      symptoms,
      urgency,
      consultationType,
      payment: {
        advanceAmount,
        remainingAmount,
        totalAmount,
        advancePaymentStatus: 'pending',
        finalPaymentStatus: 'pending'
      }
    });

    await appointment.save();

    // Populate doctor and patient details
    await appointment.populate([
      { path: 'doctor', select: 'firstName lastName specialization consultationFee' },
      { path: 'patient', select: 'firstName lastName email phone' }
    ]);

    res.status(201).json({
      success: true,
      message: 'Appointment created successfully',
      data: { appointment }
    });
  } catch (error) {
    console.error('Create appointment error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create appointment',
      error: error.message
    });
  }
};

// Get user's appointments
const getUserAppointments = async (req, res) => {
  try {
    const userId = req.user._id;
    const userRole = req.user.role;
    const { status, page = 1, limit = 10 } = req.query;

    let filter = {};

    // Set filter based on user role
    if (userRole === 'patient') {
      filter.patient = userId;
    } else if (userRole === 'doctor') {
      filter.doctor = userId;
    } else {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    if (status) {
      filter.status = status;
    }

    const appointments = await Appointment.find(filter)
      .populate('doctor', 'firstName lastName specialization consultationFee profileImage')
      .populate('patient', 'firstName lastName email phone profileImage')
      .sort({ appointmentDate: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Appointment.countDocuments(filter);

    res.status(200).json({
      success: true,
      data: {
        appointments,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Get appointments error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch appointments',
      error: error.message
    });
  }
};

// Get appointment by ID
const getAppointmentById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;
    const userRole = req.user.role;

    const appointment = await Appointment.findById(id)
      .populate('doctor', 'firstName lastName specialization consultationFee profileImage qualification experience')
      .populate('patient', 'firstName lastName email phone profileImage dateOfBirth gender address');

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: 'Appointment not found'
      });
    }

    // Check if user has access to this appointment
    const hasAccess = userRole === 'admin' || 
                     (userRole === 'patient' && appointment.patient._id.toString() === userId.toString()) ||
                     (userRole === 'doctor' && appointment.doctor._id.toString() === userId.toString());

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    res.status(200).json({
      success: true,
      data: { appointment }
    });
  } catch (error) {
    console.error('Get appointment error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch appointment',
      error: error.message
    });
  }
};

// Update appointment status (doctor only)
const updateAppointmentStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, cancelReason } = req.body;
    const doctorId = req.user._id;

    if (req.user.role !== 'doctor') {
      return res.status(403).json({
        success: false,
        message: 'Only doctors can update appointment status'
      });
    }

    const appointment = await Appointment.findOne({
      _id: id,
      doctor: doctorId
    });

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: 'Appointment not found'
      });
    }

    // Validate status transitions
    const validTransitions = {
      pending: ['confirmed', 'cancelled'],
      confirmed: ['completed', 'cancelled', 'no_show'],
      cancelled: [],
      completed: [],
      no_show: []
    };

    if (!validTransitions[appointment.status].includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot change status from ${appointment.status} to ${status}`
      });
    }

    // Require advance payment before confirmation
    if (status === 'confirmed' && appointment.payment?.advancePaymentStatus !== 'paid') {
      return res.status(400).json({
        success: false,
        message: 'Cannot confirm appointment until advance payment is paid'
      });
    }

    appointment.status = status;
    if (status === 'cancelled' && cancelReason) {
      appointment.cancelReason = cancelReason;
    }

    await appointment.save();

    res.status(200).json({
      success: true,
      message: 'Appointment status updated successfully',
      data: { appointment }
    });
  } catch (error) {
    console.error('Update appointment status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update appointment status',
      error: error.message
    });
  }
};

// Reschedule appointment
const rescheduleAppointment = async (req, res) => {
  try {
    const { id } = req.params;
    const { appointmentDate, timeSlot } = req.body;
    const userId = req.user._id;

    const appointment = await Appointment.findById(id);

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: 'Appointment not found'
      });
    }

    // Check if user has permission to reschedule
    const canReschedule = appointment.patient.toString() === userId.toString() ||
                         appointment.doctor.toString() === userId.toString();

    if (!canReschedule) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Check if appointment can be rescheduled
    if (!['pending', 'confirmed'].includes(appointment.status)) {
      return res.status(400).json({
        success: false,
        message: 'Cannot reschedule this appointment'
      });
    }

    // Check if new time slot is available
    const existingAppointment = await Appointment.findOne({
      doctor: appointment.doctor,
      appointmentDate: new Date(appointmentDate),
      'timeSlot.startTime': timeSlot.startTime,
      status: { $in: ['pending', 'confirmed'] },
      _id: { $ne: id }
    });

    if (existingAppointment) {
      return res.status(400).json({
        success: false,
        message: 'Time slot is already booked'
      });
    }

    // Create new appointment with rescheduled details
    const newAppointment = new Appointment({
      ...appointment.toObject(),
      _id: undefined,
      appointmentDate: new Date(appointmentDate),
      timeSlot,
      status: 'pending',
      rescheduledFrom: appointment._id
    });

    await newAppointment.save();

    // Cancel original appointment
    appointment.status = 'cancelled';
    appointment.cancelReason = 'Rescheduled';
    await appointment.save();

    await newAppointment.populate([
      { path: 'doctor', select: 'firstName lastName specialization' },
      { path: 'patient', select: 'firstName lastName email phone' }
    ]);

    res.status(200).json({
      success: true,
      message: 'Appointment rescheduled successfully',
      data: { appointment: newAppointment }
    });
  } catch (error) {
    console.error('Reschedule appointment error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reschedule appointment',
      error: error.message
    });
  }
};

// Add appointment feedback (patient only)
const addAppointmentFeedback = async (req, res) => {
  try {
    const { id } = req.params;
    const { rating, comment } = req.body;
    const patientId = req.user._id;

    if (req.user.role !== 'patient') {
      return res.status(403).json({
        success: false,
        message: 'Only patients can add feedback'
      });
    }

    const appointment = await Appointment.findOne({
      _id: id,
      patient: patientId,
      status: 'completed'
    });

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: 'Appointment not found or not completed'
      });
    }

    if (appointment.feedback && appointment.feedback.rating) {
      return res.status(400).json({
        success: false,
        message: 'Feedback already provided for this appointment'
      });
    }

    appointment.feedback = {
      rating,
      comment,
      submittedAt: new Date()
    };

    await appointment.save();

    // Update doctor's rating stats
    const doctor = await User.findById(appointment.doctor);
    if (doctor) {
      const currentCount = doctor.ratingCount || 0;
      const currentAverage = doctor.ratingAverage || 0;
      const newCount = currentCount + 1;
      const newAverage = ((currentAverage * currentCount) + rating) / newCount;
      doctor.ratingCount = newCount;
      doctor.ratingAverage = Number(newAverage.toFixed(2));
      await doctor.save();
    }

    res.status(200).json({
      success: true,
      message: 'Feedback added successfully',
      data: { appointment }
    });
  } catch (error) {
    console.error('Add feedback error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add feedback',
      error: error.message
    });
  }
};

// Get doctor's available time slots
const getDoctorAvailability = async (req, res) => {
  try {
    const { doctorId } = req.params;
    const { date } = req.query;

    if (!date) {
      return res.status(400).json({
        success: false,
        message: 'Date is required'
      });
    }

    const doctor = await User.findOne({
      _id: doctorId,
      role: 'doctor',
      isActive: true
    });

    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: 'Doctor not found'
      });
    }

    // Parse date string (format: YYYY-MM-DD) and create date in local timezone
    // This prevents timezone issues that could change the day of week
    let requestedDate;
    let dayOfWeek;
    
    if (date.match(/^\d{4}-\d{2}-\d{2}$/)) {
      // Date is in YYYY-MM-DD format
      const dateParts = date.split('-');
      const year = parseInt(dateParts[0], 10);
      const month = parseInt(dateParts[1], 10) - 1; // Month is 0-indexed
      const day = parseInt(dateParts[2], 10);
      
      // Create date in local timezone to avoid day shift
      requestedDate = new Date(year, month, day);
      
    // Map to full weekday name in lowercase to match stored availability (e.g., 'monday')
      dayOfWeek = requestedDate.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
    } else {
      // Try parsing as ISO string or other format
      requestedDate = new Date(date);
      if (isNaN(requestedDate.getTime())) {
        return res.status(400).json({
          success: false,
          message: 'Invalid date format. Expected YYYY-MM-DD'
        });
      }
      dayOfWeek = requestedDate.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
    }

    console.log(`Checking availability for doctor ${doctorId} on ${date} (${dayOfWeek})`);
    console.log(`Doctor name: ${doctor.firstName} ${doctor.lastName}`);
    console.log(`Doctor availability structure:`, JSON.stringify(doctor.availability, null, 2));
    console.log(`Availability array length:`, doctor.availability?.length || 0);

    // Check for date-specific availability first
    let dayAvailability = doctor.availability?.find(avail => avail.specificDate === date);

    if (dayAvailability) {
      console.log(`Found date-specific availability for ${date}`);
    } else {
      // Get doctor's availability for the day of week
      dayAvailability = doctor.availability?.find(avail => avail.day === dayOfWeek);
    }

    if (!dayAvailability) {
      console.log(`No availability found for ${date} (${dayOfWeek}).`);
      console.log(`Available weekly days in doctor's schedule:`, doctor.availability?.map(a => a.day || a.specificDate) || []);
      console.log(`Looking for day: "${dayOfWeek}" or date: "${date}"`);
      return res.status(200).json({
        success: true,
        data: { availableSlots: [] },
        debug: {
          requestedDay: dayOfWeek,
          requestedDate: date,
          availableWeeklyDays: doctor.availability?.filter(a => a.day).map(a => a.day) || [],
          availableSpecificDates: doctor.availability?.filter(a => a.specificDate).map(a => a.specificDate) || [],
          doctorId: doctorId,
          doctorName: `${doctor.firstName} ${doctor.lastName}`
        }
      });
    }

    console.log(`Found availability entry:`, JSON.stringify(dayAvailability, null, 2));

    // Extract date components for UTC date range (for MongoDB queries)
    const dateForRange = date.match(/^\d{4}-\d{2}-\d{2}$/) 
      ? date.split('-').map(Number)
      : [requestedDate.getFullYear(), requestedDate.getMonth() + 1, requestedDate.getDate()];
    
    const yearForRange = dateForRange[0];
    const monthForRange = dateForRange[1] - 1; // Month is 0-indexed
    const dayForRange = dateForRange[2];
    
    // Create date range for the day (start and end of day in UTC for MongoDB)
    const startOfDay = new Date(Date.UTC(yearForRange, monthForRange, dayForRange, 0, 0, 0, 0));
    const endOfDay = new Date(Date.UTC(yearForRange, monthForRange, dayForRange, 23, 59, 59, 999));

    // Get booked appointments for the date
    const bookedAppointments = await Appointment.find({
      doctor: doctorId,
      appointmentDate: {
        $gte: startOfDay,
        $lte: endOfDay
      },
      status: { $in: ['pending', 'confirmed'] }
    });

    const bookedSlots = bookedAppointments.map(apt => apt.timeSlot?.startTime).filter(Boolean);

    console.log(`Found ${bookedSlots.length} booked slots:`, bookedSlots);
    console.log(`Total time slots for ${dayOfWeek}:`, dayAvailability.timeSlots?.length || 0);
    console.log(`Time slots data:`, JSON.stringify(dayAvailability.timeSlots, null, 2));

    // Filter available slots
    const allSlots = dayAvailability.timeSlots || [];
    
    const availableSlots = allSlots.filter(
      slot => {
        const isAvailable = slot.isAvailable !== false; // Default to true if not set
        const isNotBooked = !bookedSlots.includes(slot.startTime);
        return isAvailable && isNotBooked;
      }
    );

    console.log(`Returning ${availableSlots.length} available slots out of ${allSlots.length} total slots for ${dayOfWeek}`);

    res.status(200).json({
      success: true,
      data: { availableSlots }
    });
  } catch (error) {
    console.error('Get availability error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch availability',
      error: error.message
    });
  }
};

// Patient: mark advance paid
const payAdvance = async (req, res) => {
  try {
    const { id } = req.params;
    const { paymentId, orderId } = req.body || {};
    const patientId = req.user._id;

    const appointment = await Appointment.findOne({
      _id: id,
      patient: patientId
    });

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: 'Appointment not found'
      });
    }

    if (appointment.payment.advancePaymentStatus === 'paid') {
      return res.status(200).json({
        success: true,
        message: 'Advance payment already marked as paid',
        data: { appointment }
      });
    }

    appointment.payment.advancePaymentStatus = 'paid';
    if (paymentId) appointment.payment.paymentId = paymentId;
    if (orderId) appointment.payment.orderId = orderId;

    await appointment.save();

    res.status(200).json({
      success: true,
      message: 'Advance payment recorded',
      data: { appointment }
    });
  } catch (error) {
    console.error('Pay advance error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to record advance payment',
      error: error.message
    });
  }
};

module.exports = {
  createAppointment,
  getUserAppointments,
  getAppointmentById,
  updateAppointmentStatus,
  rescheduleAppointment,
  addAppointmentFeedback,
  getDoctorAvailability,
  payAdvance
};
