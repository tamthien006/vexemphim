const mongoose = require('mongoose');

const movieSchema = new mongoose.Schema(
  {
    title: { 
      type: String, 
      required: true, 
      trim: true,
      index: true 
    },
    genre: [{
      type: String,
      trim: true
    }],
    duration: {
      type: Number, // in minutes
      required: true
    },
    description: {
      type: String,
      required: true
    },
    cast: [{
      type: String,
      trim: true
    }],
    director: {
      type: String,
      trim: true
    },
    trailer: {
      type: String,
      match: [/^https?:\/\//, 'Please use a valid URL with HTTP or HTTPS']
    },
    poster: {
      type: String,
      default: 'default-movie.jpg'
    },
    status: { 
      type: String, 
      enum: ['showing', 'coming'], 
      default: 'showing',
      index: true 
    },
    releaseDate: {
      type: Date,
      required: true
    },
    rating: {
      type: Number,
      min: 0,
      max: 10,
      default: 0
    },
    numReviews: {
      type: Number,
      default: 0
    }
  },
  { 
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Virtual for reviews
movieSchema.virtual('reviews', {
  ref: 'Review',
  localField: '_id',
  foreignField: 'movieId',
  justOne: false
});

// Calculate average rating
movieSchema.statics.getAverageRating = async function(movieId) {
  const obj = await this.aggregate([
    {
      $match: { _id: mongoose.Types.ObjectId(movieId) }
    },
    {
      $lookup: {
        from: 'reviews',
        localField: '_id',
        foreignField: 'movieId',
        as: 'reviews'
      }
    },
    {
      $addFields: {
        averageRating: { $avg: '$reviews.rating' },
        numReviews: { $size: '$reviews' }
      }
    },
    {
      $project: {
        rating: { $ifNull: ['$averageRating', 0] },
        numReviews: 1
      }
    }
  ]);

  try {
    await this.model('Movie').findByIdAndUpdate(movieId, {
      rating: obj[0].rating.toFixed(1),
      numReviews: obj[0].numReviews
    });
  } catch (err) {
    console.error(err);
  }
};

// Call getAverageRating after save or delete review
movieSchema.post('save', function() {
  this.constructor.getAverageRating(this._id);
});

module.exports = mongoose.model('Movie', movieSchema);
