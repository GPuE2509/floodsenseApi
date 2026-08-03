const mongoose = require('mongoose');
const { Schema } = mongoose;

const rankHistorySchema = new Schema({
  user_id: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  period_type: { 
    type: String, 
    enum: ['Weekly', 'Monthly', 'Quarterly', 'Yearly'], 
    required: true 
  },
  period_value: { 
    type: String, 
    required: true 
    // Format examples: '2026-W24', '2026-M07', '2026-Q3', '2026'
  },
  tab: { 
    type: String, 
    enum: ['All', 'User', 'Volunteer', 'Workshop'], 
    required: true 
  },
  points: { 
    type: Number, 
    required: true 
  },
  rank: { 
    type: Number, 
    required: true 
  }
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

// Create a compound index to quickly look up a user's rank for a specific period and tab
rankHistorySchema.index({ user_id: 1, period_type: 1, period_value: 1, tab: 1 }, { unique: true });

module.exports = mongoose.model('RankHistory', rankHistorySchema);
