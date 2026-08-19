const { createClient } = require('redis');
require('dotenv').config();

const redisClient = createClient({
  url: process.env.REDIS_URL
});

redisClient.on('error', (err) => console.log('Redis Client Error', err));
redisClient.on('connect', () => console.log('Connected to Upstash Redis'));

// Initialize connection
redisClient.connect().catch(console.error);

module.exports = redisClient;
