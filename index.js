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

// Bot configuration
const BOT_NAME = process.env.BOT_NAME || "Neko";
const BOT_PERSONALITY = {
  name: BOT_NAME,
  greeting: `Hey there! I'm ${BOT_NAME}, your friendly AI assistant! 😊`,
  helpMessage: "I can help you with many things! Try these commands:\n• /help - Show all commands\n• /game - Play a random game\n• /study - Educational tools\n• /random - Chat with random user\n• /weather - Get weather info\n• /joke - Tell a joke\n• /quote - Inspirational quote",
  personality: "friendly, helpful, and enthusiastic"
};

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
  hourlyStats: Array(24).fill(0),
  commandsUsed: {},
  gamesPlayed: 0,
  educationalQueries: 0
};

// Mock user database for random user feature
const mockUsers = [
  {
    id: "user123",
    fullName: "Alex Johnson",
    birthday: "March 15, 1995",
    status: "Single",
    location: "New York, USA",
    interests: ["Gaming", "Music", "Travel"],
    joinDate: "2023-01-15"
  },
  {
    id: "user456",
    fullName: "Sarah Chen",
    birthday: "July 22, 1992",
    status: "In a relationship",
    location: "Toronto, Canada",
    interests: ["Photography", "Cooking", "Hiking"],
    joinDate: "2022-11-08"
  },
  {
    id: "user789",
    fullName: "Miguel Rodriguez",
    birthday: "December 3, 1988",
    status: "Married",
    location: "Madrid, Spain",
    interests: ["Football", "Reading", "Technology"],
    joinDate: "2023-05-20"
  },
  {
    id: "user321",
    fullName: "Emma Thompson",
    birthday: "September 14, 1997",
    status: "Single",
    location: "London, UK",
    interests: ["Art", "Dancing", "Movies"],
    joinDate: "2023-03-12"
  },
  {
    id: "user654",
    fullName: "Hiroshi Tanaka",
    birthday: "April 8, 1990",
    status: "In a relationship",
    location: "Tokyo, Japan",
    interests: ["Anime", "Gaming", "Martial Arts"],
    joinDate: "2022-12-01"
  }
];

// Games collection
const games = [
  {
    name: "Number Guessing Game",
    description: "I'm thinking of a number between 1-100. Can you guess it?",
    type: "guess"
  },
  {
    name: "20 Questions",
    description: "Think of something and I'll try to guess it in 20 questions!",
    type: "questions"
  },
  {
    name: "Word Association",
    description: "I'll say a word, you say the first thing that comes to mind!",
    type: "association"
  },
  {
    name: "Riddle Challenge",
    description: "Let me give you a riddle to solve!",
    type: "riddle"
  },
  {
    name: "Story Building",
    description: "Let's create a story together! I'll start with one sentence.",
    type: "story"
  }
];

// Educational tools
const educationalTopics = [
  "Mathematics", "Science", "History", "Geography", "Literature", 
  "Physics", "Chemistry", "Biology", "Programming", "Languages",
  "Philosophy", "Psychology", "Economics", "Art", "Music"
];

// Advanced Bot configuration
let botConfig = {
  maxMessageLength: 2000,
  responseTimeout: 30000,
  enableTypingIndicator: true,
  autoRespond: true,
  customGreeting: BOT_PERSONALITY.greeting,
  enableAnalytics: true,
  debugMode: false,
  enableContextAwareness: true,
  enableSentimentAnalysis: true,
  enableIntentDetection: true,
  responseStyle: 'friendly',
  enableEmojis: true,
  enableSmartSuggestions: true,
  enableConversationMemory: true,
  enableCommands: true,
  personalityTraits: {
    humor: 8,
    empathy: 9,
    creativity: 8,
    formality: 2
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

// All other routes remain the same...
app.get('/analytics', (req, res) => {
  res.render('analytics', { stats, botConfig });
});

app.get('/users', (req, res) => {
  const userList = Object.entries(stats.userProfiles).map(([id, profile]) => ({
    id,
    ...profile
  }));
  res.render('users', { users: userList, stats });
});

app.get('/logs', (req, res) => {
  res.render('logs', { logs: stats.webhookLogs.slice(-100) });
});

app.get('/settings', (req, res) => {
  res.render('settings', { config: botConfig });
});

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

app.get('/api/stats', (req, res) => {
  res.json({
    ...stats,
    totalUsers: stats.totalUsers.size,
    activeUsers: stats.activeUsers.size,
    uptime: process.uptime(),
    memoryUsage: process.memoryUsage()
  });
});

app.post('/api/config', (req, res) => {
  try {
    const updates = req.body;
    Object.assign(botConfig, updates);
    res.json({ success: true, config: botConfig });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

app.post('/api/clear-logs', (req, res) => {
  stats.webhookLogs = [];
  res.json({ success: true });
});

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

// YouTube downloader endpoints (fixed)
app.post('/api/youtube/info', async (req, res) => {
  try {
    const { url } = req.body;

    if (!url) {
      return res.json({ success: false, error: 'URL is required' });
    }

    if (!ytdl.validateURL(url)) {
      return res.json({ success: false, error: 'Invalid YouTube URL' });
    }

    const info = await ytdl.getInfo(url);
    const videoDetails = {
      title: info.videoDetails.title,
      author: info.videoDetails.author.name,
      lengthSeconds: info.videoDetails.lengthSeconds,
      viewCount: info.videoDetails.viewCount,
      description: info.videoDetails.description?.substring(0, 200) + "...",
      thumbnail: info.videoDetails.thumbnails[0]?.url
    };

    res.json({ success: true, info: videoDetails });
  } catch (error) {
    console.error('YouTube info error:', error);
    res.json({ success: false, error: 'Failed to get video information. Please check the URL.' });
  }
});

app.post('/api/youtube/download', async (req, res) => {
  try {
    const { url, format } = req.body;

    if (!url || !ytdl.validateURL(url)) {
      return res.json({ success: false, error: 'Invalid YouTube URL' });
    }

    const info = await ytdl.getInfo(url);
    const title = info.videoDetails.title.replace(/[^\w\s]/gi, '').substring(0, 50);

    if (format === 'mp3') {
      res.setHeader('Content-Disposition', `attachment; filename="${title}.mp3"`);
      res.setHeader('Content-Type', 'audio/mpeg');

      const stream = ytdl(url, { quality: 'highestaudio' });
      stream.pipe(res);
    } else {
      res.setHeader('Content-Disposition', `attachment; filename="${title}.mp4"`);
      res.setHeader('Content-Type', 'video/mp4');

      ytdl(url, { quality: 'highest' }).pipe(res);
    }
  } catch (error) {
    console.error('YouTube download error:', error);
    if (!res.headersSent) {
      res.json({ success: false, error: 'Download failed. Please try again.' });
    }
  }
});

// Enhanced test Gemini endpoint
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

    // Detect bot name mention
    const botNameRegex = new RegExp(`hey\\s+${BOT_NAME}|hi\\s+${BOT_NAME}|hello\\s+${BOT_NAME}`, 'i');
    let isGreeting = botNameRegex.test(message) || /^(hey|hi|hello)$/i.test(message.trim());

    // Process commands first
    const commandResponse = await processCommand(message, 'test-user');
    if (commandResponse) {
      const responseTime = Date.now() - startTime;
      const currentTime = new Date().toLocaleString('en-US', { 
        timeZone: 'UTC',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit', 
        minute: '2-digit',
        hour12: true
      });

      const responseWithCredit = commandResponse + '\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nCreated with 🤍 by Sunnel John Rebano\n🕒 Asked at ' + currentTime + ' UTC\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';

      return res.json({ 
        success: true, 
        response: responseWithCredit,
        timestamp: new Date().toISOString(),
        responseTime,
        isCommand: true
      });
    }

    // Create a mock user profile for testing
    const testUserProfile = {
      messageCount: 1,
      conversationHistory: [],
      preferences: {},
      sentiment: 'neutral'
    };

    // Enhanced response generation
    let aiResponse;
    if (isGreeting) {
      aiResponse = BOT_PERSONALITY.greeting + "\n\n" + BOT_PERSONALITY.helpMessage;
    } else {
      aiResponse = await generateEnhancedResponse(message, testUserProfile, 'test-user');
    }

    const responseTime = Date.now() - startTime;

    // Format response with proper styling
    aiResponse = enhanceResponseFormatting(aiResponse);

    stats.responseTypes.success++;
    stats.averageResponseTime = (stats.averageResponseTime + responseTime) / 2;

    // Add credit message with corrected timestamp
    const currentTime = new Date().toLocaleString('en-US', { 
      timeZone: 'UTC',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit', 
      minute: '2-digit',
      hour12: true
    });

    const responseWithCredit = aiResponse + '\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nCreated with 🤍 by Sunnel John Rebano\n🕒 Asked at ' + currentTime + ' UTC\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';

    res.json({ 
      success: true, 
      response: responseWithCredit,
      timestamp: new Date().toISOString(),
      responseTime,
      analysis: {
        sentiment: analyzeSentiment(message),
        intent: detectIntent(message),
        messageLength: message.length,
        responseLength: aiResponse.length
      }
    });
  } catch (error) {
    const responseTime = Date.now() - startTime;
    console.error('Test Gemini error:', error);

    if (error.message === 'Response timeout') {
      stats.responseTypes.timeout++;
    } else {
      stats.responseTypes.error++;
    }

    res.json({ 
      success: false, 
      error: 'Sorry, I encountered an error. Please try again.',
      responseTime
    });
  }
});

// Command processing function
async function processCommand(message, senderId) {
  const cmd = message.toLowerCase().trim();

  if (!cmd.startsWith('/')) {
    return null;
  }

  const command = cmd.split(' ')[0];
  const args = cmd.split(' ').slice(1);

  // Track command usage
  if (!stats.commandsUsed[command]) {
    stats.commandsUsed[command] = 0;
  }
  stats.commandsUsed[command]++;

  switch (command) {
    case '/help':
      return `🤖 **${BOT_NAME} Commands**\n━━━━━━━━━━━━━━━━━━━━\n\n` +
        `🎮 **Entertainment**\n` +
        `• /game - Play a random game\n` +
        `• /joke - Get a funny joke\n` +
        `• /quote - Inspirational quote\n\n` +
        `📚 **Educational**\n` +
        `• /study [topic] - Learn about any topic\n` +
        `• /quiz [subject] - Take a quiz\n` +
        `• /explain [concept] - Get explanations\n` +
        `• /calculate [expression] - Math calculator\n\n` +
        `👥 **Social**\n` +
        `• /random - Meet a random user\n` +
        `• /profile - Your profile info\n\n` +
        `🌍 **Utilities**\n` +
        `• /weather [city] - Weather forecast\n` +
        `• /time [timezone] - Current time\n` +
        `• /translate [text] - Language translation\n\n` +
        `Just say "Hey ${BOT_NAME}" to start chatting! 😊`;

    case '/game':
      stats.gamesPlayed++;
      const randomGame = games[Math.floor(Math.random() * games.length)];
      return `🎮 **Game Time!**\n━━━━━━━━━━━━━━━━━━━━\n\n` +
        `**${randomGame.name}**\n\n` +
        `${randomGame.description}\n\n` +
        `Let's play! What's your move? 🎯`;

    case '/random':
      const randomUser = mockUsers[Math.floor(Math.random() * mockUsers.length)];
      return `🔍 **Random User Detected!**\n━━━━━━━━━━━━━━━━━━━━\n\n` +
        `**👤 Profile Information**\n\n` +
        `**Name:** ${randomUser.fullName}\n` +
        `**ID:** ${randomUser.id}\n` +
        `**Birthday:** ${randomUser.birthday}\n` +
        `**Status:** ${randomUser.status}\n` +
        `**Location:** ${randomUser.location}\n` +
        `**Interests:** ${randomUser.interests.join(', ')}\n` +
        `**Member Since:** ${randomUser.joinDate}\n\n` +
        `Would you like to send them a message? 💌`;

    case '/study':
      stats.educationalQueries++;
      const topic = args.join(' ') || educationalTopics[Math.floor(Math.random() * educationalTopics.length)];
      return `📚 **Study Session: ${topic}**\n━━━━━━━━━━━━━━━━━━━━\n\n` +
        `Let me help you learn about **${topic}**!\n\n` +
        `What specific aspect would you like to explore?\n` +
        `• Basic concepts\n` +
        `• Advanced topics\n` +
        `• Practice problems\n` +
        `• Real-world applications\n\n` +
        `Just ask me anything about ${topic}! 🎓`;

    case '/quiz':
      const subject = args.join(' ') || 'General Knowledge';
      return `🧠 **Quiz Time: ${subject}**\n━━━━━━━━━━━━━━━━━━━━\n\n` +
        `Ready for a challenge? I'll ask you questions about **${subject}**!\n\n` +
        `**Question 1:** What would you like to be quizzed on?\n` +
        `a) Easy level\n` +
        `b) Medium level\n` +
        `c) Hard level\n\n` +
        `Choose your difficulty and let's begin! 💪`;

    case '/joke':
      const jokes = [
        "Why don't scientists trust atoms? Because they make up everything! 😄",
        "Why did the scarecrow win an award? He was outstanding in his field! 🌾",
        "Why don't eggs tell jokes? They'd crack each other up! 🥚",
        "What do you call a fake noodle? An impasta! 🍝",
        "Why did the math book look so sad? Because it was full of problems! 📚"
      ];
      return `😂 **Joke of the Day**\n━━━━━━━━━━━━━━━━━━━━\n\n` +
        jokes[Math.floor(Math.random() * jokes.length)] + '\n\n' +
        `Want another joke? Just type /joke again! 🎭`;

    case '/quote':
      const quotes = [
        "The only way to do great work is to love what you do. - Steve Jobs",
        "Innovation distinguishes between a leader and a follower. - Steve Jobs", 
        "Life is what happens to you while you're busy making other plans. - John Lennon",
        "The future belongs to those who believe in the beauty of their dreams. - Eleanor Roosevelt",
        "It is during our darkest moments that we must focus to see the light. - Aristotle"
      ];
      return `✨ **Inspirational Quote**\n━━━━━━━━━━━━━━━━━━━━\n\n` +
        `*"${quotes[Math.floor(Math.random() * quotes.length)]}"*\n\n` +
        `Let this inspire your day! 🌟`;

    case '/weather':
      const city = args.join(' ') || 'your location';
      return `🌤️ **Weather Forecast**\n━━━━━━━━━━━━━━━━━━━━\n\n` +
        `**Location:** ${city}\n` +
        `**Temperature:** 22°C (72°F)\n` +
        `**Condition:** Partly Cloudy\n` +
        `**Humidity:** 65%\n` +
        `**Wind:** 12 km/h\n\n` +
        `Perfect day to go outside! ☀️\n` +
        `*Note: This is a demo. For real weather, integrate with a weather API.*`;

    case '/calculate':
      const expression = args.join(' ');
      if (!expression) {
        return `🧮 **Calculator**\n━━━━━━━━━━━━━━━━━━━━\n\n` +
          `Please provide a math expression!\n` +
          `Example: /calculate 2 + 2 * 3\n\n` +
          `I can handle:\n` +
          `• Basic arithmetic (+, -, *, /)\n` +
          `• Parentheses ()\n` +
          `• Powers (^)\n` +
          `• Square roots\n\n` +
          `What would you like to calculate? 🔢`;
      }
      try {
        // Simple calculator (be careful with eval in production)
        const result = Function('"use strict"; return (' + expression.replace(/\^/g, '**') + ')')();
        return `🧮 **Calculator Result**\n━━━━━━━━━━━━━━━━━━━━\n\n` +
          `**Expression:** ${expression}\n` +
          `**Result:** ${result}\n\n` +
          `Need another calculation? Just ask! 📊`;
      } catch (error) {
        return `❌ **Calculation Error**\n━━━━━━━━━━━━━━━━━━━━\n\n` +
          `Sorry, I couldn't calculate "${expression}"\n` +
          `Please check your expression and try again! 🔧`;
      }

    case '/time':
      const timezone = args.join(' ') || 'UTC';
      const currentTime = new Date().toLocaleString('en-US', { 
        timeZone: timezone === 'UTC' ? 'UTC' : timezone,
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      });
      return `🕒 **Current Time**\n━━━━━━━━━━━━━━━━━━━━\n\n` +
        `**Timezone:** ${timezone}\n` +
        `**Time:** ${currentTime}\n\n` +
        `Need time for another timezone? Just ask! 🌍`;

    case '/profile':
      return `👤 **Your Profile**\n━━━━━━━━━━━━━━━━━━━━\n\n` +
        `**User ID:** ${senderId}\n` +
        `**Status:** Active\n` +
        `**Messages Sent:** ${stats.userProfiles[senderId]?.messageCount || 1}\n` +
        `**First Seen:** ${stats.userProfiles[senderId]?.firstSeen?.toDateString() || 'Today'}\n` +
        `**Favorite Features:** AI Chat, Games\n\n` +
        `Thanks for chatting with me! 😊`;

    default:
      return `❓ **Unknown Command**\n━━━━━━━━━━━━━━━━━━━━\n\n` +
        `Sorry, I don't recognize "${command}"\n\n` +
        `Type **/help** to see all available commands! 💡`;
  }
}

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
  try {
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
  } catch (error) {
    console.error('Webhook error:', error);
    res.sendStatus(500);
  }
});

// Enhanced message handler
async function handleMessage(senderId, messageText) {
  const startTime = Date.now();

  try {
    console.log(`Received message from ${senderId}: ${messageText}`);

    // Update user profile
    if (!stats.userProfiles[senderId]) {
      stats.userProfiles[senderId] = {
        firstSeen: new Date(),
        messageCount: 0,
        lastMessage: null,
        lastSeen: new Date(),
        conversationHistory: [],
        preferences: {},
        sentiment: 'neutral'
      };
    }

    const userProfile = stats.userProfiles[senderId];
    userProfile.messageCount++;
    userProfile.lastMessage = messageText;
    userProfile.lastSeen = new Date();

    // Add to conversation history
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

    // Send typing indicator
    if (botConfig.enableTypingIndicator) {
      await sendTypingIndicator(senderId);
    }

    // Check for bot name mention or greeting
    const botNameRegex = new RegExp(`hey\\s+${BOT_NAME}|hi\\s+${BOT_NAME}|hello\\s+${BOT_NAME}`, 'i');
    let isGreeting = botNameRegex.test(messageText) || /^(hey|hi|hello)$/i.test(messageText.trim());

    // Process commands first
    const commandResponse = await processCommand(messageText, senderId);
    let aiResponse;

    if (commandResponse) {
      aiResponse = commandResponse;
    } else if (isGreeting) {
      aiResponse = BOT_PERSONALITY.greeting + "\n\n" + BOT_PERSONALITY.helpMessage;
    } else {
      aiResponse = await generateEnhancedResponse(messageText, userProfile, senderId);
    }

    // Format response
    aiResponse = enhanceResponseFormatting(aiResponse);

    const responseTime = Date.now() - startTime;

    // Update recent messages with response
    if (stats.recentMessages[0]) {
      stats.recentMessages[0].response = aiResponse;
      stats.recentMessages[0].responseTime = responseTime;
    }

    stats.responseTypes.success++;
    stats.averageResponseTime = (stats.averageResponseTime + responseTime) / 2;

    // Add credit message with corrected timestamp
    const currentTime = new Date().toLocaleString('en-US', { 
      timeZone: 'UTC',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit', 
      minute: '2-digit',
      hour12: true
    });

    const responseWithCredit = aiResponse + '\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nCreated with 🤍 by Sunnel John Rebano\n🕒 Asked at ' + currentTime + ' UTC\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';

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

    await sendFacebookMessage(senderId, `Sorry, I encountered an error processing your message. Please try again or type /help for assistance. 😊`);
  }
}

// Enhanced sentiment analysis
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

// Enhanced AI response generation
async function generateEnhancedResponse(messageText, userProfile, senderId) {
  try {
    const intent = detectIntent(messageText);
    const conversationContext = userProfile.conversationHistory
      .slice(0, 3)
      .map(msg => `User: ${msg.message}`)
      .join('\n');

    let enhancedPrompt = `You are ${BOT_NAME}, a friendly and helpful AI assistant. 

Context:
- User has sent ${userProfile.messageCount} messages
- Recent conversation: ${conversationContext || 'This is the start of our conversation'}
- Message: "${messageText}"

Instructions:
- Be conversational, helpful, and enthusiastic
- Use a friendly tone with appropriate emojis
- Structure complex responses with clear formatting using:
  * **ANSWER:** for direct responses
  * **EXPLANATION:** for detailed explanations  
  * **EXAMPLE:** for examples
  * **NOTE:** for important points
  * **TIP:** for helpful suggestions
- Keep responses concise but informative
- If asked about capabilities, mention you can help with education, games, utilities, and general chat
- Encourage users to try commands like /help, /game, /study

Respond naturally and helpfully!`;

    const result = await Promise.race([
      model.generateContent(enhancedPrompt),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Response timeout')), botConfig.responseTimeout)
      )
    ]);

    return result.response.text();

  } catch (error) {
    console.error('Enhanced response generation failed:', error);
    return `I'm having trouble processing that right now. 😅 Could you try rephrasing your question or type **/help** to see what I can do? 🤖`;
  }
}

// Intent detection
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

// Enhanced response formatting with working bold detection
function enhanceResponseFormatting(response) {
  // Remove excessive line breaks
  response = response.replace(/\n{3,}/g, '\n\n');

  // Enhanced formatting with automatic detection
  response = response.replace(/\*\*([^*]+)\*\*/g, '**$1**'); // Ensure bold formatting

  // Auto-detect and format sections with proper styling
  response = response.replace(
    /(answer|solution|result):\s*/gi,
    '\n━━━━━━━━━━━━━━━━━━━━\n**📋 ANSWER**\n━━━━━━━━━━━━━━━━━━━━\n'
  );

  response = response.replace(
    /(explanation|why|because|how it works):\s*/gi,
    '\n━━━━━━━━━━━━━━━━━━━━\n**💡 EXPLANATION**\n━━━━━━━━━━━━━━━━━━━━\n'
  );

  response = response.replace(
    /(example|for instance|e\.?g\.?):\s*/gi,
    '\n━━━━━━━━━━━━━━━━━━━━\n**🔍 EXAMPLE**\n━━━━━━━━━━━━━━━━━━━━\n'
  );

  response = response.replace(
    /(note|important|remember):\s*/gi,
    '\n━━━━━━━━━━━━━━━━━━━━\n**📝 NOTE**\n━━━━━━━━━━━━━━━━━━━━\n'
  );

  response = response.replace(
    /(tip|suggestion|advice):\s*/gi,
    '\n━━━━━━━━━━━━━━━━━━━━\n**💡 TIP**\n━━━━━━━━━━━━━━━━━━━━\n'
  );

  // Ensure responses aren't too long for Facebook
  if (response.length > 2000) {
    response = response.substring(0, 1950) + '...\n\n*Response truncated for readability*';
  }

  return response.trim();
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
      responseText = BOT_PERSONALITY.greeting + "\n\n" + BOT_PERSONALITY.helpMessage;
      break;
    case 'HELP':
      responseText = await processCommand('/help', senderId);
      break;
    default:
      responseText = 'I received your message. How can I help you?';
  }

  await sendFacebookMessage(senderId, responseText);
}

// Auto-uptime functionality (fixed)
const UPTIME_URL = process.env.UPTIME_URL || `https://${process.env.REPL_SLUG || 'your-repl'}.${process.env.REPL_OWNER || 'username'}.repl.co`;

if (process.env.REPL_SLUG && process.env.REPL_OWNER) {
  setInterval(async () => {
    try {
      const axios = require('axios');
      await axios.get(UPTIME_URL, { timeout: 10000 });
      console.log('✅ Uptime ping successful');
    } catch (error) {
      console.log('⚠️ Uptime ping failed:', error.message);
    }
  }, 300000); // Ping every 5 minutes
}

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 ${BOT_NAME} Server running on port ${PORT}`);
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

  console.log(`🤖 Bot Name: ${BOT_NAME}`);
  console.log('🎮 Available Commands: /help, /game, /study, /random, /joke, /quote, /weather, /calculate, /time, /profile');
});
