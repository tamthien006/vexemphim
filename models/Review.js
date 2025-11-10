const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema(
  {
    movieId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'Movie', 
      required: true,
      index: true 
    },
    userId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'User', 
      required: true,
      index: true 
    },
    rating: { 
      type: Number, 
      required: true,
      min: 1, 
      max: 5 
    },
    title: {
      type: String,
      trim: true,
      maxlength: [100, 'Title cannot be more than 100 characters']
    },
    comment: {
      type: String,
      trim: true,
      maxlength: [2000, 'Comment cannot be more than 2000 characters']
    },
    likes: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }],
    dislikes: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }],
    isVerifiedPurchase: {
      type: Boolean,
      default: false
    },
    ticketId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Ticket'
    },
    isFeatured: {
      type: Boolean,
      default: false
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
      index: true
    },
    adminResponse: {
      message: String,
      respondedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      respondedAt: Date
    },
    metadata: {
      type: Map,
      of: String
    }
  },
  { 
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Compound index to ensure one review per user per movie
reviewSchema.index({ movieId: 1, userId: 1 }, { unique: true });

// Index for sorting and filtering
reviewSchema.index({ rating: 1, createdAt: -1 });
reviewSchema.index({ likes: -1, createdAt: -1 });

// Virtual for like count
reviewSchema.virtual('likeCount').get(function() {
  return this.likes ? this.likes.length : 0;
});

// Virtual for dislike count
reviewSchema.virtual('dislikeCount').get(function() {
  return this.dislikes ? this.dislikes.length : 0;
});

// Virtual for user (to populate)
reviewSchema.virtual('user', {
  ref: 'User',
  localField: 'userId',
  foreignField: '_id',
  justOne: true
});

// Virtual for movie (to populate)
reviewSchema.virtual('movie', {
  ref: 'Movie',
  localField: 'movieId',
  foreignField: '_id',
  justOne: true
});

// Static method to get average rating for a movie
reviewSchema.statics.getAverageRating = async function(movieId) {
  const obj = await this.aggregate([
    {
      $match: { movieId: mongoose.Types.ObjectId(movieId), status: 'approved' }
    },
    {
      $group: {
        _id: '$movieId',
        averageRating: { $avg: '$rating' },
        numReviews: { $sum: 1 }
      }
    }
  ]);

  try {
    const Movie = mongoose.model('Movie');
    await Movie.findByIdAndUpdate(movieId, {
      rating: obj[0] ? parseFloat(obj[0].averageRating.toFixed(1)) : 0,
      numReviews: obj[0] ? obj[0].numReviews : 0
    });
  } catch (err) {
    console.error(err);
  }
};

// Call getAverageRating after save
reviewSchema.post('save', function() {
  this.constructor.getAverageRating(this.movieId);
});

// Call getAverageRating after remove
reviewSchema.post('remove', function() {
  this.constructor.getAverageRating(this.movieId);
});

// Method to toggle like/dislike
reviewSchema.methods.toggleLike = async function(userId) {
  const userLiked = this.likes.includes(userId);
  const userDisliked = this.dislikes.includes(userId);
  
  if (userLiked) {
    // If already liked, remove like
    this.likes.pull(userId);
  } else {
    // Add like and remove dislike if exists
    this.likes.addToSet(userId);
    if (userDisliked) {
      this.dislikes.pull(userId);
    }
  }
  
  await this.save();
  return { liked: !userLiked, likeCount: this.likes.length, dislikeCount: this.dislikes.length };
};

// Method to toggle dislike
reviewSchema.methods.toggleDislike = async function(userId) {
  const userDisliked = this.dislikes.includes(userId);
  const userLiked = this.likes.includes(userId);
  
  if (userDisliked) {
    // If already disliked, remove dislike
    this.dislikes.pull(userId);
  } else {
    // Add dislike and remove like if exists
    this.dislikes.addToSet(userId);
    if (userLiked) {
      this.likes.pull(userId);
    }
  }
  
  await this.save();
  return { disliked: !userDisliked, likeCount: this.likes.length, dislikeCount: this.dislikes.length };
};

// Static method to get reviews with filtering and pagination
reviewSchema.statics.getReviews = async function(movieId, options = {}) {
  const { 
    page = 1, 
    limit = 10, 
    sortBy = 'createdAt', 
    sortOrder = 'desc',
    minRating = 1,
    maxRating = 5,
    status = 'approved',
    withUser = false,
    withMovie = false
  } = options;
  
  const query = { 
    movieId,
    rating: { $gte: minRating, $lte: maxRating }
  };
  
  if (status) {
    query.status = status;
  }
  
  const sort = {};
  sort[sortBy] = sortOrder === 'desc' ? -1 : 1;
  
  const reviews = await this.find(query)
    .sort(sort)
    .limit(parseInt(limit))
    .skip((parseInt(page) - 1) * parseInt(limit))
    .populate(withUser ? 'userId' : '', 'name avatar')
    .populate(withMovie ? 'movieId' : '', 'title poster');
    
  const total = await this.countDocuments(query);
  
  return {
    reviews,
    page: parseInt(page),
    limit: parseInt(limit),
    total,
    pages: Math.ceil(total / parseInt(limit))
  };
};

// Static method to get rating distribution
reviewSchema.statics.getRatingDistribution = async function(movieId) {
  const result = await this.aggregate([
    {
      $match: { 
        movieId: mongoose.Types.ObjectId(movieId),
        status: 'approved'
      }
    },
    {
      $group: {
        _id: '$rating',
        count: { $sum: 1 }
      }
    },
    {
      $sort: { _id: -1 }
    }
  ]);
  
  // Initialize all possible ratings with count 0
  const distribution = {
    5: 0,
    4: 0,
    3: 0,
    2: 0,
    1: 0
  };
  
  // Update with actual counts
  result.forEach(item => {
    distribution[item._id] = item.count;
  });
  
  return distribution;
};

module.exports = mongoose.model('Review', reviewSchema);
