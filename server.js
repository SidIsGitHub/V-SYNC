const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');

const app = express();
const PORT = 3000;

// 1. CORS must be the absolute first middleware
app.use(cors({
    origin: '*', // Allows all local IP variants (localhost, 127.0.0.1)
    methods: ['GET', 'POST', 'DELETE']
}));
app.use(express.json());

// 2. Database Connection Pool
const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: 'Root123!',
    database: 'vsync_db',
    waitForConnections: true,
    connectionLimit: 10
});

// 3. Boot Verification
pool.getConnection()
    .then(() => console.log('MySQL Connected Successfully'))
    .catch(err => console.error('MySQL Connection Failed:', err.message));

// 4. API Routes
app.post('/api/register', async (req, res) => {
    const { firstName, lastName, email, password, currentYear, workExperience, profilePicture } = req.body;
    try {
        const fullName = firstName + ' ' + lastName;
        await pool.query(
            'INSERT INTO users (first_name, email, password, current_year, work_experience, profile_picture) VALUES (?, ?, ?, ?, ?, ?)',
            [fullName, email, password, currentYear, workExperience, profilePicture]
        );
        res.json({ success: true });
    } catch (err) {
        console.error('Registration Error:', err.message);
        res.status(400).json({ success: false, message: 'Registration failed. Email might already exist.' });
    }
});
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
            res.status(401).json({ success: false, message: 'Invalid credentials' });
        }
    } catch (err) {
        console.error('Server Error:', err);
        res.status(500).json({ success: false, message: 'Database error' });
    }
});

app.get('/api/posts', async (req, res) => {
    try {
        const userId = req.query.user_id || '1'; // Default if none provided
        const [rows] = await pool.query(
            'SELECT p.post_id, p.title, p.content, p.created_at, p.author_id, u.first_name, ' +
            '(SELECT COUNT(*) FROM votes WHERE post_id = p.post_id AND vote_value = 1) AS upvotes, ' +
            '(SELECT COUNT(*) FROM votes WHERE post_id = p.post_id AND vote_value = -1) AS downvotes, ' +
            '(SELECT vote_value FROM votes WHERE post_id = p.post_id AND user_id = ?) AS user_vote ' +
            'FROM posts p JOIN users u ON p.author_id = u.user_id ORDER BY p.created_at DESC',
            [userId]
        );
        res.json({ success: true, posts: rows });
    } catch (err) {
        console.error('Feed Fetch Error:', err.message);
        res.status(500).json({ success: false, message: 'Database error' });
    }
});

app.post('/api/posts', async (req, res) => {
    const { author_id, title, content, category_id } = req.body;
    try {
        await pool.query(
            'INSERT INTO posts (author_id, title, content, category_id) VALUES (?, ?, ?, ?)',
            [author_id, title, content, category_id]
        );
        res.json({ success: true, message: 'Post created' });
    } catch (err) {
        console.error('Post Creation Error:', err.message);
        res.status(500).json({ success: false, message: 'Database error' });
    }
});

app.delete('/api/posts/:postId', async (req, res) => {
    try {
        const { postId } = req.params;
        const { user_id } = req.query;
        const [result] = await pool.query('DELETE FROM posts WHERE post_id = ? AND author_id = ?', [postId, user_id]);
        
        if (result.affectedRows === 0) {
            return res.status(403).json({ success: false, message: 'Unauthorized or Post not found' });
        }
        res.json({ success: true, message: 'Post deleted' });
    } catch (err) {
        console.error('Post Deletion Error:', err.message);
        res.status(500).json({ success: false, message: 'Database error' });
    }
});

app.get('/api/leaderboard', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT u.user_id, u.first_name, COALESCE(SUM(p.vote_count), 0) as total_score FROM users u LEFT JOIN posts p ON u.user_id = p.author_id GROUP BY u.user_id ORDER BY total_score DESC LIMIT 10');
        res.json({ success: true, leaderboard: rows });
    } catch (err) {
        console.error('Server Error:', err);
        res.status(500).json({ success: false, message: 'Database error' });
    }
});

app.post('/api/vote', async (req, res) => {
    const { user_id, post_id, vote_value } = req.body;
    try {
        const [existing] = await pool.query('SELECT vote_value FROM votes WHERE user_id = ? AND post_id = ?', [user_id, post_id]);
        if (existing.length > 0 && existing[0].vote_value === vote_value) {
            await pool.query('DELETE FROM votes WHERE user_id = ? AND post_id = ?', [user_id, post_id]);
        } else {
            await pool.query('REPLACE INTO votes (user_id, post_id, vote_value) VALUES (?, ?, ?)', [user_id, post_id, vote_value]);
        }
        res.json({ success: true });
    } catch (err) {
        console.error('Vote Error:', err.message);
        res.status(500).json({ success: false, message: 'Database error' });
    }
});

app.get('/api/users/:id', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT first_name, email, current_year, work_experience, profile_picture, created_at FROM users WHERE user_id = ?', [req.params.id]);
        res.json({ success: true, profile: rows[0] });
    } catch (err) {
        console.error('Profile Error:', err.message);
        res.status(500).json({ success: false, message: 'Database error' });
    }
});

app.delete('/api/users/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM users WHERE user_id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        console.error('User Deletion Error:', err.message);
        res.status(500).json({ success: false, message: 'Database error' });
    }
});

app.get('/api/comments/:postId', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT c.content, c.created_at, u.first_name FROM comments c JOIN users u ON c.author_id = u.user_id WHERE c.post_id = ? ORDER BY c.created_at ASC', [req.params.postId]);
        res.json({ success: true, comments: rows });
    } catch (err) {
        console.error('Comments Fetch Error:', err.message);
        res.status(500).json({ success: false, message: 'Database error' });
    }
});

app.post('/api/comments', async (req, res) => {
    const { post_id, author_id, content } = req.body;
    try {
        await pool.query('INSERT INTO comments (post_id, author_id, content) VALUES (?, ?, ?)', [post_id, author_id, content]);
        res.json({ success: true });
    } catch (err) {
        console.error('Comment Post Error:', err.message);
        res.status(500).json({ success: false, message: 'Database error' });
    }
});

app.get('/api/connections/users/:currentUserId', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT user_id, first_name, role, college FROM users WHERE user_id != ?', [req.params.currentUserId]);
        res.json({ success: true, users: rows });
    } catch (err) {
        console.error('Connections Fetch Error:', err.message);
        res.status(500).json({ success: false, message: 'Database error' });
    }
});

app.post('/api/connections/follow', async (req, res) => {
    const { follower_user, following_user } = req.body;
    try {
        const [existing] = await pool.query(
            'SELECT status FROM followers WHERE follower_user = ? AND following_user = ?',
            [follower_user, following_user]
        );
        if (existing.length > 0) {
            await pool.query(
                'DELETE FROM followers WHERE follower_user = ? AND following_user = ?',
                [follower_user, following_user]
            );
        } else {
            await pool.query(
                'INSERT INTO followers (follower_user, following_user, status) VALUES (?, ?, ?)',
                [follower_user, following_user, 'pending']
            );
        }
        res.json({ success: true });
    } catch (err) {
        console.error('Follow Error:', err.message);
        res.status(500).json({ success: false, message: 'Database error' });
    }
});

app.post('/api/connections/accept', async (req, res) => {
    const { follower_user, following_user } = req.body;
    try {
        await pool.query(
            'UPDATE followers SET status = ? WHERE follower_user = ? AND following_user = ?',
            ['accepted', follower_user, following_user]
        );
        res.json({ success: true });
    } catch (err) {
        console.error('Accept Connection Error:', err.message);
        res.status(500).json({ success: false, message: 'Database error' });
    }
});

app.get('/api/network/discover/:id', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT user_id, first_name, role, college FROM users WHERE user_id != ?', [req.params.id]);
        res.json({ success: true, users: rows });
    } catch (err) {
        console.error('Discover Error:', err.message);
        res.status(500).json({ success: false, message: 'Database error' });
    }
});

app.get('/api/network/connected/:id', async (req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT u.user_id, u.first_name, u.role, u.college, f.status, f.follower_user, f.following_user FROM users u JOIN followers f ON (u.user_id = f.follower_user OR u.user_id = f.following_user) WHERE (f.following_user = ? AND f.status = \'pending\' AND u.user_id = f.follower_user) OR (f.status = \'accepted\' AND u.user_id != ?)',
            [req.params.id, req.params.id]
        );
        res.json({ success: true, users: rows });
    } catch (err) {
        console.error('Connected Error:', err.message);
        res.status(500).json({ success: false, message: 'Database error' });
    }
});

// 5. Server Initialization
app.listen(PORT, '127.0.0.1', () => {
    console.log(`V-SYNC API server listening on http://127.0.0.1:${PORT}`);
});
