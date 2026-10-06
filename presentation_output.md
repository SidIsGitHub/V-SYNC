# V-SYNC Backend Migration Defense
## Core SQL Relational Architecture

### 1. Normalized Database Schema (database.sql)
```sql
-- Users Table
CREATE TABLE IF NOT EXISTS users (
    user_id INT AUTO_INCREMENT PRIMARY KEY,
    first_name VARCHAR(255) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'student',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Posts Table
CREATE TABLE IF NOT EXISTS posts (
    post_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    title VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

-- Upvotes Table (Many-to-Many Relationship)
CREATE TABLE IF NOT EXISTS upvotes (
    post_id INT NOT NULL,
    user_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (post_id, user_id),
    FOREIGN KEY (post_id) REFERENCES posts(post_id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);
```

### 2. Stored Procedure: Upvote Toggling
```sql
DELIMITER //
CREATE PROCEDURE ToggleUpvote(IN p_post_id INT, IN p_user_id INT)
BEGIN
    DECLARE upvote_exists INT;
    SELECT COUNT(*) INTO upvote_exists 
    FROM upvotes 
    WHERE post_id = p_post_id AND user_id = p_user_id;
    
    IF upvote_exists > 0 THEN
        DELETE FROM upvotes WHERE post_id = p_post_id AND user_id = p_user_id;
    ELSE
        INSERT INTO upvotes (post_id, user_id) VALUES (p_post_id, p_user_id);
    END IF;
END //
DELIMITER ;
```

### 3. View: Leaderboard Ranking
```sql
CREATE OR REPLACE VIEW LeaderboardView AS
SELECT 
    u.user_id,
    u.first_name,
    COUNT(DISTINCT p.post_id) AS total_posts,
    COUNT(DISTINCT v.post_id, v.user_id) AS total_upvotes_received,
    (COUNT(DISTINCT p.post_id) * 10 + COUNT(DISTINCT v.post_id, v.user_id) * 5) AS score
FROM users u
LEFT JOIN posts p ON u.user_id = p.user_id
LEFT JOIN upvotes v ON p.post_id = v.post_id
GROUP BY u.user_id, u.first_name
ORDER BY score DESC;
```
