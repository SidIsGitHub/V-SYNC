const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');

const app = express();
const port = 3000;

// Middleware
app.use(cors());
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});
app.use(express.json());
app.use(express.static('src')); // Serve frontend HTML and JS from src folder
app.use(express.static('public')); // Serve assets like favicon.ico from public folder

// Database connection pool
const pool = mysql.createPool({
    host: 'localhost',
    user: 'root', // Update with your MySQL username
    password: 'Root123!', // Update with your MySQL password
    database: 'vsync_db',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Test database connection
pool.getConnection()
    .then((connection) => {
        console.log('MySQL connected successfully');
        connection.release();
    })
    .catch((err) => {
        console.error('MySQL connection error:', err);
    });
// Helper for error handling
const handleQueryError = (res, err) => {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error', details: err.message });
};

// --- RESTful Endpoints ---

// Get all posts with user info and upvote counts
app.get('/api/posts', async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT 
                p.post_id AS id, p.title, p.body AS content, p.created_at,
                u.first_name AS username,
                COUNT(v.user_id) AS upvotes
            FROM posts p
            JOIN users u ON p.user_id = u.user_id
            LEFT JOIN upvotes v ON p.post_id = v.post_id
            GROUP BY p.post_id, p.title, p.body, p.created_at, u.first_name
            ORDER BY p.created_at DESC
        `);
        res.json(rows);
    } catch (err) {
        handleQueryError(res, err);
    }
});

// Create a new post
app.post('/api/posts', async (req, res) => {
    const { user_id, title, content } = req.body;
    if (!user_id || !title || !content) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    
    try {
        const [result] = await pool.query(
            'INSERT INTO posts (user_id, title, content) VALUES (?, ?, ?)',
            [user_id, title, content]
        );
        res.status(201).json({ id: result.insertId, message: 'Post created successfully' });
    } catch (err) {
        handleQueryError(res, err);
    }
});

// Get the leaderboard view
app.get('/api/leaderboard', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM LeaderboardView');
        res.json(rows);
    } catch (err) {
        handleQueryError(res, err);
    }
});

// Toggle an upvote using the Stored Procedure
app.post('/api/upvotes/toggle', async (req, res) => {
    const { post_id, user_id } = req.body;
    if (!post_id || !user_id) {
        return res.status(400).json({ error: 'Missing post_id or user_id' });
    }

    try {
        await pool.query('CALL ToggleUpvote(?, ?)', [post_id, user_id]);
        
        // Return the new upvote count for convenience
        const [countResult] = await pool.query(
            'SELECT COUNT(*) as upvotes FROM upvotes WHERE post_id = ?', 
            [post_id]
        );
        res.json({ message: 'Upvote toggled', upvotes: countResult[0].upvotes });
    } catch (err) {
        handleQueryError(res, err);
    }
});

// Ensure user exists (utility for login/registration simulation)
app.post('/api/users', async (req, res) => {
    const { username } = req.body;
    if (!username) {
        return res.status(400).json({ error: 'Missing username' });
    }

    try {
        const [existing] = await pool.query('SELECT * FROM users WHERE username = ?', [username]);
        if (existing.length > 0) {
            return res.json(existing[0]); // Return existing user
        }
        
        const [result] = await pool.query('INSERT INTO users (username) VALUES (?)', [username]);
        res.status(201).json({ id: result.insertId, username });
    } catch (err) {
        handleQueryError(res, err);
    }
});


// --- AUTHENTICATION ---
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const [rows] = await pool.query(
            'SELECT user_id, email, first_name, role FROM users WHERE email = ? AND password = ?', 
            [email, password]
        );
        if (rows.length > 0) {
            res.json({ success: true, user: rows[0] });
        } else {
            res.status(401).json({ success: false, message: 'Account not found' });
        }
    } catch (err) {
        console.error('Login Error:', err);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// Handle 404s (prevents Chrome DevTools CSP errors on .well-known paths)
app.use((req, res) => {
    res.status(404).send('Not Found');
});

// Start the server
app.listen(port, () => {
    console.log(`V-SYNC API server listening on port ${port}`);
});
