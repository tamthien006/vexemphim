const mongoose = require('mongoose');

const cinemaSchema = new mongoose.Schema(
  {
    name: { 
      type: String, 
      required: [true, 'Please add a cinema name'],
      trim: true,
      maxlength: [100, 'Name cannot be more than 100 characters']
    },
    address: {
      type: String,
      required: [true, 'Please add an address'],
      maxlength: [500, 'Address cannot be more than 500 characters']
    },
    phone: {
      type: String,
      maxlength: [20, 'Phone number cannot be longer than 20 characters'],
      match: [/^[0-9\-\+\s()]*$/, 'Please enter a valid phone number']
    },
    location: {
      // GeoJSON Point
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point'
      },
      coordinates: {
        type: [Number],
        index: '2dsphere'
      },
      formattedAddress: String,
      street: String,
      city: String,
      state: String,
      zipcode: String,
      country: String
    },
    facilities: [{
      type: String,
      enum: [
        '3D',
        '4DX',
        'IMAX',
        'Dolby Atmos',
        'Food Court',
        'Wheelchair Access',
        'Parking',
        'Online Booking',
        'Credit Card Payment',
        'Snack Bar'
      ]
    }],
    openingHours: {
      monday: { open: String, close: String },
      tuesday: { open: String, close: String },
      wednesday: { open: String, close: String },
      thursday: { open: String, close: String },
      friday: { open: String, close: String },
      saturday: { open: String, close: String },
      sunday: { open: String, close: String }
    },
    isActive: {
      type: Boolean,
      default: true
    },
    photo: {
      type: String,
      default: 'no-photo.jpg'
    },
    description: {
      type: String,
      maxlength: [1000, 'Description cannot be more than 1000 characters']
    }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Cascade delete rooms when a cinema is deleted
cinemaSchema.pre('remove', async function(next) {
  console.log(`Rooms being removed from cinema ${this._id}`);
  await this.model('Room').deleteMany({ cinemaId: this._id });
  next();
});

// Reverse populate with virtuals
cinemaSchema.virtual('rooms', {
  ref: 'Room',
  localField: '_id',
  foreignField: 'cinemaId',
  justOne: false
});

module.exports = mongoose.model('Cinema', cinemaSchema);
