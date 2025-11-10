const mongoose = require('mongoose');

const comboItemSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 1,
    default: 1
  }
});

const comboImageSchema = new mongoose.Schema({
  url: {
    type: String,
    required: true
  },
  isPrimary: {
    type: Boolean,
    default: false
  },
  caption: String
});

const comboPriceTierSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  description: String,
  isDefault: {
    type: Boolean,
    default: false
  }
});

const comboAvailabilitySchema = new mongoose.Schema({
  dayOfWeek: {
    type: [Number], // 0 = Sunday, 1 = Monday, etc.
    validate: {
      validator: function(v) {
        return v.every(day => day >= 0 && day <= 6);
      },
      message: 'Day of week must be between 0 (Sunday) and 6 (Saturday)'
    }
  },
  startTime: {
    type: String, // Store as 'HH:MM' format
    match: /^([01]\d|2[0-3]):([0-5]\d)$/
  },
  endTime: {
    type: String, // Store as 'HH:MM' format
    match: /^([01]\d|2[0-3]):([0-5]\d)$/
  },
  isAvailable: {
    type: Boolean,
    default: true
  }
});

const comboNutritionSchema = new mongoose.Schema({
  calories: {
    type: Number,
    min: 0
  },
  protein: {
    type: Number,
    min: 0
  },
  carbs: {
    type: Number,
    min: 0
  },
  fat: {
    type: Number,
    min: 0
  },
  allergens: [String]
});

const comboSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Please add a combo name'],
      trim: true,
      maxlength: [100, 'Name cannot be more than 100 characters'],
      index: true
    },
    description: {
      type: String,
      maxlength: [1000, 'Description cannot be more than 1000 characters']
    },
    shortDescription: {
      type: String,
      maxlength: [200, 'Short description cannot be more than 200 characters']
    },
    items: [comboItemSchema],
    price: {
      type: Number,
      required: true,
      min: 0
    },
    originalPrice: {
      type: Number,
      min: 0
    },
    priceTiers: [comboPriceTierSchema],
    category: {
      type: String,
      enum: ['combo', 'snack', 'beverage', 'dessert', 'meal'],
      default: 'combo'
    },
    images: [comboImageSchema],
    isActive: {
      type: Boolean,
      default: true,
      index: true
    },
    isFeatured: {
      type: Boolean,
      default: false
    },
    availableAt: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Cinema'
    }],
    availability: [comboAvailabilitySchema],
    preparationTime: {
      type: Number, // in minutes
      min: 0
    },
    nutrition: comboNutritionSchema,
    tags: [{
      type: String,
      trim: true
    }],
    metadata: {
      type: Map,
      of: String
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  { 
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Virtual for primary image
comboSchema.virtual('primaryImage').get(function() {
  const primary = this.images.find(img => img.isPrimary);
  return primary ? primary.url : (this.images.length > 0 ? this.images[0].url : null);
});

// Virtual for display price (considers discounts)
comboSchema.virtual('displayPrice').get(function() {
  return this.originalPrice || this.price;
});

// Virtual for discount percentage
comboSchema.virtual('discountPercentage').get(function() {
  if (!this.originalPrice || this.originalPrice <= this.price) return 0;
  return Math.round(((this.originalPrice - this.price) / this.originalPrice) * 100);
});

// Check if combo is available now
comboSchema.methods.isAvailableNow = function() {
  if (!this.isActive) return false;
  
  // If no specific availability is set, it's always available
  if (!this.availability || this.availability.length === 0) return true;
  
  const now = new Date();
  const currentDay = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
  const currentTime = now.toTimeString().substring(0, 5); // 'HH:MM' format
  
  // Check if there's any availability rule that matches current day and time
  return this.availability.some(rule => {
    // If dayOfWeek is specified and doesn't include current day, skip
    if (rule.dayOfWeek && rule.dayOfWeek.length > 0 && !rule.dayOfWeek.includes(currentDay)) {
      return false;
    }
    
    // If time range is specified, check if current time is within range
    if (rule.startTime && rule.endTime) {
      if (currentTime < rule.startTime || currentTime > rule.endTime) {
        return false;
      }
    }
    
    // If we get here, all conditions are met
    return rule.isAvailable !== false; // Default to true if not specified
  });
};

// Static method to get combos by category
comboSchema.statics.getByCategory = function(category, options = {}) {
  const { limit = 10, skip = 0, sort = 'name', order = 'asc' } = options;
  
  const query = { category, isActive: true };
  
  return this.find(query)
    .sort({ [sort]: order === 'desc' ? -1 : 1 })
    .skip(parseInt(skip))
    .limit(parseInt(limit));
};

// Static method to get featured combos
comboSchema.statics.getFeatured = function(limit = 5) {
  return this.find({ 
    isActive: true, 
    isFeatured: true 
  })
  .limit(parseInt(limit));
};

// Pre-save hook to ensure only one default price tier
comboSchema.pre('save', function(next) {
  if (this.priceTiers && this.priceTiers.length > 0) {
    const defaultTiers = this.priceTiers.filter(tier => tier.isDefault);
    
    // If more than one default, make all non-default
    if (defaultTiers.length > 1) {
      this.priceTiers.forEach(tier => {
        tier.isDefault = false;
      });
    }
    
    // If no default and we have tiers, make the first one default
    if (defaultTiers.length === 0 && this.priceTiers.length > 0) {
      this.priceTiers[0].isDefault = true;
    }
  }
  
  next();
});

// Text index for search
comboSchema.index({
  name: 'text',
  description: 'text',
  'items.name': 'text',
  tags: 'text'
});

module.exports = mongoose.model('Combo', comboSchema);
