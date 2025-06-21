
const express = require('express');
const bodyParser = require('body-parser');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Initialize Gemini AI
let genAI, model;
try {
  genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });
} catch (error) {
  console.error('Error initializing Gemini AI:', error.message);
}

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Statistics tracking
let stats = {
  totalMessages: 0,
  messagesThisHour: 0,
  lastReset: new Date(),
  recentMessages: []
};

// Reset hourly stats
setInterval(() => {
  stats.messagesThisHour = 0;
  stats.lastReset = new Date();
}, 3600000);

// Dashboard route
app.get('/', (req, res) => {
  const config = {
    geminiConfigured: !!process.env.GEMINI_API_KEY,
    facebookConfigured: !!(process.env.FACEBOOK_PAGE_ACCESS_TOKEN && process.env.FACEBOOK_VERIFY_TOKEN),
    webhookUrl: `${req.protocol}://${req.get('host')}/webhook`
  };
  
  res.render('dashboard', { stats, config });
});

// Test interface
app.get('/test', (req, res) => {
  res.render('test');
});

// API configuration endpoint
app.get('/api/config', (req, res) => {
  res.json({
    geminiConfigured: !!process.env.GEMINI_API_KEY,
    facebookConfigured: !!(process.env.FACEBOOK_PAGE_ACCESS_TOKEN && process.env.FACEBOOK_VERIFY_TOKEN),
    webhookUrl: `${req.protocol}://${req.get('host')}/webhook`,
    stats: stats
  });
});

// Test Gemini endpoint
app.post('/api/test-gemini', async (req, res) => {
  try {
    if (!model) {
      return res.json({ 
        success: false, 
        error: 'Gemini API not configured. Please add GEMINI_API_KEY to your environment variables.' 
      });
    }

    const { message } = req.body;
    const prompt = `You are a helpful Facebook page bot. Respond to this message in a friendly and helpful way: "${message}"`;
    const result = await model.generateContent(prompt);
    const response = result.response;
    
    res.json({ 
      success: true, 
      response: response.text(),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Facebook webhook verification
app.get('/webhook', (req, res) => {
  const VERIFY_TOKEN = process.env.FACEBOOK_VERIFY_TOKEN;
  
  if (!VERIFY_TOKEN) {
    return res.status(500).send('FACEBOOK_VERIFY_TOKEN not configured');
  }
  
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  
  if (mode && token) {
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('WEBHOOK_VERIFIED');
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  }
});

// Handle incoming Facebook messages
app.post('/webhook', async (req, res) => {
  const body = req.body;
  
  if (body.object === 'page') {
    body.entry.forEach(async (entry) => {
      const webhookEvent = entry.messaging[0];
      console.log('Webhook event:', webhookEvent);
      
      if (webhookEvent.message) {
        await handleMessage(webhookEvent.sender.id, webhookEvent.message.text);
      }
    });
    
    res.status(200).send('EVENT_RECEIVED');
  } else {
    res.sendStatus(404);
  }
});

// Handle message with Gemini AI
async function handleMessage(senderId, messageText) {
  try {
    console.log(`Received message from ${senderId}: ${messageText}`);
    
    // Update statistics
    stats.totalMessages++;
    stats.messagesThisHour++;
    stats.recentMessages.unshift({
      senderId,
      message: messageText,
      timestamp: new Date(),
      response: null
    });
    
    // Keep only last 10 messages
    if (stats.recentMessages.length > 10) {
      stats.recentMessages = stats.recentMessages.slice(0, 10);
    }
    
    if (!model) {
      const errorMsg = 'Bot configuration error. Please contact administrator.';
      await sendFacebookMessage(senderId, errorMsg);
      return;
    }
    
    // Generate response using Gemini
    const prompt = `You are a helpful Facebook page bot. Respond to this message in a friendly and helpful way: "${messageText}"`;
    const result = await model.generateContent(prompt);
    const response = result.response;
    const aiResponse = response.text();
    
    console.log('AI Response:', aiResponse);
    
    // Update recent messages with response
    if (stats.recentMessages[0]) {
      stats.recentMessages[0].response = aiResponse;
    }
    
    // Send response back to Facebook
    await sendFacebookMessage(senderId, aiResponse);
    
  } catch (error) {
    console.error('Error handling message:', error);
    await sendFacebookMessage(senderId, 'Sorry, I encountered an error processing your message.');
  }
}

// Send message via Facebook Graph API
async function sendFacebookMessage(recipientId, messageText) {
  const PAGE_ACCESS_TOKEN = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
  
  if (!PAGE_ACCESS_TOKEN) {
    console.error('Facebook Page Access Token not found');
    return;
  }
  
  const requestBody = {
    recipient: {
      id: recipientId
    },
    message: {
      text: messageText
    }
  };
  
  try {
    const axios = require('axios');
    const response = await axios.post(
      `https://graph.facebook.com/v18.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`,
      requestBody
    );
    console.log('Message sent successfully:', response.data);
  } catch (error) {
    console.error('Error sending Facebook message:', error.response?.data || error.message);
  }
}

// API endpoint to get recent messages
app.get('/api/messages', (req, res) => {
  res.json(stats.recentMessages);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Facebook Bot server is running on port ${PORT}`);
  console.log(`Dashboard: http://localhost:${PORT}`);
  console.log(`Test Interface: http://localhost:${PORT}/test`);
});
