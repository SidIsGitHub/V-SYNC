-- database.sql
CREATE DATABASE IF NOT EXISTS vsync_db;
USE vsync_db;

-- Users Table
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(255) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Posts Table
CREATE TABLE IF NOT EXISTS posts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Upvotes Table (Many-to-Many Relationship)
CREATE TABLE IF NOT EXISTS upvotes (
    post_id INT NOT NULL,
    user_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (post_id, user_id),
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- View for Leaderboard Scores
-- Assuming score is calculated by the number of posts and upvotes received
CREATE OR REPLACE VIEW LeaderboardView AS
SELECT 
    u.id AS user_id,
    u.username,
    COUNT(DISTINCT p.id) AS total_posts,
    COUNT(DISTINCT v.post_id, v.user_id) AS total_upvotes_received,
    (COUNT(DISTINCT p.id) * 10 + COUNT(DISTINCT v.post_id, v.user_id) * 5) AS score
FROM 
    users u
LEFT JOIN 
    posts p ON u.id = p.user_id
LEFT JOIN 
    upvotes v ON p.id = v.post_id
GROUP BY 
    u.id, u.username
ORDER BY 
    score DESC;

-- Stored Procedure for Upvote Toggling
DELIMITER //

CREATE PROCEDURE ToggleUpvote(IN p_post_id INT, IN p_user_id INT)
BEGIN
    DECLARE upvote_exists INT;
    
    -- Check if the upvote already exists
    SELECT COUNT(*) INTO upvote_exists 
    FROM upvotes 
    WHERE post_id = p_post_id AND user_id = p_user_id;
    
    IF upvote_exists > 0 THEN
        -- If exists, remove the upvote (Toggle OFF)
        DELETE FROM upvotes 
        WHERE post_id = p_post_id AND user_id = p_user_id;
    ELSE
        -- If not exists, add the upvote (Toggle ON)
        INSERT INTO upvotes (post_id, user_id) 
        VALUES (p_post_id, p_user_id);
    END IF;
END //

DELIMITER ;

-- Events Table
CREATE TABLE IF NOT EXISTS events (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    date DATETIME NOT NULL,
    location VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
