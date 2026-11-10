// 板块表
const mongoose = require('mongoose')
const schema = new mongoose.Schema({
  keyName: { // 板块名
    type: String,
    required: [true, 'Key名必填']
  },
  lastUpdated: {
    type: mongoose.SchemaTypes.Date,
    default: Date.now
  }
})

module.exports = mongoose.model('Key', schema)