-- ========================================
-- MFU Election Voting System - Database Setup
-- ========================================
-- Run this file once to initialize the database.
-- In phpMyAdmin: create database 'mfu_election' then import this file.
-- Or via CLI: mysql -u root -p mfu_election < database.sql

CREATE DATABASE IF NOT EXISTS mfu_election
    DEFAULT CHARACTER SET utf8mb4
    DEFAULT COLLATE utf8mb4_unicode_ci;

USE mfu_election;

CREATE TABLE IF NOT EXISTS candidates (
    id            INT UNSIGNED    AUTO_INCREMENT PRIMARY KEY,
    candidate_id  VARCHAR(10)     UNIQUE NOT NULL,
    password_hash VARCHAR(255)    NULL,
    full_name     VARCHAR(200)    NULL,
    email         VARCHAR(200)    NULL,
    policy        TEXT            NULL,
    number        TINYINT UNSIGNED NULL,
    is_registered TINYINT(1)      NOT NULL DEFAULT 0,
    is_enabled    TINYINT(1)      NOT NULL DEFAULT 1,
    created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    registered_at DATETIME        NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS voters (
    id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    citizen_id VARCHAR(20)  UNIQUE NOT NULL,
    laser_id   VARCHAR(20)  NOT NULL,
    is_enabled TINYINT(1)   NOT NULL DEFAULT 1,
    has_voted  TINYINT(1)   NOT NULL DEFAULT 0,
    created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS votes (
    id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    voter_id     INT UNSIGNED NOT NULL,
    candidate_id INT UNSIGNED NOT NULL,
    voted_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_voter (voter_id),
    FOREIGN KEY (voter_id)     REFERENCES voters(id)    ON DELETE CASCADE,
    FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS settings (
    setting_key   VARCHAR(50)  PRIMARY KEY,
    setting_value VARCHAR(255) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO settings (setting_key, setting_value) VALUES
    ('voting_enabled',        '1'),
    ('registration_enabled',  '1')
ON DUPLICATE KEY UPDATE setting_value = setting_value;

-- ========================================
-- Sample Data (optional - remove in production)
-- ========================================
-- Admin: username=admin, password=admin123
-- Candidate login: C-0001 / pass1234

INSERT IGNORE INTO candidates (candidate_id, password_hash, full_name, email, policy, number, is_registered, is_enabled) VALUES
('C-0001', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'นายกฤษณะ สุขใจ',     'krishna@gmail.com', 'พัฒนาระบบ Wi-Fi มหาวิทยาลัย เพิ่มพื้นที่นั่งเรียนและพื้นที่ทำงานกลุ่ม', 1, 1, 1),
('C-0002', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'นางสาวพิมพ์ใจ แก้วงาม','pimjai@gmail.com',  'เพิ่มทุนการศึกษา ลดค่าธรรมเนียมนักศึกษา',                               2, 1, 1),
('C-0003', NULL,                                                              NULL,                  NULL,                NULL,                                                                      3, 0, 1),
('C-0004', NULL,                                                              NULL,                  NULL,                NULL,                                                                      4, 0, 1),
('C-0005', NULL,                                                              NULL,                  NULL,                NULL,                                                                      5, 0, 1);

-- Note: The password hash above is for "password" (PHP default test hash).
-- Use actual bcrypt hashes in production: password_hash('yourpassword', PASSWORD_BCRYPT)

INSERT IGNORE INTO voters (citizen_id, laser_id, is_enabled) VALUES
('1234567890123', 'AA0-0000001-00', 1),
('9876543210987', 'BB0-0000002-00', 1),
('1111111111111', 'CC0-0000003-00', 1);
