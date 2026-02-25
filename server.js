const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/admin', express.static(path.join(__dirname, 'admin-panel')));
app.use('/payment', express.static(path.join(__dirname, 'payment-page')));

// Redirect root to payment page
app.get('/', (req, res) => {
    res.redirect('/payment');
});

// Create uploads directory if not exists
if (!fs.existsSync('./uploads/checks')) {
    fs.mkdirSync('./uploads/checks', { recursive: true });
}

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://bilol006:bilol006@cluster0.yjzu6ug.mongodb.net/offlinereels';
mongoose.connect(MONGODB_URI)
    .then(() => console.log('✅ MongoDB connected'))
    .catch(err => console.log('❌ MongoDB error:', err));

// Payment Schema
const paymentSchema = new mongoose.Schema({
    login: String,
    comment: String,
    amount: Number,
    months: Number,
    checkPhoto: String,
    status: { type: String, default: 'pending' },
    createdAt: { type: Date, default: Date.now }
});

const Payment = mongoose.model('Payment', paymentSchema);

// User Schema
const userSchema = new mongoose.Schema({
    login: String,
    phone: String,
    password: String,
    premium: { type: Boolean, default: false },
    premiumUntil: Date
});

const User = mongoose.model('User', userSchema);

// File upload configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, './uploads/checks');
    },
    filename: (req, file, cb) => {
        const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname);
        cb(null, uniqueName);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (req, file, cb) => {
        const filetypes = /jpeg|jpg|png|gif/;
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = filetypes.test(file.mimetype);

        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Faqat rasm fayllari yuklash mumkin!'));
        }
    }
});

// ========== API ROUTES ==========

// 1. Admin Login
app.post('/api/admin/login', (req, res) => {
    const { username, password } = req.body;
    // For simplicity, using hardcoded credentials in backend (should be in DB in production)
    if (username === 'bilol006' && password === 'bilol006') {
        res.json({ success: true, message: 'Kirish muvaffaqiyatli' });
    } else {
        res.status(401).json({ success: false, message: 'Login yoki parol noto\'g\'ri!' });
    }
});

// 2. Payment submission
app.post('/api/payments', upload.single('checkPhoto'), async (req, res) => {
    try {
        const { login, comment, amount, months } = req.body;
        const checkPhoto = req.file ? `/uploads/checks/${req.file.filename}` : '';

        const payment = new Payment({
            login,
            comment,
            amount,
            months,
            checkPhoto
        });

        await payment.save();

        res.json({
            success: true,
            message: 'To\'lov so\'rovi qabul qilindi',
            paymentId: payment._id
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// 3. Get all payments (admin)
app.get('/api/admin/payments', async (req, res) => {
    try {
        const payments = await Payment.find().sort({ createdAt: -1 });
        res.json(payments);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// 4. Get all users (admin)
app.get('/api/admin/users', async (req, res) => {
    try {
        const users = await User.find().sort({ createdAt: -1 });
        res.json(users);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// 5. Delete user
app.delete('/api/admin/users/:id', async (req, res) => {
    try {
        await User.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: 'Foydalanuvchi o\'chirildi' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// 6. Approve payment
app.post('/api/admin/payments/:id/approve', async (req, res) => {
    try {
        const payment = await Payment.findById(req.params.id);

        if (!payment) {
            return res.status(404).json({ message: 'Payment not found' });
        }

        payment.status = 'approved';
        await payment.save();

        // Update user premium status
        let user = await User.findOne({ login: payment.login });
        if (!user) {
            // Create user if not exists (for testing/demo)
            user = new User({
                login: payment.login,
                premium: true,
                premiumUntil: new Date()
            });
        }

        user.premium = true;
        const untilDate = user.premiumUntil && user.premiumUntil > new Date() ? new Date(user.premiumUntil) : new Date();
        untilDate.setMonth(untilDate.getMonth() + payment.months);
        user.premiumUntil = untilDate;
        await user.save();

        res.json({ success: true, message: 'Payment approved' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// 7. Reject payment
app.post('/api/admin/payments/:id/reject', async (req, res) => {
    try {
        const payment = await Payment.findById(req.params.id);

        if (!payment) {
            return res.status(404).json({ message: 'Payment not found' });
        }

        payment.status = 'rejected';
        await payment.save();

        res.json({ success: true, message: 'Payment rejected' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// 8. Get stats (admin)
app.get('/api/admin/stats', async (req, res) => {
    try {
        const totalUsers = await User.countDocuments();
        const premiumUsers = await User.countDocuments({ premium: true });
        const pendingPayments = await Payment.countDocuments({ status: 'pending' });

        const payments = await Payment.find({ status: 'approved' });
        const totalAmount = payments.reduce((sum, p) => sum + p.amount, 0);

        res.json({
            totalUsers,
            premiumUsers,
            pendingPayments,
            totalAmount: totalAmount.toLocaleString()
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// 9. Check payment status
app.get('/api/payments/:id/status', async (req, res) => {
    try {
        const payment = await Payment.findById(req.params.id);
        res.json({ status: payment ? payment.status : 'not_found' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Handle all other admin routes by serving the requested file
app.get('/admin/:page', (req, res) => {
    const page = req.params.page;
    const filePath = path.join(__dirname, 'admin-panel', page);
    if (fs.existsSync(filePath)) {
        res.sendFile(filePath);
    } else {
        res.status(404).send('Sahifa topilmadi');
    }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server ishlayapti: http://localhost:${PORT}`);
    console.log(`📊 Admin panel: http://localhost:${PORT}/admin`);
    console.log(`💳 To'lov sahifasi: http://localhost:${PORT}/payment`);
});
