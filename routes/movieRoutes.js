const express = require('express');
const { check } = require('express-validator');
const { protect, admin } = require('../middleware/authMiddleware');
const {
  getMovies,
  getMovieById,
  createMovie,
  updateMovie,
  deleteMovie,
  getFeaturedMovies,
  getUpcomingMovies,
  getMoviesByGenre
} = require('../controllers/movieController');

const router = express.Router();

// @route   GET /api/movies
// @desc    Get all movies
// @access  Public
router.get('/', getMovies);

// @route   GET /api/movies/featured
// @desc    Get featured movies
// @access  Public
router.get('/featured', getFeaturedMovies);

// @route   GET /api/movies/upcoming
// @desc    Get upcoming movies
// @access  Public
router.get('/upcoming', getUpcomingMovies);

// @route   GET /api/movies/genre/:genre
// @desc    Get movies by genre
// @access  Public
router.get('/genre/:genre', getMoviesByGenre);

// @route   GET /api/movies/:id
// @desc    Get single movie by ID
// @access  Public
router.get('/:id', getMovieById);

// @route   POST /api/movies
// @desc    Create a new movie (Admin)
// @access  Private/Admin
router.post(
  '/',
  protect,
  admin,
  [
    check('title', 'Title is required').not().isEmpty(),
    check('duration', 'Duration is required and must be a number').isNumeric(),
    check('description', 'Description is required').not().isEmpty(),
    check('director', 'Director is required').not().isEmpty(),
    check('releaseDate', 'Release date is required').isDate()
  ],
  createMovie
);

// @route   PUT /api/movies/:id
// @desc    Update a movie (Admin)
// @access  Private/Admin
router.put(
  '/:id',
  protect,
  admin,
  [
    check('title', 'Title is required').not().isEmpty(),
    check('duration', 'Duration must be a number').optional().isNumeric(),
    check('releaseDate', 'Invalid release date').optional().isDate()
  ],
  updateMovie
);

// @route   DELETE /api/movies/:id
// @desc    Delete a movie (Admin)
// @access  Private/Admin
router.delete('/:id', protect, admin, deleteMovie);

module.exports = router;
