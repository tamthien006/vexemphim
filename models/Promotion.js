const mongoose = require('mongoose');

const promotionSchema = new mongoose.Schema(
  {
    code: { 
      type: String, 
      required: true, 
      unique: true,
      uppercase: true,
      trim: true,
      index: true 
    },
    name: {
      type: String,
      required: true,
      trim: true
    },
    description: {
      type: String,
      trim: true
    },
    type: { 
      type: String, 
      enum: ['percent', 'fixed'], 
      required: true 
    },
    value: { 
      type: Number, 
      required: true,
      min: 0 
    },
    maxDiscount: {
      type: Number,
      min: 0
    },
    minOrderAmount: { 
      type: Number, 
      default: 0,
      min: 0 
    },
    startDate: { 
      type: Date, 
      required: true,
      index: true 
    },
    endDate: { 
      type: Date, 
      required: true,
      index: true 
    },
    maxUses: { 
      type: Number, 
      min: 0 
    },
    currentUses: { 
      type: Number, 
      default: 0,
      min: 0 
    },
    isActive: { 
      type: Boolean, 
      default: true,
      index: true 
    },
    applicableTo: {
      movies: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Movie'
      }],
      categories: [{
        type: String
      }]
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    usageRestrictions: {
      onePerUser: {
        type: Boolean,
        default: false
      },
      firstTimeUserOnly: {
        type: Boolean,
        default: false
      },
      minPreviousOrders: {
        type: Number,
        default: 0
      }
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

// Index for active promotions
promotionSchema.index({ isActive: 1, startDate: 1, endDate: 1 });

// Virtual for checking if promotion is currently active
promotionSchema.virtual('isCurrentlyActive').get(function() {
  const now = new Date();
  return this.isActive && 
         this.startDate <= now && 
         this.endDate >= now && 
         (this.maxUses === undefined || this.currentUses < this.maxUses);
});

// Method to check if promotion is applicable to a movie
promotionSchema.methods.isApplicableToMovie = function(movieId, movieGenres = []) {
  if (!this.isCurrentlyActive) return false;
  
  // If no specific movies or categories are specified, it's applicable to all
  if ((!this.applicableTo || !this.applicableTo.movies || this.applicableTo.movies.length === 0) &&
      (!this.applicableTo || !this.applicableTo.categories || this.applicableTo.categories.length === 0)) {
    return true;
  }
  
  // Check if movie is in the applicable movies list
  if (this.applicableTo.movies && this.applicableTo.movies.some(id => id.equals(movieId))) {
    return true;
  }
  
  // Check if any of the movie's genres match the applicable categories
  if (this.applicableTo.categories && this.applicableTo.categories.length > 0 && 
      movieGenres.some(genre => this.applicableTo.categories.includes(genre))) {
    return true;
  }
  
  return false;
};

// Method to check if promotion can be used by a user
promotionSchema.methods.canBeUsedByUser = async function(userId) {
  if (!this.isCurrentlyActive) return false;
  
  const User = mongoose.model('User');
  const user = await User.findById(userId);
  
  if (!user) return false;
  
  // Check if it's the first order and promotion is only for first-time users
  if (this.usageRestrictions.firstTimeUserOnly) {
    const orderCount = await mongoose.model('Ticket').countDocuments({ userId });
    if (orderCount > 0) return false;
  }
  
  // Check minimum previous orders requirement
  if (this.usageRestrictions.minPreviousOrders > 0) {
    const orderCount = await mongoose.model('Ticket').countDocuments({ 
      userId,
      status: 'paid'
    });
    if (orderCount < this.usageRestrictions.minPreviousOrders) return false;
  }
  
  // Check one-time use per user
  if (this.usageRestrictions.onePerUser) {
    const usageCount = await mongoose.model('Ticket').countDocuments({ 
      userId,
      'voucher.code': this.code,
      status: { $ne: 'cancelled' }
    });
    if (usageCount > 0) return false;
  }
  
  return true;
};

// Static method to validate and apply a promotion
promotionSchema.statics.validateAndApply = async function(code, userId, orderAmount = 0, movieId = null, movieGenres = []) {
  const promotion = await this.findOne({ 
    code: code.toUpperCase(),
    isActive: true,
    startDate: { $lte: new Date() },
    endDate: { $gte: new Date() }
  });
  
  if (!promotion) {
    throw new Error('Mã khuyến mãi không hợp lệ hoặc đã hết hạn');
  }
  
  // Check max uses
  if (promotion.maxUses && promotion.currentUses >= promotion.maxUses) {
    throw new Error('Mã khuyến mãi đã hết lượt sử dụng');
  }
  
  // Check minimum order amount
  if (orderAmount < promotion.minOrderAmount) {
    throw new Error(`Đơn hàng tối thiểu ${promotion.minOrderAmount.toLocaleString()}đ để áp dụng mã này`);
  }
  
  // Check if promotion is applicable to the movie
  if (movieId && !promotion.isApplicableToMovie(movieId, movieGenres)) {
    throw new Error('Mã khuyến mãi không áp dụng cho phim này');
  }
  
  // Check user eligibility
  if (userId && !(await promotion.canBeUsedByUser(userId))) {
    throw new Error('Bạn không đủ điều kiện sử dụng mã khuyến mãi này');
  }
  
  // Calculate discount amount
  let discountAmount = 0;
  
  if (promotion.type === 'percent') {
    discountAmount = (orderAmount * promotion.value) / 100;
    if (promotion.maxDiscount && discountAmount > promotion.maxDiscount) {
      discountAmount = promotion.maxDiscount;
    }
  } else {
    discountAmount = Math.min(promotion.value, orderAmount);
  }
  
  return {
    success: true,
    promotion: {
      id: promotion._id,
      code: promotion.code,
      name: promotion.name,
      type: promotion.type,
      value: promotion.value,
      maxDiscount: promotion.maxDiscount,
      discountAmount
    }
  };
};

// Increment usage counter when a promotion is used
promotionSchema.methods.incrementUsage = async function() {
  if (this.maxUses && this.currentUses >= this.maxUses) {
    throw new Error('Promotion usage limit reached');
  }
  
  this.currentUses += 1;
  
  // If we've reached max uses, deactivate
  if (this.maxUses && this.currentUses >= this.maxUses) {
    this.isActive = false;
  }
  
  return this.save();
};

module.exports = mongoose.model('Promotion', promotionSchema);
