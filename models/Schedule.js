const mongoose = require('mongoose');

const scheduleSchema = new mongoose.Schema(
  {
    movieId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'Movie', 
      required: true,
      index: true 
    },
    cinemaId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'Cinema', 
      required: true,
      index: true 
    },
    roomId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'Room', 
      required: true,
      index: true 
    },
    startTime: { 
      type: Date, 
      required: true,
      index: true 
    },
    endTime: { 
      type: Date,
      required: true
    },
    priceTable: {
      standard: { 
        type: Number, 
        required: true,
        min: 0
      },
      vip: { 
        type: Number, 
        required: true,
        min: 0
      },
      earlyBirdDiscount: {
        type: Number,
        min: 0,
        max: 100,
        default: 0
      },
      earlyBirdEndTime: {
        type: Date
      }
    },
    status: {
      type: String,
      enum: ['scheduled', 'cancelled', 'completed'],
      default: 'scheduled'
    },
    isFull: {
      type: Boolean,
      default: false
    },
    notes: {
      type: String,
      maxlength: [500, 'Notes cannot be more than 500 characters']
    }
  },
  { 
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Index for querying schedules by date range
scheduleSchema.index({ startTime: 1, endTime: 1 });

// Compound index to prevent double booking of rooms
scheduleSchema.index(
  { roomId: 1, startTime: 1, endTime: 1 },
  { 
    unique: true,
    partialFilterExpression: { 
      status: { $ne: 'cancelled' } 
    },
    message: 'This room is already booked for the selected time slot.'
  }
);

// Virtual for tickets
scheduleSchema.virtual('tickets', {
  ref: 'Ticket',
  localField: '_id',
  foreignField: 'scheduleId',
  justOne: false
});

// Calculate end time based on movie duration before saving
scheduleSchema.pre('save', async function(next) {
  if (this.isNew || this.isModified('startTime') || this.isModified('movieId')) {
    const Movie = mongoose.model('Movie');
    const movie = await Movie.findById(this.movieId);
    
    if (!movie) {
      throw new Error('Movie not found');
    }
    
    // Add 30 minutes buffer for cleaning and preparation
    this.endTime = new Date(this.startTime.getTime() + (movie.duration + 30) * 60000);
  }
  
  next();
});

// Check for overlapping schedules in the same room
scheduleSchema.pre('save', async function(next) {
  if (this.isNew || this.isModified('startTime') || this.isModified('endTime') || this.isModified('roomId')) {
    const Schedule = mongoose.model('Schedule');
    
    const existingSchedule = await Schedule.findOne({
      _id: { $ne: this._id },
      roomId: this.roomId,
      status: { $ne: 'cancelled' },
      $or: [
        { startTime: { $lt: this.endTime, $gte: this.startTime } },
        { endTime: { $gt: this.startTime, $lte: this.endTime } },
        { startTime: { $lte: this.startTime }, endTime: { $gte: this.endTime } }
      ]
    });
    
    if (existingSchedule) {
      const err = new Error('This room is already booked for the selected time slot.');
      err.statusCode = 400;
      return next(err);
    }
  }
  
  next();
});

// Update room's isFull status based on ticket sales
scheduleSchema.methods.updateOccupancy = async function() {
  const Ticket = mongoose.model('Ticket');
  const Room = mongoose.model('Room');
  
  const room = await Room.findById(this.roomId);
  if (!room) return;
  
  const tickets = await Ticket.find({
    scheduleId: this._id,
    status: { $ne: 'cancelled' }
  });
  
  const totalBookedSeats = tickets.reduce((total, ticket) => total + ticket.seats.length, 0);
  this.isFull = totalBookedSeats >= room.capacity;
  
  await this.save();
};

// Static method to get available time slots for a room
scheduleSchema.statics.getAvailableSlots = async function(roomId, date, duration) {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);
  
  const existingSchedules = await this.find({
    roomId,
    status: { $ne: 'cancelled' },
    $or: [
      { startTime: { $gte: startOfDay, $lte: endOfDay } },
      { endTime: { $gte: startOfDay, $lte: endOfDay } },
      { startTime: { $lte: startOfDay }, endTime: { $gte: endOfDay } }
    ]
  }).sort('startTime');
  
  const availableSlots = [];
  let currentTime = new Date(startOfDay);
  currentTime.setHours(9, 0, 0, 0); // Cinema opens at 9 AM
  
  const closingTime = new Date(startOfDay);
  closingTime.setHours(23, 0, 0, 0); // Last show starts by 11 PM
  
  const slotDuration = (duration + 30) * 60000; // Movie duration + 30 mins cleaning time
  
  while (currentTime <= closingTime) {
    const slotEndTime = new Date(currentTime.getTime() + slotDuration);
    
    // Check if this slot is available
    const isAvailable = !existingSchedules.some(schedule => {
      return (
        (currentTime >= schedule.startTime && currentTime < schedule.endTime) ||
        (slotEndTime > schedule.startTime && slotEndTime <= schedule.endTime) ||
        (currentTime <= schedule.startTime && slotEndTime >= schedule.endTime)
      );
    });
    
    if (isAvailable) {
      availableSlots.push({
        startTime: new Date(currentTime),
        endTime: new Date(slotEndTime)
      });
    }
    
    // Move to next possible slot (every 15 minutes)
    currentTime = new Date(currentTime.getTime() + 15 * 60000);
  }
  
  return availableSlots;
};

module.exports = mongoose.model('Schedule', scheduleSchema);
