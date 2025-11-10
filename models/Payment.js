const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema(
  {
    ticketId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'Ticket', 
      required: true,
      index: true 
    },
    userId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'User', 
      required: true,
      index: true 
    },
    amount: { 
      type: Number, 
      required: true,
      min: 0 
    },
    method: { 
      type: String, 
      enum: ['momo', 'zalopay', 'card', 'cash'], 
      required: true 
    },
    transactionId: {
      type: String,
      unique: true,
      sparse: true
    },
    status: { 
      type: String, 
      enum: ['pending', 'success', 'failed', 'refunded'], 
      default: 'pending',
      index: true 
    },
    paymentDetails: {
      // For storing additional payment provider details
      provider: String,
      accountInfo: String,
      transactionTime: Date,
      responseCode: String,
      responseMessage: String
    },
    refundDetails: {
      amount: Number,
      reason: String,
      processedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      processedAt: Date,
      referenceId: String
    },
    ipAddress: String,
    userAgent: String
  },
  { 
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Index for querying payments by date range
paymentSchema.index({ createdAt: 1 });
paymentSchema.index({ 'paymentDetails.transactionTime': 1 });

// Virtual for ticket
paymentSchema.virtual('ticket', {
  ref: 'Ticket',
  localField: 'ticketId',
  foreignField: '_id',
  justOne: true
});

// Virtual for user
paymentSchema.virtual('user', {
  ref: 'User',
  localField: 'userId',
  foreignField: '_id',
  justOne: true
});

// Update ticket status when payment status changes
paymentSchema.pre('save', async function(next) {
  if (this.isModified('status')) {
    const Ticket = mongoose.model('Ticket');
    
    try {
      const ticket = await Ticket.findById(this.ticketId);
      if (!ticket) {
        throw new Error('Ticket not found');
      }
      
      // Only update if status is different
      if (ticket.paymentStatus !== this.status) {
        ticket.paymentStatus = this.status;
        
        // If payment is successful, update ticket status to paid
        if (this.status === 'success' && ticket.status === 'pending') {
          ticket.status = 'paid';
        }
        
        // If payment is refunded, update ticket status to refunded
        if (this.status === 'refunded' && ticket.status === 'paid') {
          ticket.status = 'refunded';
        }
        
        await ticket.save();
      }
    } catch (error) {
      console.error('Error updating ticket status:', error);
      // Don't stop the save operation if ticket update fails
    }
  }
  
  next();
});

// Generate a unique transaction ID before saving
paymentSchema.pre('save', function(next) {
  if (this.isNew && !this.transactionId) {
    // In a real app, generate a more sophisticated transaction ID
    this.transactionId = `PAY-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  }
  next();
});

// Static method to get payment summary
getPaymentSummary = async function(startDate, endDate) {
  const Payment = this;
  
  const match = {};
  if (startDate || endDate) {
    match.createdAt = {};
    if (startDate) match.createdAt.$gte = new Date(startDate);
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      match.createdAt.$lte = end;
    }
  }
  
  const result = await Payment.aggregate([
    { $match: match },
    {
      $group: {
        _id: {
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' },
          day: { $dayOfMonth: '$createdAt' },
          method: '$method',
          status: '$status'
        },
        count: { $sum: 1 },
        totalAmount: { $sum: '$amount' }
      }
    },
    {
      $sort: {
        '_id.year': -1,
        '_id.month': -1,
        '_id.day': -1,
        '_id.method': 1
      }
    }
  ]);
  
  return result;
};

// Static method to process a refund
paymentSchema.statics.processRefund = async function(paymentId, userId, reason = '') {
  const Payment = this;
  const payment = await Payment.findById(paymentId);
  
  if (!payment) {
    throw new Error('Payment not found');
  }
  
  if (payment.status !== 'success') {
    throw new Error('Only successful payments can be refunded');
  }
  
  // In a real app, you would integrate with the payment provider's API here
  // to process the refund
  
  // For demo purposes, we'll just update the status
  payment.status = 'refunded';
  payment.refundDetails = {
    amount: payment.amount,
    reason,
    processedBy: userId,
    processedAt: new Date()
  };
  
  await payment.save();
  
  // The pre-save hook will update the associated ticket status
  
  return payment;
};

module.exports = mongoose.model('Payment', paymentSchema);
