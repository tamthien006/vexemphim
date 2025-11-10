const mongoose = require('mongoose');

const seatSchema = new mongoose.Schema({
  code: { 
    type: String, 
    required: true,
    trim: true,
    uppercase: true
  },
  type: { 
    type: String, 
    enum: ['standard', 'vip'], 
    required: true 
  },
  price: { 
    type: Number, 
    required: true,
    min: 0
  }
});

const comboItemSchema = new mongoose.Schema({
  comboId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Combo' 
  },
  name: {
    type: String,
    required: true
  },
  qty: {
    type: Number,
    required: true,
    min: 1
  },
  price: {
    type: Number,
    required: true,
    min: 0
  }
});

const ticketSchema = new mongoose.Schema(
  {
    userId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'User', 
      required: true,
      index: true 
    },
    scheduleId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'Schedule', 
      required: true,
      index: true 
    },
    roomId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'Room', 
      required: true,
      index: true 
    },
    seats: [seatSchema],
    combos: [comboItemSchema],
    voucher: {
      code: String,
      discountValue: {
        type: Number,
        min: 0
      },
      discountType: {
        type: String,
        enum: ['percent', 'fixed']
      },
      maxDiscount: Number
    },
    subtotal: {
      type: Number,
      required: true,
      min: 0
    },
    discount: {
      type: Number,
      default: 0,
      min: 0
    },
    totalAmount: { 
      type: Number, 
      required: true,
      min: 0 
    },
    paymentMethod: { 
      type: String, 
      enum: ['momo', 'zalopay', 'card', 'cash'], 
      required: true 
    },
    status: { 
      type: String, 
      enum: ['pending', 'paid', 'cancelled', 'refunded'], 
      default: 'pending',
      index: true 
    },
    paymentStatus: {
      type: String,
      enum: ['pending', 'completed', 'failed', 'refunded'],
      default: 'pending'
    },
    qrCode: {
      type: String,
      unique: true,
      sparse: true
    },
    checkInTime: Date,
    notes: {
      type: String,
      maxlength: [500, 'Notes cannot be more than 500 characters']
    },
    cancellationReason: {
      type: String,
      maxlength: [500, 'Cancellation reason cannot be more than 500 characters']
    },
    cancelledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    cancelledAt: Date,
    pendingExpiresAt: { 
      type: Date, 
      default: () => new Date(Date.now() + 10*60*1000), // 10 minutes
      index: { expireAfterSeconds: 0 } 
    }
  },
  { 
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Index to prevent double booking of seats for the same schedule
ticketSchema.index(
  { scheduleId: 1, 'seats.code': 1 },
  { 
    unique: true, 
    partialFilterExpression: { 
      status: { $ne: 'cancelled' } 
    },
    message: 'One or more seats are already booked for this show.'
  }
);

// Virtual for payment
ticketSchema.virtual('payment', {
  ref: 'Payment',
  localField: '_id',
  foreignField: 'ticketId',
  justOne: true
});

// Virtual for schedule
ticketSchema.virtual('schedule', {
  ref: 'Schedule',
  localField: 'scheduleId',
  foreignField: '_id',
  justOne: true
});

// Virtual for user
ticketSchema.virtual('user', {
  ref: 'User',
  localField: 'userId',
  foreignField: '_id',
  justOne: true
});

// Virtual for room
ticketSchema.virtual('room', {
  ref: 'Room',
  localField: 'roomId',
  foreignField: '_id',
  justOne: true
});

// Calculate ticket totals before saving
ticketSchema.pre('save', async function(next) {
  if (this.isNew || this.isModified('seats') || this.isModified('combos') || this.isModified('voucher')) {
    // Calculate subtotal from seats and combos
    const seatTotal = this.seats.reduce((sum, seat) => sum + seat.price, 0);
    const comboTotal = this.combos.reduce((sum, combo) => sum + (combo.price * combo.qty), 0);
    this.subtotal = seatTotal + comboTotal;
    
    // Apply voucher discount if applicable
    let discount = 0;
    if (this.voucher && this.voucher.discountValue) {
      if (this.voucher.discountType === 'percent') {
        discount = (this.subtotal * this.voucher.discountValue) / 100;
        if (this.voucher.maxDiscount && discount > this.voucher.maxDiscount) {
          discount = this.voucher.maxDiscount;
        }
      } else {
        discount = Math.min(this.voucher.discountValue, this.subtotal);
      }
    }
    
    this.discount = discount;
    this.totalAmount = this.subtotal - this.discount;
  }
  
  next();
});

// Generate QR code before saving a new ticket
ticketSchema.pre('save', async function(next) {
  if (this.isNew) {
    // In a real app, you would generate a unique QR code here
    // For example: this.qrCode = `TICKET-${this._id}-${Date.now()}`;
    // For now, we'll use a simple string
    this.qrCode = `TICKET-${this._id}`;
  }
  next();
});

// Update schedule occupancy after saving
// Update schedule occupancy after saving
ticketSchema.post('save', async function(doc) {
  try {
    const Schedule = mongoose.model('Schedule');
    const schedule = await Schedule.findById(doc.scheduleId);
    
    if (schedule) {
      await schedule.updateOccupancy();
    }
  } catch (err) {
    console.error('Error updating schedule occupancy:', err);
  }
});

// Update schedule occupancy after removing
ticketSchema.post('remove', async function(doc) {
  try {
    const Schedule = mongoose.model('Schedule');
    const schedule = await Schedule.findById(doc.scheduleId);
    
    if (schedule) {
      await schedule.updateOccupancy();
    }
  } catch (err) {
    console.error('Error updating schedule occupancy after removal:', err);
  }
});

// Method to cancel a ticket
ticketSchema.methods.cancel = async function(userId, reason = '') {
  if (this.status === 'cancelled') {
    throw new Error('Ticket is already cancelled');
  }
  
  // In a real app, you might want to add more validation here
  // For example, check if the show has already started
  
  this.status = 'cancelled';
  this.cancellationReason = reason;
  this.cancelledBy = userId;
  this.cancelledAt = new Date();
  
  await this.save();
  
  // In a real app, you would also process a refund here if needed
  
  return this;
};

// Static method to get booking summary for a user
ticketSchema.statics.getUserBookingSummary = async function(userId) {
  const Ticket = this;
  
  const [upcoming, past, cancelled] = await Promise.all([
    Ticket.find({ 
      userId,
      status: 'paid',
      'schedule.startTime': { $gte: new Date() }
    })
    .sort('schedule.startTime')
    .populate('scheduleId', 'startTime movieId')
    .populate('scheduleId.movieId', 'title poster'),
    
    Ticket.find({ 
      userId,
      status: 'paid',
      'schedule.startTime': { $lt: new Date() }
    })
    .sort('-schedule.startTime')
    .populate('scheduleId', 'startTime movieId')
    .populate('scheduleId.movieId', 'title poster'),
    
    Ticket.find({ 
      userId,
      status: 'cancelled'
    })
    .sort('-updatedAt')
    .populate('scheduleId', 'startTime movieId')
    .populate('scheduleId.movieId', 'title')
  ]);
  
  return {
    upcoming,
    past,
    cancelled,
    stats: {
      totalBookings: upcoming.length + past.length + cancelled.length,
      upcoming: upcoming.length,
      past: past.length,
      cancelled: cancelled.length
    }
  };
};

module.exports = mongoose.model('Ticket', ticketSchema);
