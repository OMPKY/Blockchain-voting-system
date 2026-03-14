const express = require('express');
const path = require('path');
const jwt = require('jsonwebtoken');
const mysql = require('mysql2');
const cors = require('cors');
require('dotenv').config();

const app = express();

// --- Middleware ---
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- MySQL Connection (Updated for Aiven Cloud) ---
const db = mysql.createConnection({
  host: process.env.MYSQL_HOST,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DB,
  port: process.env.MYSQL_PORT || 27071,
  ssl: {
    rejectUnauthorized: false // Required for Aiven SSL connections
  }
});

db.connect((err) => {
  if (err) {
    console.error("❌ Aiven MySQL connection failed:", err.message);
  } else {
    console.log("✅ Connected to Aiven MySQL database.");
  }
});

// --- Authorization Middleware ---
const authorizeUser = (req, res, next) => {
  const token = req.query.Authorization?.split('Bearer ')[1];

  if (!token) {
    return res.status(401).send('<h1 align="center">Login to Continue</h1>');
  }

  try {
    const decodedToken = jwt.verify(token, process.env.SECRET_KEY, { algorithms: ['HS256'] });
    req.user = decodedToken;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid authorization token' });
  }
};

// --- Wallet APIs ---
app.get('/saveWallet', (req, res) => {
  const { voter_id, wallet_address } = req.query;
  if (!voter_id || !wallet_address) return res.status(400).json({ success: false, message: "Missing data" });

  const checkSql = `SELECT wallet_address FROM voters WHERE voter_id = ?`;
  db.query(checkSql, [voter_id], (err, results) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    if (results.length > 0 && results[0].wallet_address) return res.json({ success: true, message: "Already linked" });

    const updateSql = `UPDATE voters SET wallet_address = ? WHERE voter_id = ?`;
    db.query(updateSql, [wallet_address, voter_id], (updateErr, result) => {
      if (updateErr) {
        // 🚨 MAGIC FIX: Catch the duplicate wallet error from the database!
        if (updateErr.code === 'ER_DUP_ENTRY') {
           return res.status(400).json({ success: false, error: 'ER_DUP_ENTRY', message: 'Duplicate wallet detected.' });
        }
        return res.status(500).json({ success: false, error: updateErr.message });
      }
      res.json({ success: true });
    });
  });
});

app.get('/checkWallet', (req, res) => {
  const { voter_id } = req.query;
  const sql = `SELECT wallet_address FROM voters WHERE voter_id = ?`;
  db.query(sql, [voter_id], (err, results) => {
    if (err) return res.status(500).json({ message: "DB Error" });
    res.json({ wallet_address: results[0]?.wallet_address || null });
  });
});

// --- Serve Static Files ---
const serveFile = (filePath) => (req, res) => res.sendFile(path.join(__dirname, filePath));

app.get('/', serveFile('src/html/login.html'));
app.get('/js/login.js', serveFile('src/js/login.js'));
app.get('/css/login.css', serveFile('src/css/login.css'));
app.get('/css/index.css', serveFile('src/css/index.css'));
app.get('/css/admin.css', serveFile('src/css/admin.css'));
app.get('/assets/bg.jpg', serveFile('src/assets/bg.jpg'));
app.get('/assets/suiit_logo.png', serveFile('src/assets/suiit_logo.png'));
app.get('/js/app.js', serveFile('src/js/app.js'));
app.get('/admin.html', authorizeUser, serveFile('src/html/admin.html'));
app.get('/index.html', authorizeUser, serveFile('src/html/index.html'));
app.get('/dist/login.bundle.js', serveFile('src/dist/login.bundle.js'));
app.get('/dist/app.bundle.js', serveFile('src/dist/app.bundle.js'));


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Web Server listening on port ${PORT}`);
  console.log('💡 Note: Python API should be deployed separately and linked in login.js');
});