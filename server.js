require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const OpenAI = require('openai');
const Knowledge = require('./Knowledge');

const app = express();
app.use(express.json());

mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('MongoDB connected')
})
  .catch(err => console.error(err));

  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY, // This is the default and can be omitted
});

// Helper function to generate embeddings with retry logic
async function generateEmbedding(text, retries = 3) {
  try {
    const embedding = await openai.embeddings.create({
        model: "text-embedding-ada-002",
        input: text,
        encoding_format: "float",
        });
    return embedding.data.data[0].embedding;
  } catch (error) {
    if (error.response && error.response.status === 429 && retries > 0) {
      console.log('Rate limit exceeded. Retrying...');
      await new Promise(resolve => setTimeout(resolve, 1000)); // wait for 1 second before retrying
      return generateEmbedding(text, retries - 1);
    } else {
      console.error('Failed to generate embedding:', error.message);
      //throw error;
    }
  }
}

// Helper function to get answer from LLM with retry logic
async function getAnswer(question, context, retries = 3) {
  try {
    const chatCompletion = await openai.chat.completions.create({
        messages: [{ role: 'user', content: question, context: context }],
        model: 'gpt-3.5-turbo',
      });
    return chatCompletion.data.choices[0].text.trim();
  } catch (error) {
    if (error.response && error.response.status === 429 && retries > 0) {
      console.log('Rate limit exceeded. Retrying...');
      await new Promise(resolve => setTimeout(resolve, 1000)); // wait for 1 second before retrying
      return getAnswer(question, context, retries - 1);
    } else {
      console.error('Failed to get answer:', error.message);
      throw error;
    }
  }
}

// Endpoint to add knowledge
app.post('/add-knowledge', async (req, res) => {
  try {
    const { content } = req.body;
    const existingKnowledge = await Knowledge.findOne({ content });

    if (existingKnowledge) {
      return res.status(200).send(existingKnowledge);
    }

    const embedding = await generateEmbedding(content);
    let knowledge;
    if (embedding) {
        knowledge = new Knowledge({ content, embedding });
    } else {
        knowledge = new Knowledge({ content, embedding: [0] });
    }
    //const knowledge = new Knowledge({ content, embedding });
    await knowledge.save();
    res.status(201).send(knowledge);
  } catch (error) {
    res.status(500).send({ error: 'Failed to add knowledge' });
  }
});

// Endpoint to ask questions
app.post('/ask', async (req, res) => {
  try {
    const { question } = req.body;
    const questionEmbedding = await generateEmbedding(question);

    const knowledgeData = await Knowledge.find();
    let mostRelevant = { content: '', similarity: -1 };

    // Find the most relevant knowledge using cosine similarity
    for (const knowledge of knowledgeData) {
      const similarity = cosineSimilarity(questionEmbedding, knowledge.embedding);
      if (similarity > mostRelevant.similarity) {
        mostRelevant = { content: knowledge.content, similarity };
      }
    }

    const answer = await getAnswer(question, mostRelevant.content);
    res.send({ answer });
  } catch (error) {
    res.status(500).send({ error: 'Failed to get answer' });
  }
});

function cosineSimilarity(vecA, vecB) {
  const dotProduct = vecA.reduce((acc, val, i) => acc + val * vecB[i], 0);
  const magnitudeA = Math.sqrt(vecA.reduce((acc, val) => acc + val * val, 0));
  const magnitudeB = Math.sqrt(vecB.reduce((acc, val) => acc + val * val, 0));
  return dotProduct / (magnitudeA * magnitudeB);
}

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
