const Insurance = require('../models/Insurance');
const User = require('../models/User');
const { validationResult } = require('express-validator');

// Get available insurance plans
const getInsurancePlans = async (req, res) => {
  try {
    const { 
      type, 
      coverageAmount, 
      premium, 
      page = 1, 
      limit = 10 
    } = req.query;

    let filter = { isActive: true };

    if (type) {
      filter.type = type;
    }

    if (coverageAmount) {
      const amount = parseInt(coverageAmount);
      filter.coverageAmount = { $gte: amount };
    }

    if (premium) {
      const maxPremium = parseInt(premium);
      filter['premiumStructure.annual'] = { $lte: maxPremium };
    }

    const plans = await Insurance.find(filter)
      .sort({ 'premiumStructure.annual': 1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Insurance.countDocuments(filter);

    res.status(200).json({
      success: true,
      data: {
        plans,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Get insurance plans error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch insurance plans',
      error: error.message
    });
  }
};

// Get insurance plan by ID
const getInsurancePlanById = async (req, res) => {
  try {
    const { id } = req.params;

    const plan = await Insurance.findOne({
      _id: id,
      isActive: true
    });

    if (!plan) {
      return res.status(404).json({
        success: false,
        message: 'Insurance plan not found'
      });
    }

    res.status(200).json({
      success: true,
      data: { plan }
    });
  } catch (error) {
    console.error('Get insurance plan error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch insurance plan',
      error: error.message
    });
  }
};

// Purchase insurance plan
const purchaseInsurance = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: errors.array()
      });
    }

    // Only patients can purchase insurance
    if (req.user.role !== 'patient') {
      return res.status(403).json({
        success: false,
        message: 'Only patients can purchase insurance'
      });
    }

    const { planId, beneficiaries, paymentFrequency = 'annual' } = req.body;

    // Check if plan exists and is active
    const plan = await Insurance.findOne({
      _id: planId,
      isActive: true
    });

    if (!plan) {
      return res.status(404).json({
        success: false,
        message: 'Insurance plan not found or not available'
      });
    }

    // Check if user already has an active insurance of the same type
    const existingInsurance = await User.findOne({
      _id: req.user._id,
      'insurancePolicies.plan': planId,
      'insurancePolicies.status': 'active'
    });

    if (existingInsurance) {
      return res.status(400).json({
        success: false,
        message: 'You already have an active policy for this plan'
      });
    }

    // Calculate premium based on frequency
    let premiumAmount;
    switch (paymentFrequency) {
      case 'monthly':
        premiumAmount = plan.premiumStructure.monthly;
        break;
      case 'quarterly':
        premiumAmount = plan.premiumStructure.quarterly;
        break;
      case 'annual':
        premiumAmount = plan.premiumStructure.annual;
        break;
      default:
        premiumAmount = plan.premiumStructure.annual;
    }

    // Set policy validity dates
    const startDate = new Date();
    const endDate = new Date();
    endDate.setFullYear(endDate.getFullYear() + 1);

    // Create insurance policy record
    const insurancePolicy = {
      plan: planId,
      policyNumber: `POL${Date.now()}${req.user._id.toString().slice(-6)}`,
      startDate,
      endDate,
      premiumAmount,
      paymentFrequency,
      status: 'pending_payment',
      beneficiaries: beneficiaries || [req.user._id],
      coverageUsed: 0,
      claims: []
    };

    // Add policy to user's insurance policies
    const user = await User.findById(req.user._id);
    user.insurancePolicies = user.insurancePolicies || [];
    user.insurancePolicies.push(insurancePolicy);
    await user.save();

    res.status(201).json({
      success: true,
      message: 'Insurance policy created successfully. Please complete the payment.',
      data: {
        policy: insurancePolicy,
        paymentAmount: premiumAmount
      }
    });
  } catch (error) {
    console.error('Purchase insurance error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to purchase insurance',
      error: error.message
    });
  }
};

// Get user's insurance policies
const getUserInsurancePolicies = async (req, res) => {
  try {
    const userId = req.user._id;

    const user = await User.findById(userId)
      .populate('insurancePolicies.plan', 'name type coverageAmount benefits')
      .select('insurancePolicies');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        policies: user.insurancePolicies || []
      }
    });
  } catch (error) {
    console.error('Get user insurance policies error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch insurance policies',
      error: error.message
    });
  }
};

// File insurance claim
const fileInsuranceClaim = async (req, res) => {
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
      policyId,
      claimType,
      claimAmount,
      serviceDate,
      providerName,
      diagnosis,
      treatmentDetails,
      documents
    } = req.body;

    // Find user with the specified policy
    const user = await User.findById(req.user._id);
    const policy = user.insurancePolicies?.find(p => p._id.toString() === policyId);

    if (!policy) {
      return res.status(404).json({
        success: false,
        message: 'Insurance policy not found'
      });
    }

    // Check if policy is active
    if (policy.status !== 'active') {
      return res.status(400).json({
        success: false,
        message: 'Insurance policy is not active'
      });
    }

    // Check if policy is still valid
    if (new Date() > policy.endDate) {
      return res.status(400).json({
        success: false,
        message: 'Insurance policy has expired'
      });
    }

    // Get plan details to check coverage
    const plan = await Insurance.findById(policy.plan);
    const remainingCoverage = plan.coverageAmount - policy.coverageUsed;

    if (claimAmount > remainingCoverage) {
      return res.status(400).json({
        success: false,
        message: `Claim amount exceeds remaining coverage. Available: ₹${remainingCoverage}`
      });
    }

    // Create claim
    const claim = {
      claimNumber: `CLM${Date.now()}${user._id.toString().slice(-6)}`,
      claimType,
      claimAmount,
      serviceDate: new Date(serviceDate),
      providerName,
      diagnosis,
      treatmentDetails,
      documents: documents || [],
      status: 'pending',
      submittedDate: new Date()
    };

    // Add claim to policy
    policy.claims.push(claim);
    await user.save();

    res.status(201).json({
      success: true,
      message: 'Insurance claim filed successfully',
      data: { claim }
    });
  } catch (error) {
    console.error('File insurance claim error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to file insurance claim',
      error: error.message
    });
  }
};

// Get insurance claims
const getInsuranceClaims = async (req, res) => {
  try {
    const userId = req.user._id;
    const { status, page = 1, limit = 10 } = req.query;

    const user = await User.findById(userId)
      .populate('insurancePolicies.plan', 'name type');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Extract all claims from all policies
    let allClaims = [];
    user.insurancePolicies?.forEach(policy => {
      policy.claims?.forEach(claim => {
        allClaims.push({
          ...claim.toObject(),
          policyInfo: {
            policyNumber: policy.policyNumber,
            planName: policy.plan?.name,
            planType: policy.plan?.type
          }
        });
      });
    });

    // Filter by status if provided
    if (status) {
      allClaims = allClaims.filter(claim => claim.status === status);
    }

    // Sort by submission date (newest first)
    allClaims.sort((a, b) => new Date(b.submittedDate) - new Date(a.submittedDate));

    // Pagination
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + parseInt(limit);
    const paginatedClaims = allClaims.slice(startIndex, endIndex);

    res.status(200).json({
      success: true,
      data: {
        claims: paginatedClaims,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: allClaims.length,
          pages: Math.ceil(allClaims.length / limit)
        }
      }
    });
  } catch (error) {
    console.error('Get insurance claims error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch insurance claims',
      error: error.message
    });
  }
};

// Check insurance eligibility for a service
const checkInsuranceEligibility = async (req, res) => {
  try {
    const { serviceType, serviceAmount, providerId } = req.query;
    const userId = req.user._id;

    const user = await User.findById(userId)
      .populate('insurancePolicies.plan');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Find active policies
    const activePolicies = user.insurancePolicies?.filter(policy => 
      policy.status === 'active' && new Date() <= policy.endDate
    ) || [];

    const eligibilityResults = activePolicies.map(policy => {
      const plan = policy.plan;
      const remainingCoverage = plan.coverageAmount - policy.coverageUsed;
      
      // Check if service type is covered
      const isCovered = plan.benefits.some(benefit => 
        benefit.type.toLowerCase().includes(serviceType?.toLowerCase())
      );

      let eligibleAmount = 0;
      let copayAmount = 0;

      if (isCovered && serviceAmount) {
        // Find the specific benefit
        const benefit = plan.benefits.find(b => 
          b.type.toLowerCase().includes(serviceType?.toLowerCase())
        );

        if (benefit) {
          const coveragePercentage = benefit.coveragePercentage || 80;
          const maxCoverage = Math.min(
            parseInt(serviceAmount) * (coveragePercentage / 100),
            remainingCoverage,
            benefit.maxLimit || remainingCoverage
          );

          eligibleAmount = maxCoverage;
          copayAmount = parseInt(serviceAmount) - eligibleAmount;
        }
      }

      return {
        policyNumber: policy.policyNumber,
        planName: plan.name,
        planType: plan.type,
        isCovered,
        remainingCoverage,
        eligibleAmount,
        copayAmount,
        deductible: plan.deductible || 0
      };
    });

    res.status(200).json({
      success: true,
      data: {
        eligibilityResults,
        totalActivePolicies: activePolicies.length
      }
    });
  } catch (error) {
    console.error('Check insurance eligibility error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check insurance eligibility',
      error: error.message
    });
  }
};

module.exports = {
  getInsurancePlans,
  getInsurancePlanById,
  purchaseInsurance,
  getUserInsurancePolicies,
  fileInsuranceClaim,
  getInsuranceClaims,
  checkInsuranceEligibility
};
