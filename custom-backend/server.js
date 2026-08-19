const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
require('dotenv').config();

const { register, login, refresh, logout } = require('./src/controllers/authController');
const { getMe } = require('./src/controllers/userController');
const { getFiles, getFileById, downloadFileById } = require('./src/controllers/fileController');
const authenticate = require('./src/middleware/auth');
const { checkRateLimit } = require('./src/middleware/rateLimit');

const app = express();

app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());

// Serve static frontend
app.use(express.static(path.join(__dirname, '../public')));

// Routes
app.post('/register', register);
app.post('/login', checkRateLimit, login);
app.post('/refresh', refresh);
app.post('/logout', authenticate, logout);

app.get('/me', authenticate, getMe);

app.get('/files', authenticate, getFiles);
app.get('/files/:id', authenticate, getFileById);
app.get('/files/:id/download', authenticate, downloadFileById);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Custom backend running on http://localhost:${PORT}`);
});
