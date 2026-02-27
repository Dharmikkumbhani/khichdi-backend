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

        // HERE: In a production app, you would integrate Twilio or another SMS provider.
        // For example:
        // await twilioClient.messages.create({
        //     body: `Your Hotel Login OTP is: ${otpCode}. It expires in 5 minutes.`,
        //     from: process.env.TWILIO_PHONE_NUMBER,
        //     to: mobileNumber
        // });

        // For development, we'll just log it.
        console.log(`[MOCK SMS] OTP for ${mobileNumber} is: ${otpCode}`);

        res.status(200).json({ success: true, message: 'OTP sent successfully', otp: otpCode });
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

module.exports = router;
