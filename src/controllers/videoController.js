const Appointment = require('../models/Appointment');
const Prescription = require('../models/Prescription');
const { v4: uuidv4 } = require('uuid');
const { RtcTokenBuilder, RtcRole } = require('agora-access-token');

// Generate video call room for appointment
const generateVideoRoom = async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const userId = req.user._id;

    const appointment = await Appointment.findById(appointmentId)
      .populate('doctor', 'firstName lastName')
      .populate('patient', 'firstName lastName');

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: 'Appointment not found'
      });
    }

    // Verify user is part of this appointment
    const isDoctor = appointment.doctor._id.toString() === userId.toString();
    const isPatient = appointment.patient._id.toString() === userId.toString();

    if (!isDoctor && !isPatient) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Check if appointment is confirmed and payment is made
    if (appointment.status !== 'confirmed') {
      return res.status(400).json({
        success: false,
        message: 'Appointment must be confirmed to start video call'
      });
    }

    if (appointment.payment.advancePaymentStatus !== 'paid') {
      return res.status(400).json({
        success: false,
        message: 'Advance payment must be completed to start video call'
      });
    }

    if (appointment.payment.finalPaymentStatus !== 'paid') {
      return res.status(400).json({
        success: false,
        message: 'Remaining payment must be completed to start video call'
      });
    }

    // Generate room ID (use appointment ID as channel name for Agora)
    const channelName = appointment._id.toString();
    if (!appointment.videoCallDetails.roomId) {
      appointment.videoCallDetails.roomId = channelName;
      appointment.videoCallDetails.meetingUrl = `${process.env.FRONTEND_URL}/video/${appointment._id}`;
      await appointment.save();
    }

    // Generate Agora token
    const appId = process.env.AGORA_APP_ID?.trim();
    const appCertificate = process.env.AGORA_APP_CERTIFICATE?.trim();
    
    if (!appId || !appCertificate) {
      console.error('Agora configuration missing:', {
        hasAppId: !!appId,
        hasCertificate: !!appCertificate,
        appIdLength: appId?.length || 0,
        certLength: appCertificate?.length || 0
      });
      return res.status(500).json({
        success: false,
        message: 'Agora configuration missing. Please set AGORA_APP_ID and AGORA_APP_CERTIFICATE in your backend .env file. See setup instructions in the README.',
        error: 'MISSING_AGORA_CONFIG'
      });
    }

    // Validate that credentials look valid (App ID should be alphanumeric, Certificate should be longer)
    if (appId.length < 10 || appCertificate.length < 20) {
      console.error('Agora credentials appear invalid:', {
        appIdLength: appId.length,
        certLength: appCertificate.length
      });
      return res.status(500).json({
        success: false,
        message: 'Agora credentials appear to be invalid. Please verify AGORA_APP_ID and AGORA_APP_CERTIFICATE in your backend .env file.',
        error: 'INVALID_AGORA_CONFIG'
      });
    }

    // Generate UID for the user (convert MongoDB ObjectId to integer)
    const uidStr = userId.toString().replace(/[^0-9]/g, '').substring(0, 8);
    const uid = parseInt(uidStr) || Math.floor(Math.random() * 100000);
    const role = RtcRole.PUBLISHER; // Both doctor and patient can publish
    
    // Token expires in 24 hours
    const expirationTimeInSeconds = Math.floor(Date.now() / 1000) + (24 * 3600);
    
    const token = RtcTokenBuilder.buildTokenWithUid(
      appId,
      appCertificate,
      channelName,
      uid,
      role,
      expirationTimeInSeconds
    );

    res.status(200).json({
      success: true,
      message: 'Video room generated successfully',
      data: {
        appId: appId,
        channelName: channelName,
        token: token,
        uid: uid,
        roomId: appointment.videoCallDetails.roomId,
        meetingUrl: appointment.videoCallDetails.meetingUrl,
        appointment: {
          id: appointment._id,
          doctor: appointment.doctor,
          patient: appointment.patient,
          appointmentDate: appointment.appointmentDate,
          timeSlot: appointment.timeSlot
        },
        userRole: isDoctor ? 'doctor' : 'patient'
      }
    });
  } catch (error) {
    console.error('Generate video room error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate video room',
      error: error.message
    });
  }
};

// Start video call
const startVideoCall = async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const userId = req.user._id;

    const appointment = await Appointment.findById(appointmentId);

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: 'Appointment not found'
      });
    }

    // Verify user is part of this appointment
    const isDoctor = appointment.doctor.toString() === userId.toString();
    const isPatient = appointment.patient.toString() === userId.toString();

    if (!isDoctor && !isPatient) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Ensure payment completed before logging call start
    if (appointment.payment.advancePaymentStatus !== 'paid' || appointment.payment.finalPaymentStatus !== 'paid') {
      return res.status(400).json({
        success: false,
        message: 'Cannot start call until advance and remaining payments are completed'
      });
    }

    // Update call start time
    if (!appointment.videoCallDetails.startedAt) {
      appointment.videoCallDetails.startedAt = new Date();
      await appointment.save();
    }

    res.status(200).json({
      success: true,
      message: 'Video call started successfully'
    });
  } catch (error) {
    console.error('Start video call error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to start video call',
      error: error.message
    });
  }
};

// End video call
const endVideoCall = async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const userId = req.user._id;

    const appointment = await Appointment.findById(appointmentId)
      .populate('patient', 'firstName lastName')
      .populate('doctor', 'firstName lastName');

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: 'Appointment not found'
      });
    }

    // Verify user is part of this appointment
    const isDoctor = appointment.doctor._id ? appointment.doctor._id.toString() === userId.toString() : appointment.doctor.toString() === userId.toString();
    const isPatient = appointment.patient._id ? appointment.patient._id.toString() === userId.toString() : appointment.patient.toString() === userId.toString();

    if (!isDoctor && !isPatient) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Update call end time and appointment status
    appointment.videoCallDetails.endedAt = new Date();
    
    let prescriptionCreated = false;
    let prescriptionId = null;
    
    // Only doctor can mark appointment as completed and generate prescription
    if (isDoctor) {
      appointment.status = 'completed';
      
      // Check if prescription already exists
      const existingPrescription = await Prescription.findOne({ appointment: appointmentId });
      
      if (!existingPrescription) {
        // Create a default prescription for the patient
        const patientId = appointment.patient._id || appointment.patient;
        const doctorId = appointment.doctor._id || appointment.doctor;
        
        // Set default valid until date (30 days from now)
        const defaultValidUntil = new Date();
        defaultValidUntil.setDate(defaultValidUntil.getDate() + 30);
        
        const prescription = new Prescription({
          appointment: appointmentId,
          patient: patientId,
          doctor: doctorId,
          diagnosis: 'Consultation completed. Please see doctor notes for details.',
          medications: [], // Doctor can add medications later
          labTests: [], // Doctor can add lab tests later
          advice: 'Follow up as needed. Take medications as prescribed.',
          followUpRequired: false,
          validUntil: defaultValidUntil,
          prescriptionImage: '' // Placeholder - doctor can upload image later
        });
        
        await prescription.save();
        prescriptionId = prescription._id;
        prescriptionCreated = true;
        
        // Link prescription to appointment
        appointment.prescription = prescription._id;
      } else {
        prescriptionId = existingPrescription._id;
      }
    }

    await appointment.save();

    // Calculate call duration
    const callDuration = appointment.videoCallDetails.endedAt && appointment.videoCallDetails.startedAt
      ? Math.round((appointment.videoCallDetails.endedAt - appointment.videoCallDetails.startedAt) / 1000 / 60) // Duration in minutes
      : 0;

    res.status(200).json({
      success: true,
      message: 'Video call ended successfully',
      data: {
        callDuration: callDuration,
        appointmentStatus: appointment.status,
        prescriptionCreated: prescriptionCreated,
        prescriptionId: prescriptionId
      }
    });
  } catch (error) {
    console.error('End video call error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to end video call',
      error: error.message
    });
  }
};

// Get video call details
const getVideoCallDetails = async (req, res) => {
  try {
    const { roomId } = req.params;
    const userId = req.user._id;

    const appointment = await Appointment.findOne({
      'videoCallDetails.roomId': roomId
    }).populate('doctor', 'firstName lastName profileImage')
      .populate('patient', 'firstName lastName profileImage');

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: 'Video call room not found'
      });
    }

    // Verify user is part of this appointment
    const isDoctor = appointment.doctor._id.toString() === userId.toString();
    const isPatient = appointment.patient._id.toString() === userId.toString();

    if (!isDoctor && !isPatient) {
      return res.status(403).json({
        success: false,
        message: 'Access denied to this video call'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        appointment: {
          id: appointment._id,
          doctor: appointment.doctor,
          patient: appointment.patient,
          appointmentDate: appointment.appointmentDate,
          timeSlot: appointment.timeSlot,
          symptoms: appointment.symptoms
        },
        videoCallDetails: appointment.videoCallDetails,
        userRole: isDoctor ? 'doctor' : 'patient',
        otherParty: isDoctor ? appointment.patient : appointment.doctor
      }
    });
  } catch (error) {
    console.error('Get video call details error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get video call details',
      error: error.message
    });
  }
};

// Generate ICE servers configuration for WebRTC
const getIceServers = async (req, res) => {
  try {
    // In production, you would use TURN servers for better connectivity
    const iceServers = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      // Add TURN servers here for production
      // {
      //   urls: 'turn:your-turn-server.com',
      //   username: 'your-username',
      //   credential: 'your-credential'
      // }
    ];

    res.status(200).json({
      success: true,
      data: { iceServers }
    });
  } catch (error) {
    console.error('Get ICE servers error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get ICE servers',
      error: error.message
    });
  }
};

// Generate Agora token for video call
const generateAgoraToken = async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const userId = req.user._id;

    const appointment = await Appointment.findById(appointmentId)
      .populate('doctor', 'firstName lastName')
      .populate('patient', 'firstName lastName');

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: 'Appointment not found'
      });
    }

    // Verify user is part of this appointment
    const isDoctor = appointment.doctor._id.toString() === userId.toString();
    const isPatient = appointment.patient._id.toString() === userId.toString();

    if (!isDoctor && !isPatient) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Check if appointment is confirmed
    if (appointment.status !== 'confirmed') {
      return res.status(400).json({
        success: false,
        message: 'Appointment must be confirmed to start video call'
      });
    }

    if (appointment.payment.advancePaymentStatus !== 'paid') {
      return res.status(400).json({
        success: false,
        message: 'Advance payment must be completed to start video call'
      });
    }

    if (appointment.payment.finalPaymentStatus !== 'paid') {
      return res.status(400).json({
        success: false,
        message: 'Remaining payment must be completed to start video call'
      });
    }

    const appId = process.env.AGORA_APP_ID?.trim();
    const appCertificate = process.env.AGORA_APP_CERTIFICATE?.trim();
    
    if (!appId || !appCertificate) {
      console.error('Agora configuration missing in generateAgoraToken');
      return res.status(500).json({
        success: false,
        message: 'Agora configuration missing. Please set AGORA_APP_ID and AGORA_APP_CERTIFICATE in your backend .env file.',
        error: 'MISSING_AGORA_CONFIG'
      });
    }

    // Validate that credentials look valid
    if (appId.length < 10 || appCertificate.length < 20) {
      console.error('Agora credentials appear invalid in generateAgoraToken');
      return res.status(500).json({
        success: false,
        message: 'Agora credentials appear to be invalid. Please verify your credentials.',
        error: 'INVALID_AGORA_CONFIG'
      });
    }

    // Use appointment ID as channel name
    const channelName = appointment._id.toString();
    
    // Generate UID from user ID
    const uid = parseInt(userId.toString().replace(/[^0-9]/g, '').substring(0, 8)) || Math.floor(Math.random() * 100000);
    const role = RtcRole.PUBLISHER;
    
    // Token expires in 24 hours
    const expirationTimeInSeconds = Math.floor(Date.now() / 1000) + (24 * 3600);
    
    const token = RtcTokenBuilder.buildTokenWithUid(
      appId,
      appCertificate,
      channelName,
      uid,
      role,
      expirationTimeInSeconds
    );

    res.status(200).json({
      success: true,
      data: {
        appId: appId,
        channelName: channelName,
        token: token,
        uid: uid
      }
    });
  } catch (error) {
    console.error('Generate Agora token error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate token',
      error: error.message
    });
  }
};

module.exports = {
  generateVideoRoom,
  generateAgoraToken,
  startVideoCall,
  endVideoCall,
  getVideoCallDetails,
  getIceServers
};
