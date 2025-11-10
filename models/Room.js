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
    default: 'standard' 
  },
  status: { 
    type: String, 
    enum: ['available', 'maintenance'], 
    default: 'available' 
  },
  row: { type: Number, required: true },
  column: { type: Number, required: true }
});

const roomSchema = new mongoose.Schema(
  {
    cinemaId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'Cinema', 
      required: true,
      index: true 
    },
    name: { 
      type: String, 
      required: true,
      trim: true
    },
    capacity: {
      type: Number,
      required: true,
      min: 1
    },
    seats: [seatSchema],
    screenType: {
      type: String,
      enum: ['standard', '3d', 'imax', '4dx'],
      default: 'standard'
    },
    isActive: {
      type: Boolean,
      default: true
    },
    features: [{
      type: String,
      enum: ['dolby-atmos', 'wheelchair-access', 'recliner-seats', 'sofa']
    }]
  },
  { 
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Create seat map before saving
roomSchema.pre('save', function(next) {
  if (this.isNew || this.isModified('capacity')) {
    this.seats = this.generateSeatMap();
    this.capacity = this.seats.length;
  }
  next();
});

// Generate seat map based on capacity
roomSchema.methods.generateSeatMap = function() {
  const rows = Math.ceil(Math.sqrt(this.capacity * 1.5)); // More rows than columns
  const seatsPerRow = Math.ceil(this.capacity / rows);
  const seats = [];
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  
  let seatNumber = 0;
  
  for (let row = 0; row < rows && seatNumber < this.capacity; row++) {
    const rowLetter = alphabet[row];
    
    for (let col = 1; col <= seatsPerRow && seatNumber < this.capacity; col++) {
      const seatType = (row < 2) ? 'vip' : 'standard';
      
      seats.push({
        code: `${rowLetter}${col}`,
        type: seatType,
        status: 'available',
        row: row,
        column: col - 1
      });
      
      seatNumber++;
    }
  }
  
  return seats;
};

// Get available seats for a specific schedule
roomSchema.methods.getAvailableSeats = async function(scheduleId) {
  const Schedule = mongoose.model('Schedule');
  const schedule = await Schedule.findById(scheduleId);
  
  if (!schedule) {
    throw new Error('Schedule not found');
  }
  
  // Get all tickets for this schedule that are not cancelled
  const tickets = await mongoose.model('Ticket').find({
    scheduleId: schedule._id,
    status: { $ne: 'cancelled' }
  });
  
  // Get all booked seat codes
  const bookedSeats = new Set();
  tickets.forEach(ticket => {
    ticket.seats.forEach(seat => {
      bookedSeats.add(seat.code);
    });
  });
  
  // Mark seats as available or booked
  return this.seats.map(seat => ({
    ...seat.toObject(),
    status: bookedSeats.has(seat.code) ? 'booked' : seat.status
  }));
};

// Virtual for schedules
roomSchema.virtual('schedules', {
  ref: 'Schedule',
  localField: '_id',
  foreignField: 'roomId',
  justOne: false
});

// Cascade delete schedules when a room is deleted
roomSchema.pre('remove', async function(next) {
  console.log(`Schedules being removed from room ${this._id}`);
  await this.model('Schedule').deleteMany({ roomId: this._id });
  next();
});

// Compound index to ensure unique room names within a cinema
roomSchema.index({ cinemaId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('Room', roomSchema);
