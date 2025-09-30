// Database schema definitions
import * as SQLite from 'expo-sqlite';

export const DATABASE_NAME = 'blind_runner.db';
export const DATABASE_VERSION = 1;

// SQL schema definitions
export const CREATE_SETTINGS_TABLE = `
  CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY,
    announcement_frequency_minutes INTEGER DEFAULT 5,
    announcement_frequency_distance INTEGER DEFAULT 1000,
    haptic_distance_enabled BOOLEAN DEFAULT 1,
    haptic_time_enabled BOOLEAN DEFAULT 0,
    voice_rate REAL DEFAULT 1.0,
    voice_pitch REAL DEFAULT 1.0,
    auto_pause_enabled BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`;

export const CREATE_RUNS_TABLE = `
  CREATE TABLE IF NOT EXISTS runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    start_time DATETIME NOT NULL,
    end_time DATETIME,
    total_distance REAL DEFAULT 0,
    total_duration INTEGER DEFAULT 0,
    average_pace REAL DEFAULT 0,
    status TEXT DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`;

export const CREATE_SPLITS_TABLE = `
  CREATE TABLE IF NOT EXISTS splits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id INTEGER NOT NULL,
    split_number INTEGER NOT NULL,
    distance REAL NOT NULL,
    duration INTEGER NOT NULL,
    pace REAL NOT NULL,
    timestamp DATETIME NOT NULL,
    FOREIGN KEY (run_id) REFERENCES runs (id) ON DELETE CASCADE
  );
`;

export const CREATE_TRACK_POINTS_TABLE = `
  CREATE TABLE IF NOT EXISTS track_points (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id INTEGER NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    altitude REAL,
    accuracy REAL,
    speed REAL,
    timestamp DATETIME NOT NULL,
    FOREIGN KEY (run_id) REFERENCES runs (id) ON DELETE CASCADE
  );
`;

export const CREATE_EMERGENCY_CONTACTS_TABLE = `
  CREATE TABLE IF NOT EXISTS emergency_contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone_number TEXT NOT NULL,
    is_primary BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`;

// Index definitions for performance
export const CREATE_INDEXES = [
  'CREATE INDEX IF NOT EXISTS idx_runs_status ON runs(status);',
  'CREATE INDEX IF NOT EXISTS idx_runs_start_time ON runs(start_time);',
  'CREATE INDEX IF NOT EXISTS idx_splits_run_id ON splits(run_id);',
  'CREATE INDEX IF NOT EXISTS idx_track_points_run_id ON track_points(run_id);',
  'CREATE INDEX IF NOT EXISTS idx_track_points_timestamp ON track_points(timestamp);',
  'CREATE INDEX IF NOT EXISTS idx_emergency_contacts_primary ON emergency_contacts(is_primary);'
];

// All table creation statements
export const CREATE_TABLES = [
  CREATE_SETTINGS_TABLE,
  CREATE_RUNS_TABLE,
  CREATE_SPLITS_TABLE,
  CREATE_TRACK_POINTS_TABLE,
  CREATE_EMERGENCY_CONTACTS_TABLE,
  ...CREATE_INDEXES
];

// Default settings insertion
export const INSERT_DEFAULT_SETTINGS = `
  INSERT OR IGNORE INTO settings (id) VALUES (1);
`;