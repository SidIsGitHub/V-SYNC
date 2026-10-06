const mysql = require('mysql2/promise');

async function test() {
    const pool = mysql.createPool({
        host: 'localhost',
        user: 'root',
        password: 'Root123!',
        database: 'vsync_db'
    });

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
    console.log("Posts Query Successful:", rows.length);
    process.exit();
}
test();
