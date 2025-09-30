import * as SQLite from 'expo-sqlite';
import {
  initializeDatabase,
  getDatabase,
  closeDatabase,
  resetDatabase,
  checkDatabaseIntegrity,
  migrateDatabase,
  resetDatabaseInstance
} from '../index';
import {
  DATABASE_NAME,
  CREATE_TABLES,
  INSERT_DEFAULT_SETTINGS
} from '../schema';

// Mock expo-sqlite
jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn(),
}));

describe('Database Operations', () => {
  let mockDatabase: any;

  beforeEach(() => {
    mockDatabase = {
      execAsync: jest.fn(),
      closeAsync: jest.fn(),
      getFirstAsync: jest.fn(),
    };
    
    (SQLite.openDatabaseAsync as jest.Mock).mockResolvedValue(mockDatabase);
  });

  afterEach(() => {
    jest.clearAllMocks();
    resetDatabaseInstance();
  });

  describe('initializeDatabase', () => {
    it('should initialize database successfully', async () => {
      const db = await initializeDatabase();
      
      expect(SQLite.openDatabaseAsync).toHaveBeenCalledWith(DATABASE_NAME);
      expect(mockDatabase.execAsync).toHaveBeenCalledWith('PRAGMA foreign_keys = ON;');
      
      // Check that all table creation statements were executed
      CREATE_TABLES.forEach(statement => {
        expect(mockDatabase.execAsync).toHaveBeenCalledWith(statement);
      });
      
      expect(mockDatabase.execAsync).toHaveBeenCalledWith(INSERT_DEFAULT_SETTINGS);
      expect(db).toBe(mockDatabase);
    });

    it('should return existing database if already initialized', async () => {
      // First initialization
      await initializeDatabase();
      
      // Second call should return same instance
      const db2 = await initializeDatabase();
      
      expect(SQLite.openDatabaseAsync).toHaveBeenCalledTimes(1);
      expect(db2).toBe(mockDatabase);
    });

    it('should throw error if database initialization fails', async () => {
      const error = new Error('Database creation failed');
      (SQLite.openDatabaseAsync as jest.Mock).mockRejectedValue(error);
      
      await expect(initializeDatabase()).rejects.toThrow('Database initialization failed: Error: Database creation failed');
    });
  });

  describe('getDatabase', () => {
    it('should return database instance when initialized', async () => {
      await initializeDatabase();
      const db = getDatabase();
      
      expect(db).toBe(mockDatabase);
    });

    it('should throw error when database not initialized', () => {
      expect(() => getDatabase()).toThrow('Database not initialized. Call initializeDatabase() first.');
    });
  });

  describe('closeDatabase', () => {
    it('should close database connection', async () => {
      await initializeDatabase();
      await closeDatabase();
      
      expect(mockDatabase.closeAsync).toHaveBeenCalled();
    });

    it('should handle closing when database not initialized', async () => {
      await closeDatabase();
      
      expect(mockDatabase.closeAsync).not.toHaveBeenCalled();
    });
  });

  describe('resetDatabase', () => {
    it('should reset database successfully', async () => {
      await initializeDatabase();
      await resetDatabase();
      
      // Check that drop statements were executed
      expect(mockDatabase.execAsync).toHaveBeenCalledWith('DROP TABLE IF EXISTS emergency_contacts;');
      expect(mockDatabase.execAsync).toHaveBeenCalledWith('DROP TABLE IF EXISTS track_points;');
      expect(mockDatabase.execAsync).toHaveBeenCalledWith('DROP TABLE IF EXISTS splits;');
      expect(mockDatabase.execAsync).toHaveBeenCalledWith('DROP TABLE IF EXISTS runs;');
      expect(mockDatabase.execAsync).toHaveBeenCalledWith('DROP TABLE IF EXISTS settings;');
      
      // Check that tables were recreated
      CREATE_TABLES.forEach(statement => {
        expect(mockDatabase.execAsync).toHaveBeenCalledWith(statement);
      });
    });

    it('should throw error when database not initialized', async () => {
      await expect(resetDatabase()).rejects.toThrow('Database not initialized');
    });

    it('should throw error if reset fails', async () => {
      await initializeDatabase();
      const error = new Error('Reset failed');
      mockDatabase.execAsync.mockRejectedValueOnce(error);
      
      await expect(resetDatabase()).rejects.toThrow('Database reset failed: Error: Reset failed');
    });
  });

  describe('checkDatabaseIntegrity', () => {
    it('should return true when all tables exist', async () => {
      await initializeDatabase();
      mockDatabase.getFirstAsync.mockResolvedValue({ name: 'table_name' });
      
      const result = await checkDatabaseIntegrity();
      
      expect(result).toBe(true);
      expect(mockDatabase.getFirstAsync).toHaveBeenCalledTimes(5); // 5 tables
    });

    it('should return false when table is missing', async () => {
      await initializeDatabase();
      mockDatabase.getFirstAsync.mockResolvedValueOnce({ name: 'settings' });
      mockDatabase.getFirstAsync.mockResolvedValueOnce(null); // Missing table
      
      const result = await checkDatabaseIntegrity();
      
      expect(result).toBe(false);
    });

    it('should return false when database not initialized', async () => {
      const result = await checkDatabaseIntegrity();
      
      expect(result).toBe(false);
    });

    it('should return false when integrity check fails', async () => {
      await initializeDatabase();
      mockDatabase.getFirstAsync.mockRejectedValue(new Error('Query failed'));
      
      const result = await checkDatabaseIntegrity();
      
      expect(result).toBe(false);
    });
  });

  describe('migrateDatabase', () => {
    it('should handle same version migration', async () => {
      await initializeDatabase();
      
      await expect(migrateDatabase(1, 1)).resolves.toBeUndefined();
    });

    it('should throw error for unsupported migration', async () => {
      await initializeDatabase();
      
      await expect(migrateDatabase(1, 2)).rejects.toThrow('Migration from version 1 to 2 not supported');
    });

    it('should throw error when database not initialized', async () => {
      await expect(migrateDatabase(1, 2)).rejects.toThrow('Database not initialized');
    });
  });
});