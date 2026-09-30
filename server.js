const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('src')); // Serve frontend HTML and JS from src folder
app.use(express.static('public')); // Serve assets like favicon.ico from public folder

// Database connection pool
const pool = mysql.createPool({
    host: 'localhost',
    user: 'root', // Update with your MySQL username
    password: 'Sidd@1604', // Update with your MySQL password
    database: 'vsync_db',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
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

// Get all events
app.get('/api/events', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM events ORDER BY date ASC');
        res.json(rows);
    } catch (err) {
        handleQueryError(res, err);
    }
});

// --- AUTHENTICATION ---
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ success: false, error: 'Email and password are required' });
    }

    try {
        const [rows] = await pool.query('SELECT user_id AS id, first_name AS username, email, role FROM users WHERE email = ? AND password = ?', [email, password]);
        if (rows.length > 0) {
            const user = rows[0];
            // Exclude password from the returned object
            const { password: _, ...userData } = user;
            res.json({ success: true, user: userData });
        } else {
            res.status(401).json({ success: false, error: 'Invalid email or password' });
        }
    } catch (err) {
        handleQueryError(res, err);
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
