// Database layer exports
import * as SQLite from 'expo-sqlite';
import { 
  DATABASE_NAME, 
  DATABASE_VERSION, 
  CREATE_TABLES, 
  INSERT_DEFAULT_SETTINGS 
} from './schema';

let database: SQLite.SQLiteDatabase | null = null;

// Reset function for testing
export function resetDatabaseInstance(): void {
  database = null;
}

/**
 * Initialize the SQLite database and create tables
 */
export async function initializeDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (database) {
    return database;
  }

  try {
    database = await SQLite.openDatabaseAsync(DATABASE_NAME);
    
    // Enable foreign key constraints
    await database.execAsync('PRAGMA foreign_keys = ON;');
    
    // Create all tables and indexes
    for (const statement of CREATE_TABLES) {
      await database.execAsync(statement);
    }
    
    // Insert default settings
    await database.execAsync(INSERT_DEFAULT_SETTINGS);
    
    console.log('Database initialized successfully');
    return database;
  } catch (error) {
    console.error('Failed to initialize database:', error);
    throw new Error(`Database initialization failed: ${error}`);
  }
}

/**
 * Get the current database instance
 */
export function getDatabase(): SQLite.SQLiteDatabase {
  if (!database) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return database;
}

/**
 * Close the database connection
 */
export async function closeDatabase(): Promise<void> {
  if (database) {
    await database.closeAsync();
    database = null;
    console.log('Database connection closed');
  }
}

/**
 * Reset the database by dropping all tables and recreating them
 */
export async function resetDatabase(): Promise<void> {
  if (!database) {
    throw new Error('Database not initialized');
  }

  try {
    // Drop all tables
    await database.execAsync('DROP TABLE IF EXISTS emergency_contacts;');
    await database.execAsync('DROP TABLE IF EXISTS track_points;');
    await database.execAsync('DROP TABLE IF EXISTS splits;');
    await database.execAsync('DROP TABLE IF EXISTS runs;');
    await database.execAsync('DROP TABLE IF EXISTS settings;');
    
    // Recreate tables
    for (const statement of CREATE_TABLES) {
      await database.execAsync(statement);
    }
    
    // Insert default settings
    await database.execAsync(INSERT_DEFAULT_SETTINGS);
    
    console.log('Database reset successfully');
  } catch (error) {
    console.error('Failed to reset database:', error);
    throw new Error(`Database reset failed: ${error}`);
  }
}

/**
 * Check if database tables exist
 */
export async function checkDatabaseIntegrity(): Promise<boolean> {
  if (!database) {
    return false;
  }

  try {
    const tables = ['settings', 'runs', 'splits', 'track_points', 'emergency_contacts'];
    
    for (const table of tables) {
      const result = await database.getFirstAsync(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
        [table]
      );
      
      if (!result) {
        console.error(`Table ${table} does not exist`);
        return false;
      }
    }
    
    return true;
  } catch (error) {
    console.error('Database integrity check failed:', error);
    return false;
  }
}

/**
 * Perform database migration (for future versions)
 */
export async function migrateDatabase(fromVersion: number, toVersion: number): Promise<void> {
  if (!database) {
    throw new Error('Database not initialized');
  }

  console.log(`Migrating database from version ${fromVersion} to ${toVersion}`);
  
  // Migration logic will be added here when needed
  // For now, we only support version 1
  if (fromVersion === toVersion) {
    return;
  }
  
  throw new Error(`Migration from version ${fromVersion} to ${toVersion} not supported`);
}

export * from './schema';
export { DatabaseService } from './DatabaseService';