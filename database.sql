-- V-SYNC Relational Database Schema
CREATE DATABASE IF NOT EXISTS vsync_db;
USE vsync_db;

-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
    user_id INT AUTO_INCREMENT PRIMARY KEY,
    first_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'student',
    college VARCHAR(255) DEFAULT 'Not specified',
    current_year VARCHAR(50) DEFAULT 'Not specified',
    work_experience TEXT DEFAULT NULL,
    profile_picture LONGTEXT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Posts Table
CREATE TABLE IF NOT EXISTS posts (
    post_id INT AUTO_INCREMENT PRIMARY KEY,
    author_id INT NOT NULL,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    category_id INT DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (author_id) REFERENCES users(user_id) ON DELETE CASCADE
);

-- 3. Votes Table (Upvotes / Downvotes)
CREATE TABLE IF NOT EXISTS votes (
    user_id INT NOT NULL,
    post_id INT NOT NULL,
    vote_value INT NOT NULL, -- 1 for upvote, -1 for downvote
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, post_id),
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (post_id) REFERENCES posts(post_id) ON DELETE CASCADE
);

-- 4. Comments Table
CREATE TABLE IF NOT EXISTS comments (
    comment_id INT AUTO_INCREMENT PRIMARY KEY,
    post_id INT NOT NULL,
    author_id INT NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (post_id) REFERENCES posts(post_id) ON DELETE CASCADE,
    FOREIGN KEY (author_id) REFERENCES users(user_id) ON DELETE CASCADE
);

-- 5. Followers Table (Connection State Machine)
CREATE TABLE IF NOT EXISTS followers (
    follower_id INT AUTO_INCREMENT PRIMARY KEY,
    follower_user INT NOT NULL,
    following_user INT NOT NULL,
    status VARCHAR(20) DEFAULT 'pending', -- 'pending' or 'accepted'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (follower_user) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (following_user) REFERENCES users(user_id) ON DELETE CASCADE
);
