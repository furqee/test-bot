const mongoose = require('mongoose');

const KnowledgeSchema = new mongoose.Schema({
  content: String,
  embedding: [Number],
});

module.exports = mongoose.model('knowledgeBase', KnowledgeSchema);
