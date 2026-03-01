const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const OTP = require('../models/OTP');
const Hotel = require('../models/Hotel');

// Rate limiting for OTP generation API (prevent spam requests)
const otpLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // Limit each IP to 10 OTP requests per `window` (here, per 15 minutes)
    message: { success: false, message: 'Too many requests from this IP, please try again after 15 minutes' }
});

// Helper Function: Generate Random OTP
const generateOTP = () => {
    return Math.floor(10000 + Math.random() * 90000).toString(); // 5 digit OTP
};

// @route   POST /api/auth/send-otp
// @desc    Send OTP to a mobile number
router.post('/send-otp', otpLimiter, async (req, res) => {
    try {
        const { mobileNumber } = req.body;

        if (!mobileNumber) {
            return res.status(400).json({ success: false, message: 'Mobile number is required' });
        }

        // Generate OTP
        const otpCode = generateOTP();

        // Check if OTP already exists for this number to update, or create a new one
        await OTP.findOneAndUpdate(
            { mobileNumber },
            { otp: otpCode, createdAt: Date.now() },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        // ---------------------------------------------------------
        // REAL SMS FALLBACK USING LOCAL ANDROID SMS GATEWAY APP
        // ---------------------------------------------------------
        // NOTE: Replace the ANDROID_SMS_GATEWAY_URL in your `.env` file!
        // Example url formatting from apps: 'http://192.168.1.15:8080/v1/sms/send'
        try {
            const smsGatewayUrl = process.env.ANDROID_SMS_GATEWAY_URL;
            if (smsGatewayUrl) {
                const defaultAxios = require('axios');
                const message = `Your Hotel Login OTP is: ${otpCode}. Please do not share this with anyone.`;

                try {
                    await defaultAxios.post(smsGatewayUrl, {
                        phone: mobileNumber,
                        message: message
                    });
                    console.log(`[SMS SUCCESS] Sent OTP to ${mobileNumber} via Local Android Gateway`);
                } catch (smsError) {
                    console.error("[SMS ERROR] Failed to reach Android Phone SMS Gateway:");
                    console.error(smsError.message);
                }
            } else {
                console.log(`[MOCK SMS] OTP for ${mobileNumber} is: ${otpCode}`);
            }
        } catch (e) {
            console.error("General error in SMS local block", e);
        }

        res.status(200).json({ success: true, message: 'OTP sent successfully', mockOtp: otpCode });
    } catch (error) {
        console.error('Error sending OTP:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// @route   POST /api/auth/verify-otp
// @desc    Verify OTP and return JWT
router.post('/verify-otp', async (req, res) => {
    try {
        const { mobileNumber, otp, name, hotelName } = req.body;

        if (!mobileNumber || !otp) {
            return res.status(400).json({ success: false, message: 'Mobile number and OTP are required' });
        }

        // Validate OTP
        const existingOTP = await OTP.findOne({ mobileNumber, otp });

        if (!existingOTP) {
            return res.status(400).json({ success: false, message: 'Invalid or expired OTP' });
        }

        // Verify successful - Delete OTP from db
        await OTP.deleteOne({ _id: existingOTP._id });

        // Retrieve or create Hotel user
        let hotel = await Hotel.findOne({ mobileNumber });
        if (!hotel) {
            hotel = new Hotel({
                mobileNumber,
                name: name || "",
                hotelName: hotelName || "",
                role: 'hotel'
            });
        } else {
            // Update existing user with new details if provided
            if (name) hotel.name = name;
            if (hotelName) hotel.hotelName = hotelName;
        }
        await hotel.save();

        // Generate JWT Token
        const payload = {
            hotelId: hotel._id,
            role: hotel.role
        };

        const token = jwt.sign(
            payload,
            process.env.JWT_SECRET,
            { expiresIn: '7d' } // Token expiry: 7 days
        );

        res.status(200).json({
            success: true,
            message: 'OTP verified successfully',
            token
        });
    } catch (error) {
        console.error('Error verifying OTP:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// @route   POST /api/auth/direct-login
// @desc    Direct login without OTP
router.post('/direct-login', async (req, res) => {
    try {
        const { mobileNumber, name, hotelName } = req.body;

        if (!mobileNumber) {
            return res.status(400).json({ success: false, message: 'Mobile number is required' });
        }

        // Retrieve or create Hotel user
        let hotel = await Hotel.findOne({ mobileNumber });
        if (!hotel) {
            hotel = new Hotel({
                mobileNumber,
                name: name || "",
                hotelName: hotelName || "",
                role: 'hotel'
            });
        } else {
            // Update existing user with new details if provided
            if (name) hotel.name = name;
            if (hotelName) hotel.hotelName = hotelName;
        }
        await hotel.save();

        // Generate JWT Token
        const payload = {
            hotelId: hotel._id,
            role: hotel.role
        };

        const token = jwt.sign(
            payload,
            process.env.JWT_SECRET,
            { expiresIn: '7d' } // Token expiry: 7 days
        );

        res.status(200).json({
            success: true,
            message: 'Login successful',
            token
        });
    } catch (error) {
        console.error('Error in direct login:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

module.exports = router;
