
const express = require('express');
const bodyParser = require('body-parser');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const path = require('path');
const fs = require('fs');
const ytdl = require('@distube/ytdl-core');
const ffmpeg = require('fluent-ffmpeg');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Initialize Gemini AI with enhanced error handling
let genAI, model;
let geminiHealthy = false;

async function initializeGemini() {
  try {
    if (!process.env.GEMINI_API_KEY) {
      console.warn('⚠️ GEMINI_API_KEY not found in environment variables');
      return false;
    }

    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });

    // Test the connection
    const testResult = await model.generateContent("Hello");
    if (testResult.response.text()) {
      geminiHealthy = true;
      console.log('✅ Gemini AI initialized successfully');
      return true;
    }
  } catch (error) {
    console.error('❌ Error initializing Gemini AI:', error.message);
    geminiHealthy = false;
    return false;
  }
}

// Initialize Gemini on startup
initializeGemini();

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Enhanced statistics tracking
let stats = {
  totalMessages: 0,
  messagesThisHour: 0,
  messagesThisDay: 0,
  totalUsers: new Set(),
  activeUsers: new Set(),
  lastReset: new Date(),
  lastDayReset: new Date(),
  recentMessages: [],
  webhookLogs: [],
  userProfiles: {},
  responseTypes: {
    success: 0,
    error: 0,
    timeout: 0
  },
  averageResponseTime: 0,
  peakHour: 0,
  hourlyStats: Array(24).fill(0)
};

// Advanced Bot configuration
let botConfig = {
  maxMessageLength: 2000,
  responseTimeout: 30000,
  enableTypingIndicator: true,
  autoRespond: true,
  customGreeting: "Hello! I'm your AI assistant powered by Gemini. How can I help you today?",
  enableAnalytics: true,
  debugMode: false,
  enableContextAwareness: true,
  enableSentimentAnalysis: true,
  enableIntentDetection: true,
  responseStyle: 'friendly',
  enableEmojis: true,
  enableSmartSuggestions: true,
  enableConversationMemory: true,
  personalityTraits: {
    humor: 7,
    empathy: 9,
    creativity: 8,
    formality: 3
  },
  responseTemplates: {
    greeting: "Hey there! 👋 I'm your AI assistant. What can I help you with today?",
    goodbye: "Thanks for chatting! Feel free to message me anytime. Have a great day! 😊",
    confusion: "I'm not quite sure I understand. Could you rephrase that for me? 🤔",
    error: "Oops! Something went wrong on my end. Let me try again! 🔄"
  }
};

// Reset hourly stats
setInterval(() => {
  stats.messagesThisHour = 0;
  stats.lastReset = new Date();
  stats.activeUsers.clear();
}, 3600000);

// Reset daily stats
setInterval(() => {
  stats.messagesThisDay = 0;
  stats.lastDayReset = new Date();
  stats.hourlyStats = Array(24).fill(0);
}, 86400000);

// Enhanced dashboard route
app.get('/', (req, res) => {
  const config = {
    geminiConfigured: !!process.env.GEMINI_API_KEY,
    facebookConfigured: !!(process.env.FACEBOOK_PAGE_ACCESS_TOKEN && process.env.FACEBOOK_VERIFY_TOKEN),
    webhookUrl: `${req.protocol}://${req.get('host')}/webhook`
  };

  const enhancedStats = {
    ...stats,
    totalUsers: stats.totalUsers.size,
    activeUsers: stats.activeUsers.size,
    uptime: process.uptime(),
    memoryUsage: process.memoryUsage(),
    currentHour: new Date().getHours()
  };

  res.render('dashboard', { stats: enhancedStats, config, botConfig });
});

// Analytics page
app.get('/analytics', (req, res) => {
  res.render('analytics', { stats, botConfig });
});

// User management page
app.get('/users', (req, res) => {
  const userList = Object.entries(stats.userProfiles).map(([id, profile]) => ({
    id,
    ...profile
  }));
  res.render('users', { users: userList, stats });
});

// Webhook logs page
app.get('/logs', (req, res) => {
  res.render('logs', { logs: stats.webhookLogs.slice(-100) });
});

// Settings page
app.get('/settings', (req, res) => {
  res.render('settings', { config: botConfig });
});

// Test interface
app.get('/test', (req, res) => {
  res.render('test', { config: botConfig });
});

// API endpoints
app.get('/api/config', (req, res) => {
  res.json({
    geminiConfigured: !!process.env.GEMINI_API_KEY,
    facebookConfigured: !!(process.env.FACEBOOK_PAGE_ACCESS_TOKEN && process.env.FACEBOOK_VERIFY_TOKEN),
    webhookUrl: `${req.protocol}://${req.get('host')}/webhook`,
    stats: {
      ...stats,
      totalUsers: stats.totalUsers.size,
      activeUsers: stats.activeUsers.size
    },
    botConfig
  });
});

// Enhanced API for real-time stats
app.get('/api/stats', (req, res) => {
  res.json({
    ...stats,
    totalUsers: stats.totalUsers.size,
    activeUsers: stats.activeUsers.size,
    uptime: process.uptime(),
    memoryUsage: process.memoryUsage()
  });
});

// Update bot configuration
app.post('/api/config', (req, res) => {
  try {
    const updates = req.body;
    Object.assign(botConfig, updates);
    res.json({ success: true, config: botConfig });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// Clear logs endpoint
app.post('/api/clear-logs', (req, res) => {
  stats.webhookLogs = [];
  res.json({ success: true });
});

// Export stats endpoint
app.get('/api/export-stats', (req, res) => {
  const exportData = {
    timestamp: new Date().toISOString(),
    stats: {
      ...stats,
      totalUsers: stats.totalUsers.size,
      activeUsers: stats.activeUsers.size
    },
    config: botConfig
  };

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', 'attachment; filename="bot-stats.json"');
  res.send(JSON.stringify(exportData, null, 2));
});

// YouTube downloader endpoints
app.post('/api/youtube/info', async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url || !ytdl.validateURL(url)) {
      return res.json({ success: false, error: 'Invalid YouTube URL' });
    }

    const info = await ytdl.getInfo(url);
    const videoDetails = {
      title: info.videoDetails.title,
      author: info.videoDetails.author.name,
      lengthSeconds: info.videoDetails.lengthSeconds,
      viewCount: info.videoDetails.viewCount,
      description: info.videoDetails.description,
      thumbnail: info.videoDetails.thumbnails[0]?.url
    };

    res.json({ success: true, info: videoDetails });
  } catch (error) {
    console.error('YouTube info error:', error);
    res.json({ success: false, error: 'Failed to get video information' });
  }
});

app.post('/api/youtube/download', async (req, res) => {
  try {
    const { url, format } = req.body;
    
    if (!url || !ytdl.validateURL(url)) {
      return res.json({ success: false, error: 'Invalid YouTube URL' });
    }

    const info = await ytdl.getInfo(url);
    const title = info.videoDetails.title.replace(/[^\w\s]/gi, '');

    if (format === 'mp3') {
      res.setHeader('Content-Disposition', `attachment; filename="${title}.mp3"`);
      res.setHeader('Content-Type', 'audio/mpeg');
      
      const stream = ytdl(url, { quality: 'highestaudio' });
      ffmpeg(stream)
        .audioBitrate(128)
        .format('mp3')
        .on('error', (err) => {
          console.error('FFmpeg error:', err);
          if (!res.headersSent) {
            res.json({ success: false, error: 'Conversion failed' });
          }
        })
        .pipe(res);
    } else {
      res.setHeader('Content-Disposition', `attachment; filename="${title}.mp4"`);
      res.setHeader('Content-Type', 'video/mp4');
      
      ytdl(url, { quality: 'highest' }).pipe(res);
    }
  } catch (error) {
    console.error('YouTube download error:', error);
    if (!res.headersSent) {
      res.json({ success: false, error: 'Download failed' });
    }
  }
});

// Enhanced test Gemini endpoint with advanced AI features
app.post('/api/test-gemini', async (req, res) => {
  const startTime = Date.now();

  try {
    if (!model) {
      return res.json({ 
        success: false, 
        error: 'Gemini API not configured. Please add GEMINI_API_KEY to your environment variables.' 
      });
    }

    const { message } = req.body;

    if (!message || message.length > botConfig.maxMessageLength) {
      return res.json({
        success: false,
        error: `Message must be between 1 and ${botConfig.maxMessageLength} characters`
      });
    }

    // Create a mock user profile for testing
    const testUserProfile = {
      messageCount: 1,
      conversationHistory: [],
      preferences: {},
      sentiment: 'neutral'
    };

    // Use enhanced response generation
    const aiResponse = await generateEnhancedResponse(message, testUserProfile, 'test-user');
    const responseTime = Date.now() - startTime;

    // Analyze the test interaction
    const sentiment = analyzeSentiment(message);
    const intent = detectIntent(message);

    stats.responseTypes.success++;
    stats.averageResponseTime = (stats.averageResponseTime + responseTime) / 2;

    // Add credit message with timestamp to test response
    const currentTime = new Date().toLocaleTimeString('en-US', { 
      hour12: true, 
      hour: '2-digit', 
      minute: '2-digit' 
    });
    const responseWithCredit = aiResponse + '\n\n━━━━━━━━━━━━━━━━━━━━\n💝 Created with 🤍 by Sunnel John Rebano\n🕒 Asked at ' + currentTime + '\n━━━━━━━━━━━━━━━━━━━━';

    res.json({ 
      success: true, 
      response: responseWithCredit,
      timestamp: new Date().toISOString(),
      responseTime,
      analysis: {
        sentiment,
        intent,
        messageLength: message.length,
        responseLength: aiResponse.length
      },
      features: {
        contextAwareness: botConfig.enableContextAwareness,
        sentimentAnalysis: botConfig.enableSentimentAnalysis,
        intentDetection: botConfig.enableIntentDetection
      }
    });
  } catch (error) {
    const responseTime = Date.now() - startTime;

    if (error.message === 'Response timeout') {
      stats.responseTypes.timeout++;
    } else {
      stats.responseTypes.error++;
    }

    res.json({ 
      success: false, 
      error: error.message,
      responseTime
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

  const logEntry = {
    timestamp: new Date(),
    type: 'verification',
    data: { mode, token: token ? '***' : null },
    ip: req.ip
  };

  stats.webhookLogs.unshift(logEntry);
  if (stats.webhookLogs.length > 1000) stats.webhookLogs.pop();

  if (mode && token) {
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('WEBHOOK_VERIFIED');
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  }
});

// Enhanced Facebook webhook handler
app.post('/webhook', async (req, res) => {
  const body = req.body;

  const logEntry = {
    timestamp: new Date(),
    type: 'incoming_webhook',
    data: body,
    ip: req.ip
  };

  stats.webhookLogs.unshift(logEntry);
  if (stats.webhookLogs.length > 1000) stats.webhookLogs.pop();

  if (body.object === 'page') {
    body.entry.forEach(async (entry) => {
      const webhookEvent = entry.messaging[0];

      if (webhookEvent.message) {
        await handleMessage(webhookEvent.sender.id, webhookEvent.message.text);
      } else if (webhookEvent.postback) {
        await handlePostback(webhookEvent.sender.id, webhookEvent.postback.payload);
      }
    });

    res.status(200).send('EVENT_RECEIVED');
  } else {
    res.sendStatus(404);
  }
});

// Enhanced message handler with advanced AI features
async function handleMessage(senderId, messageText) {
  const startTime = Date.now();

  try {
    console.log(`Received message from ${senderId}: ${messageText}`);

    // Update user profile with enhanced tracking
    if (!stats.userProfiles[senderId]) {
      stats.userProfiles[senderId] = {
        firstSeen: new Date(),
        messageCount: 0,
        lastMessage: null,
        lastSeen: new Date(),
        conversationHistory: [],
        preferences: {},
        sentiment: 'neutral',
        topics: []
      };
    }

    const userProfile = stats.userProfiles[senderId];
    userProfile.messageCount++;
    userProfile.lastMessage = messageText;
    userProfile.lastSeen = new Date();

    // Add to conversation history (keep last 10 messages)
    userProfile.conversationHistory.unshift({
      message: messageText,
      timestamp: new Date(),
      sentiment: analyzeSentiment(messageText)
    });
    if (userProfile.conversationHistory.length > 10) {
      userProfile.conversationHistory = userProfile.conversationHistory.slice(0, 10);
    }

    // Update statistics
    stats.totalMessages++;
    stats.messagesThisHour++;
    stats.messagesThisDay++;
    stats.totalUsers.add(senderId);
    stats.activeUsers.add(senderId);

    const currentHour = new Date().getHours();
    stats.hourlyStats[currentHour]++;

    stats.recentMessages.unshift({
      senderId,
      message: messageText,
      timestamp: new Date(),
      response: null,
      responseTime: null,
      sentiment: analyzeSentiment(messageText)
    });

    if (stats.recentMessages.length > 50) {
      stats.recentMessages = stats.recentMessages.slice(0, 50);
    }

    if (!botConfig.autoRespond) {
      return;
    }

    if (!model) {
      const errorMsg = 'Bot configuration error. Please contact administrator.';
      await sendFacebookMessage(senderId, errorMsg);
      return;
    }

    // Send typing indicator if enabled
    if (botConfig.enableTypingIndicator) {
      await sendTypingIndicator(senderId);
    }

    // Enhanced AI prompt with context awareness
    const aiResponse = await generateEnhancedResponse(messageText, userProfile, senderId);
    const responseTime = Date.now() - startTime;

    console.log('Enhanced AI Response:', aiResponse);

    // Update recent messages with response
    if (stats.recentMessages[0]) {
      stats.recentMessages[0].response = aiResponse;
      stats.recentMessages[0].responseTime = responseTime;
    }

    stats.responseTypes.success++;
    stats.averageResponseTime = (stats.averageResponseTime + responseTime) / 2;

    // Add credit message with timestamp to response
    const currentTime = new Date().toLocaleTimeString('en-US', { 
      hour12: true, 
      hour: '2-digit', 
      minute: '2-digit' 
    });
    const responseWithCredit = aiResponse + '\n\n━━━━━━━━━━━━━━━━━━━━\n💝 Created with 🤍 by Sunnel John Rebano\n🕒 Asked at ' + currentTime + '\n━━━━━━━━━━━━━━━━━━━━';

    // Send response back to Facebook
    await sendFacebookMessage(senderId, responseWithCredit);

  } catch (error) {
    console.error('Error handling message:', error);

    const responseTime = Date.now() - startTime;

    if (error.message === 'Response timeout') {
      stats.responseTypes.timeout++;
    } else {
      stats.responseTypes.error++;
    }

    await sendFacebookMessage(senderId, 'Sorry, I encountered an error processing your message. Please try again.');
  }
}

// Advanced sentiment analysis
function analyzeSentiment(text) {
  const positiveWords = ['happy', 'great', 'awesome', 'amazing', 'love', 'good', 'excellent', 'wonderful', 'fantastic', 'perfect', 'thank you', 'thanks'];
  const negativeWords = ['sad', 'bad', 'terrible', 'awful', 'hate', 'horrible', 'angry', 'frustrated', 'problem', 'issue', 'error', 'broken'];

  const words = text.toLowerCase().split(/\s+/);
  let score = 0;

  words.forEach(word => {
    if (positiveWords.includes(word)) score += 1;
    if (negativeWords.includes(word)) score -= 1;
  });

  if (score > 0) return 'positive';
  if (score < 0) return 'negative';
  return 'neutral';
}

// Enhanced AI response generation with context awareness
async function generateEnhancedResponse(messageText, userProfile, senderId) {
  try {
    // Detect message intent
    const intent = detectIntent(messageText);

    // Build context from conversation history
    const conversationContext = userProfile.conversationHistory
      .slice(0, 3)
      .map(msg => `User: ${msg.message}`)
      .join('\n');

    // Enhanced prompt based on intent and context
    let enhancedPrompt = '';

    switch (intent) {
      case 'greeting':
        enhancedPrompt = `You are a friendly Facebook bot assistant. The user is greeting you. 
        ${userProfile.messageCount === 1 ? 'This is their first message.' : `You've talked ${userProfile.messageCount} times before.`}
        User's message: "${messageText}"
        Respond warmly and naturally. Ask how you can help them today.`;
        break;

      case 'question':
        enhancedPrompt = `You are a knowledgeable Facebook bot assistant. The user has a question.
        ${conversationContext ? `Recent conversation:\n${conversationContext}\n` : ''}
        Current question: "${messageText}"
        Provide a helpful, accurate, and detailed answer. If you're unsure, say so and suggest alternatives.`;
        break;

      case 'help':
        enhancedPrompt = `You are a helpful Facebook bot assistant. The user needs help.
        User's request: "${messageText}"
        Provide clear, step-by-step guidance. Be encouraging and supportive. Offer specific solutions.`;
        break;

      case 'complaint':
        enhancedPrompt = `You are an empathetic Facebook bot assistant. The user seems frustrated or has a complaint.
        User's message: "${messageText}"
        Respond with empathy and understanding. Acknowledge their concern and offer to help resolve it.`;
        break;

      case 'thanks':
        enhancedPrompt = `You are a gracious Facebook bot assistant. The user is thanking you.
        User's message: "${messageText}"
        Respond humbly and offer continued assistance. Keep it brief but warm.`;
        break;

      default:
        enhancedPrompt = `You are an intelligent Facebook bot assistant powered by Gemini AI.
        ${conversationContext ? `Recent conversation:\n${conversationContext}\n` : ''}
        User's current message: "${messageText}"

        Instructions:
        - Be conversational and engaging
        - Show personality while being helpful
        - Use appropriate emojis sparingly
        - Structure your responses clearly using sections like:
          * Answer: [direct answer]
          * Explanation: [detailed explanation]
          * Example: [if applicable]
          * Note: [important points]
          * Tips: [helpful suggestions]
        - If the user asks about your capabilities, mention you're powered by Google's Gemini AI
        - Adapt your tone to match the user's sentiment
        - When providing complex information, organize it with clear headings
        - Be creative and informative`;
    }

    const result = await Promise.race([
      model.generateContent(enhancedPrompt),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Response timeout')), botConfig.responseTimeout)
      )
    ]);

    let response = result.response.text();

    // Post-process response for better formatting
    response = enhanceResponseFormatting(response, intent);

    return response;

  } catch (error) {
    console.error('Enhanced response generation failed:', error);
    // Fallback to basic response
    const fallbackPrompt = `${botConfig.customGreeting}\n\nUser message: "${messageText}"\n\nRespond helpfully and naturally.`;
    const result = await model.generateContent(fallbackPrompt);
    return result.response.text();
  }
}

// Intent detection for better response targeting
function detectIntent(messageText) {
  const text = messageText.toLowerCase();

  if (/^(hi|hello|hey|good morning|good afternoon|good evening)/.test(text)) {
    return 'greeting';
  }

  if (/\?|how|what|when|where|why|who|can you|could you|would you/.test(text)) {
    return 'question';
  }

  if (/help|assist|support|guide|how to|tutorial/.test(text)) {
    return 'help';
  }

  if (/(thank|thanks|thx|appreciate|grateful)/.test(text)) {
    return 'thanks';
  }

  if (/(problem|issue|bug|error|wrong|broken|not working|frustrated|angry)/.test(text)) {
    return 'complaint';
  }

  return 'general';
}

// Enhanced AI Response Formatting with Auto-Detection
function enhanceResponseFormatting(response, intent) {
  // Remove excessive line breaks
  response = response.replace(/\n{3,}/g, '\n\n');

  // Intelligent content detection and formatting
  response = applyIntelligentFormatting(response);

  // Ensure responses aren't too long for Facebook
  if (response.length > 2000) {
    response = response.substring(0, 1950) + '... (truncated for readability)';
  }

  // Add appropriate closing based on intent
  if (intent === 'help' && !response.includes('?')) {
    response += '\n\nLet me know if you need any clarification! 😊';
  }

  return response.trim();
}

// Intelligent content formatting with auto-detection
function applyIntelligentFormatting(text) {
  let formattedText = text;

  // Auto-detect and format ANSWERS
  formattedText = formattedText.replace(
    /(?:^|\n)((?:answer|solution|result):\s*)(.*?)(?=\n\n|\n(?:[a-z]*explanation|note|example)|$)/gmi,
    (match, prefix, content) => {
      return `\n━━━━━━━━━━━━━━━━━━━━\n**📋 ANSWER**\n━━━━━━━━━━━━━━━━━━━━\n${content.trim()}\n━━━━━━━━━━━━━━━━━━━━\n`;
    }
  );

  // Auto-detect and format EXPLANATIONS
  formattedText = formattedText.replace(
    /(?:^|\n)((?:explanation|why|because|how it works):\s*)(.*?)(?=\n\n|\n(?:[a-z]*answer|note|example)|$)/gmi,
    (match, prefix, content) => {
      return `\n━━━━━━━━━━━━━━━━━━━━\n**💡 EXPLANATION**\n━━━━━━━━━━━━━━━━━━━━\n${content.trim()}\n━━━━━━━━━━━━━━━━━━━━\n`;
    }
  );

  // Auto-detect and format EXAMPLES
  formattedText = formattedText.replace(
    /(?:^|\n)((?:example|for instance|e\.?g\.?):\s*)(.*?)(?=\n\n|\n(?:[a-z]*answer|explanation|note)|$)/gmi,
    (match, prefix, content) => {
      return `\n━━━━━━━━━━━━━━━━━━━━\n**🔍 EXAMPLE**\n━━━━━━━━━━━━━━━━━━━━\n${content.trim()}\n━━━━━━━━━━━━━━━━━━━━\n`;
    }
  );

  return formattedText;
}

// Facebook API functions
async function sendFacebookMessage(recipientId, message) {
  try {
    const PAGE_ACCESS_TOKEN = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
    
    if (!PAGE_ACCESS_TOKEN) {
      console.error('FACEBOOK_PAGE_ACCESS_TOKEN not configured');
      return;
    }

    const axios = require('axios');
    
    await axios.post(`https://graph.facebook.com/v18.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
      recipient: { id: recipientId },
      message: { text: message }
    });

    console.log('Message sent successfully');
  } catch (error) {
    console.error('Error sending Facebook message:', error.response?.data || error.message);
  }
}

async function sendTypingIndicator(recipientId) {
  try {
    const PAGE_ACCESS_TOKEN = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
    
    if (!PAGE_ACCESS_TOKEN) return;

    const axios = require('axios');
    
    await axios.post(`https://graph.facebook.com/v18.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
      recipient: { id: recipientId },
      sender_action: 'typing_on'
    });
  } catch (error) {
    console.error('Error sending typing indicator:', error.response?.data || error.message);
  }
}

async function handlePostback(senderId, payload) {
  console.log(`Received postback from ${senderId}: ${payload}`);
  
  let responseText = 'Thanks for clicking!';
  
  switch (payload) {
    case 'GET_STARTED':
      responseText = botConfig.responseTemplates.greeting;
      break;
    case 'HELP':
      responseText = 'I can help you with various tasks. Just send me a message!';
      break;
    default:
      responseText = 'I received your message. How can I help you?';
  }
  
  await sendFacebookMessage(senderId, responseText);
}

// Auto-uptime functionality
const UPTIME_URL = process.env.UPTIME_URL || `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`;

if (UPTIME_URL) {
  setInterval(async () => {
    try {
      const axios = require('axios');
      await axios.get(UPTIME_URL);
      console.log('✅ Uptime ping successful');
    } catch (error) {
      console.log('⚠️ Uptime ping failed:', error.message);
    }
  }, 300000); // Ping every 5 minutes
}

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Facebook Bot Server running on port ${PORT}`);
  console.log(`📊 Dashboard: http://localhost:${PORT}`);
  console.log(`🧪 Test Interface: http://localhost:${PORT}/test`);
  console.log(`🔗 Webhook URL: http://localhost:${PORT}/webhook`);
  
  if (process.env.GEMINI_API_KEY) {
    console.log('✅ Gemini AI configured');
  } else {
    console.log('⚠️ Gemini AI not configured - add GEMINI_API_KEY to .env');
  }
  
  if (process.env.FACEBOOK_PAGE_ACCESS_TOKEN && process.env.FACEBOOK_VERIFY_TOKEN) {
    console.log('✅ Facebook integration configured');
  } else {
    console.log('⚠️ Facebook integration not configured');
  }
});
