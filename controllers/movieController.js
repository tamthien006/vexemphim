const Movie = require('../models/Movie');
const { validationResult } = require('express-validator');

// @desc    Get all movies
// @route   GET /api/movies
// @access  Public
exports.getMovies = async (req, res, next) => {
  try {
    const { status, search, page = 1, limit = 10 } = req.query;
    
    // Build query object
    const query = {};
    
    // Filter by status if provided
    if (status && ['showing', 'coming'].includes(status)) {
      query.status = status;
    }
    
    // Search by title if search term is provided
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { 'cast': { $regex: search, $options: 'i' } },
        { 'director': { $regex: search, $options: 'i' } },
        { 'genre': { $regex: search, $options: 'i' } }
      ];
    }
    
    // Execute query with pagination
    const movies = await Movie.find(query)
      .sort({ releaseDate: -1, title: 1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .exec();
    
    // Get total count for pagination
    const count = await Movie.countDocuments(query);
    
    // Calculate next page for pagination
    const nextPage = (page * limit) < count ? parseInt(page) + 1 : null;
    
    res.status(200).json({
      success: true,
      count: movies.length,
      total: count,
      totalPages: Math.ceil(count / limit),
      currentPage: parseInt(page),
      nextPage,
      data: movies
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Get single movie by ID
// @route   GET /api/movies/:id
// @access  Public
exports.getMovieById = async (req, res, next) => {
  try {
    const movie = await Movie.findById(req.params.id);
    
    if (!movie) {
      return res.status(404).json({
        success: false,
        message: 'Movie not found'
      });
    }
    
    // Populate reviews if needed
    await movie.populate({
      path: 'reviews',
      populate: {
        path: 'userId',
        select: 'name avatar'
      },
      options: {
        sort: { createdAt: -1 },
        limit: 5
      }
    }).execPopulate();
    
    res.status(200).json({
      success: true,
      data: movie
    });
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({
        success: false,
        message: 'Movie not found'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Create a new movie (Admin)
// @route   POST /api/movies
// @access  Private/Admin
exports.createMovie = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false,
        errors: errors.array() 
      });
    }
    
    const {
      title,
      genre,
      duration,
      description,
      cast,
      director,
      trailer,
      poster,
      status,
      releaseDate
    } = req.body;
    
    // Create movie
    const movie = new Movie({
      title,
      genre: genre || [],
      duration: parseInt(duration) || 0,
      description: description || '',
      cast: cast || [],
      director: director || '',
      trailer: trailer || '',
      poster: poster || 'default-movie.jpg',
      status: status || 'coming',
      releaseDate: releaseDate || new Date()
    });
    
    await movie.save();
    
    res.status(201).json({
      success: true,
      data: movie
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Update a movie (Admin)
// @route   PUT /api/movies/:id
// @access  Private/Admin
exports.updateMovie = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false,
        errors: errors.array() 
      });
    }
    
    const {
      title,
      genre,
      duration,
      description,
      cast,
      director,
      trailer,
      poster,
      status,
      releaseDate
    } = req.body;
    
    let movie = await Movie.findById(req.params.id);
    
    if (!movie) {
      return res.status(404).json({
        success: false,
        message: 'Movie not found'
      });
    }
    
    // Update fields
    if (title) movie.title = title;
    if (genre) movie.genre = Array.isArray(genre) ? genre : [genre];
    if (duration) movie.duration = parseInt(duration);
    if (description) movie.description = description;
    if (cast) movie.cast = Array.isArray(cast) ? cast : [cast];
    if (director) movie.director = director;
    if (trailer) movie.trailer = trailer;
    if (poster) movie.poster = poster;
    if (status) movie.status = status;
    if (releaseDate) movie.releaseDate = releaseDate;
    
    await movie.save();
    
    res.status(200).json({
      success: true,
      data: movie
    });
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({
        success: false,
        message: 'Movie not found'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Delete a movie (Admin)
// @route   DELETE /api/movies/:id
// @access  Private/Admin
exports.deleteMovie = async (req, res, next) => {
  try {
    const movie = await Movie.findById(req.params.id);
    
    if (!movie) {
      return res.status(404).json({
        success: false,
        message: 'Movie not found'
      });
    }
    
    // In a real app, you might want to check if there are any related records
    // (like schedules, tickets) before deleting
    
    await movie.remove();
    
    res.status(200).json({
      success: true,
      message: 'Movie removed',
      data: {}
    });
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({
        success: false,
        message: 'Movie not found'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Get featured movies
// @route   GET /api/movies/featured
// @access  Public
exports.getFeaturedMovies = async (req, res, next) => {
  try {
    const movies = await Movie.find({ status: 'showing' })
      .sort({ releaseDate: -1, rating: -1 })
      .limit(5);
    
    res.status(200).json({
      success: true,
      count: movies.length,
      data: movies
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Get upcoming movies
// @route   GET /api/movies/upcoming
// @access  Public
exports.getUpcomingMovies = async (req, res, next) => {
  try {
    const movies = await Movie.find({ 
      status: 'coming',
      releaseDate: { $gte: new Date() }
    })
    .sort({ releaseDate: 1 })
    .limit(5);
    
    res.status(200).json({
      success: true,
      count: movies.length,
      data: movies
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// @desc    Get movies by genre
// @route   GET /api/movies/genre/:genre
// @access  Public
exports.getMoviesByGenre = async (req, res, next) => {
  try {
    const { genre } = req.params;
    const { page = 1, limit = 10 } = req.query;
    
    const movies = await Movie.find({ 
      genre: { $regex: genre, $options: 'i' },
      status: 'showing'
    })
    .sort({ releaseDate: -1 })
    .limit(limit * 1)
    .skip((page - 1) * limit)
    .exec();
    
    const count = await Movie.countDocuments({ 
      genre: { $regex: genre, $options: 'i' },
      status: 'showing'
    });
    
    res.status(200).json({
      success: true,
      count: movies.length,
      total: count,
      totalPages: Math.ceil(count / limit),
      currentPage: parseInt(page),
      data: movies
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};
