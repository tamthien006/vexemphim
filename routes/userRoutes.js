const express = require('express');
const { check } = require('express-validator');
const { protect, admin } = require('../middleware/authMiddleware');
const {
  register,
  login,
  getProfile,
  updateProfile,
  changePassword,
  getUsers,
  getUserById,
  updateUser,
  deleteUser,
  createStaff
} = require('../controllers/userController');

const router = express.Router();

// @route   POST /api/users/register
// @desc    Register a new user
// @access  Public
router.post(
  '/register',
  [
    check('name', 'Name is required').not().isEmpty(),
    check('email', 'Please include a valid email').isEmail(),
    check('password', 'Please enter a password with 6 or more characters').isLength({ min: 6 }),
    check('phone', 'Please enter a valid phone number').optional().isMobilePhone()
  ],
  register
);

// @route   POST /api/users/login
// @desc    Authenticate user & get token
// @access  Public
router.post(
  '/login',
  [
    check('email', 'Please include a valid email').isEmail(),
    check('password', 'Password is required').exists()
  ],
  login
);

// @route   GET /api/users/me
// @desc    Get user profile
// @access  Private
router.get('/me', protect, getProfile);

// @route   PUT /api/users/me
// @desc    Update user profile
// @access  Private
router.put(
  '/me',
  protect,
  [
    check('name', 'Name is required').not().isEmpty(),
    check('phone', 'Please enter a valid phone number').optional().isMobilePhone()
  ],
  updateProfile
);

// @route   PUT /api/users/me/password
// @desc    Change user password
// @access  Private
router.put(
  '/me/password',
  protect,
  [
    check('currentPassword', 'Current password is required').exists(),
    check('newPassword', 'Please enter a new password with 6 or more characters').isLength({ min: 6 })
  ],
  changePassword
);

// @route   GET /api/users
// @desc    Get all users (Admin)
// @access  Private/Admin
router.get('/', protect, admin, getUsers);

// @route   GET /api/users/:id
// @desc    Get user by ID (Admin)
// @access  Private/Admin
router.get('/:id', protect, admin, getUserById);

// @route   PUT /api/users/:id
// @desc    Update user (Admin)
// @access  Private/Admin
router.put(
  '/:id',
  protect,
  admin,
  [
    check('name', 'Name is required').not().isEmpty(),
    check('email', 'Please include a valid email').isEmail(),
    check('role', 'Please include a valid role').isIn(['user', 'staff', 'admin']),
    check('phone', 'Please enter a valid phone number').optional().isMobilePhone()
  ],
  updateUser
);

// @route   DELETE /api/users/:id
// @desc    Delete user (Admin)
// @access  Private/Admin
router.delete('/:id', protect, admin, deleteUser);

// @route   POST /api/staff
// @desc    Create staff user (Admin)
// @access  Private/Admin
router.post(
  '/staff',
  protect,
  admin,
  [
    check('name', 'Name is required').not().isEmpty(),
    check('email', 'Please include a valid email').isEmail(),
    check('password', 'Please enter a password with 6 or more characters').isLength({ min: 6 }),
    check('phone', 'Please enter a valid phone number').optional().isMobilePhone()
  ],
  createStaff
);

module.exports = router;
