import {
  validateRunData,
  validateSplit,
  validateTrackPoint,
  validateAppSettings,
  validateEmergencyContact,
  convertRowToRunData,
  convertRowToSplit,
  convertRowToTrackPoint,
  convertRowToAppSettings,
  convertRowToEmergencyContact,
  RunData,
  Split,
  TrackPoint,
  AppSettings,
  EmergencyContact,
  RunDataRow,
  SplitRow,
  TrackPointRow,
  AppSettingsRow,
  EmergencyContactRow
} from '../types';

describe('Data Model Validation', () => {
  describe('validateRunData', () => {
    it('should return no errors for valid run data', () => {
      const validData: Partial<RunData> = {
        totalDistance: 5000,
        totalDuration: 1800,
        averagePace: 6.0,
        status: 'completed'
      };
      
      const errors = validateRunData(validData);
      expect(errors).toEqual([]);
    });

    it('should return error for negative distance', () => {
      const invalidData: Partial<RunData> = {
        totalDistance: -100
      };
      
      const errors = validateRunData(invalidData);
      expect(errors).toContain('Total distance cannot be negative');
    });

    it('should return error for negative duration', () => {
      const invalidData: Partial<RunData> = {
        totalDuration: -60
      };
      
      const errors = validateRunData(invalidData);
      expect(errors).toContain('Total duration cannot be negative');
    });

    it('should return error for negative pace', () => {
      const invalidData: Partial<RunData> = {
        averagePace: -1.5
      };
      
      const errors = validateRunData(invalidData);
      expect(errors).toContain('Average pace cannot be negative');
    });

    it('should return error for invalid status', () => {
      const invalidData: Partial<RunData> = {
        status: 'invalid' as any
      };
      
      const errors = validateRunData(invalidData);
      expect(errors).toContain('Invalid run status');
    });

    it('should return multiple errors for multiple invalid fields', () => {
      const invalidData: Partial<RunData> = {
        totalDistance: -100,
        totalDuration: -60,
        status: 'invalid' as any
      };
      
      const errors = validateRunData(invalidData);
      expect(errors).toHaveLength(3);
    });
  });

  describe('validateSplit', () => {
    it('should return no errors for valid split', () => {
      const validSplit: Partial<Split> = {
        splitNumber: 1,
        distance: 1000,
        duration: 300,
        pace: 5.0
      };
      
      const errors = validateSplit(validSplit);
      expect(errors).toEqual([]);
    });

    it('should return error for invalid split number', () => {
      const invalidSplit: Partial<Split> = {
        splitNumber: 0
      };
      
      const errors = validateSplit(invalidSplit);
      expect(errors).toContain('Split number must be positive');
    });

    it('should return error for invalid distance', () => {
      const invalidSplit: Partial<Split> = {
        distance: 0
      };
      
      const errors = validateSplit(invalidSplit);
      expect(errors).toContain('Split distance must be positive');
    });

    it('should return error for invalid duration', () => {
      const invalidSplit: Partial<Split> = {
        duration: -10
      };
      
      const errors = validateSplit(invalidSplit);
      expect(errors).toContain('Split duration must be positive');
    });

    it('should return error for negative pace', () => {
      const invalidSplit: Partial<Split> = {
        pace: -1.0
      };
      
      const errors = validateSplit(invalidSplit);
      expect(errors).toContain('Split pace cannot be negative');
    });
  });

  describe('validateTrackPoint', () => {
    it('should return no errors for valid track point', () => {
      const validPoint: Partial<TrackPoint> = {
        latitude: 40.7128,
        longitude: -74.0060,
        accuracy: 5.0,
        speed: 3.5
      };
      
      const errors = validateTrackPoint(validPoint);
      expect(errors).toEqual([]);
    });

    it('should return error for invalid latitude', () => {
      const invalidPoint: Partial<TrackPoint> = {
        latitude: 95.0
      };
      
      const errors = validateTrackPoint(invalidPoint);
      expect(errors).toContain('Latitude must be between -90 and 90');
    });

    it('should return error for invalid longitude', () => {
      const invalidPoint: Partial<TrackPoint> = {
        longitude: 185.0
      };
      
      const errors = validateTrackPoint(invalidPoint);
      expect(errors).toContain('Longitude must be between -180 and 180');
    });

    it('should return error for negative accuracy', () => {
      const invalidPoint: Partial<TrackPoint> = {
        accuracy: -1.0
      };
      
      const errors = validateTrackPoint(invalidPoint);
      expect(errors).toContain('Accuracy cannot be negative');
    });

    it('should return error for negative speed', () => {
      const invalidPoint: Partial<TrackPoint> = {
        speed: -2.0
      };
      
      const errors = validateTrackPoint(invalidPoint);
      expect(errors).toContain('Speed cannot be negative');
    });
  });

  describe('validateAppSettings', () => {
    it('should return no errors for valid settings', () => {
      const validSettings: Partial<AppSettings> = {
        announcementFrequencyMinutes: 5,
        announcementFrequencyDistance: 1000,
        voiceRate: 1.0,
        voicePitch: 1.0
      };
      
      const errors = validateAppSettings(validSettings);
      expect(errors).toEqual([]);
    });

    it('should return error for invalid announcement frequency minutes', () => {
      const invalidSettings: Partial<AppSettings> = {
        announcementFrequencyMinutes: 0
      };
      
      const errors = validateAppSettings(invalidSettings);
      expect(errors).toContain('Announcement frequency minutes must be positive');
    });

    it('should return error for invalid announcement frequency distance', () => {
      const invalidSettings: Partial<AppSettings> = {
        announcementFrequencyDistance: -100
      };
      
      const errors = validateAppSettings(invalidSettings);
      expect(errors).toContain('Announcement frequency distance must be positive');
    });

    it('should return error for invalid voice rate', () => {
      const invalidSettings: Partial<AppSettings> = {
        voiceRate: 3.0
      };
      
      const errors = validateAppSettings(invalidSettings);
      expect(errors).toContain('Voice rate must be between 0.1 and 2.0');
    });

    it('should return error for invalid voice pitch', () => {
      const invalidSettings: Partial<AppSettings> = {
        voicePitch: 0.3
      };
      
      const errors = validateAppSettings(invalidSettings);
      expect(errors).toContain('Voice pitch must be between 0.5 and 2.0');
    });
  });

  describe('validateEmergencyContact', () => {
    it('should return no errors for valid contact', () => {
      const validContact: Partial<EmergencyContact> = {
        name: 'John Doe',
        phoneNumber: '+1-555-123-4567'
      };
      
      const errors = validateEmergencyContact(validContact);
      expect(errors).toEqual([]);
    });

    it('should return error for empty name', () => {
      const invalidContact: Partial<EmergencyContact> = {
        name: '   '
      };
      
      const errors = validateEmergencyContact(invalidContact);
      expect(errors).toContain('Contact name cannot be empty');
    });

    it('should return error for invalid phone number', () => {
      const invalidContact: Partial<EmergencyContact> = {
        phoneNumber: 'invalid-phone'
      };
      
      const errors = validateEmergencyContact(invalidContact);
      expect(errors).toContain('Invalid phone number format');
    });

    it('should accept various phone number formats', () => {
      const validFormats = [
        '+1-555-123-4567',
        '(555) 123-4567',
        '555 123 4567',
        '5551234567',
        '+15551234567'
      ];
      
      validFormats.forEach(phoneNumber => {
        const contact: Partial<EmergencyContact> = {
          name: 'Test',
          phoneNumber
        };
        
        const errors = validateEmergencyContact(contact);
        expect(errors).toEqual([]);
      });
    });
  });
});

describe('Data Conversion Functions', () => {
  describe('convertRowToRunData', () => {
    it('should convert database row to RunData object', () => {
      const row: RunDataRow = {
        id: 1,
        start_time: '2023-01-01T10:00:00.000Z',
        end_time: '2023-01-01T11:00:00.000Z',
        total_distance: 5000,
        total_duration: 3600,
        average_pace: 6.0,
        status: 'completed',
        created_at: '2023-01-01T10:00:00.000Z',
        updated_at: '2023-01-01T11:00:00.000Z'
      };
      
      const runData = convertRowToRunData(row);
      
      expect(runData.id).toBe(1);
      expect(runData.startTime).toEqual(new Date('2023-01-01T10:00:00.000Z'));
      expect(runData.endTime).toEqual(new Date('2023-01-01T11:00:00.000Z'));
      expect(runData.totalDistance).toBe(5000);
      expect(runData.totalDuration).toBe(3600);
      expect(runData.averagePace).toBe(6.0);
      expect(runData.status).toBe('completed');
      expect(runData.splits).toEqual([]);
      expect(runData.trackPoints).toEqual([]);
    });

    it('should handle null end_time', () => {
      const row: RunDataRow = {
        id: 1,
        start_time: '2023-01-01T10:00:00.000Z',
        total_distance: 0,
        total_duration: 0,
        average_pace: 0,
        status: 'active',
        created_at: '2023-01-01T10:00:00.000Z',
        updated_at: '2023-01-01T10:00:00.000Z'
      };
      
      const runData = convertRowToRunData(row);
      
      expect(runData.endTime).toBeUndefined();
    });
  });

  describe('convertRowToSplit', () => {
    it('should convert database row to Split object', () => {
      const row: SplitRow = {
        id: 1,
        run_id: 1,
        split_number: 1,
        distance: 1000,
        duration: 300,
        pace: 5.0,
        timestamp: '2023-01-01T10:05:00.000Z'
      };
      
      const split = convertRowToSplit(row);
      
      expect(split.id).toBe(1);
      expect(split.runId).toBe(1);
      expect(split.splitNumber).toBe(1);
      expect(split.distance).toBe(1000);
      expect(split.duration).toBe(300);
      expect(split.pace).toBe(5.0);
      expect(split.timestamp).toEqual(new Date('2023-01-01T10:05:00.000Z'));
    });
  });

  describe('convertRowToTrackPoint', () => {
    it('should convert database row to TrackPoint object', () => {
      const row: TrackPointRow = {
        id: 1,
        run_id: 1,
        latitude: 40.7128,
        longitude: -74.0060,
        altitude: 10.5,
        accuracy: 5.0,
        speed: 3.5,
        timestamp: '2023-01-01T10:00:30.000Z'
      };
      
      const trackPoint = convertRowToTrackPoint(row);
      
      expect(trackPoint.id).toBe(1);
      expect(trackPoint.runId).toBe(1);
      expect(trackPoint.latitude).toBe(40.7128);
      expect(trackPoint.longitude).toBe(-74.0060);
      expect(trackPoint.altitude).toBe(10.5);
      expect(trackPoint.accuracy).toBe(5.0);
      expect(trackPoint.speed).toBe(3.5);
      expect(trackPoint.timestamp).toEqual(new Date('2023-01-01T10:00:30.000Z'));
    });
  });

  describe('convertRowToAppSettings', () => {
    it('should convert database row to AppSettings object', () => {
      const row: AppSettingsRow = {
        id: 1,
        announcement_frequency_minutes: 5,
        announcement_frequency_distance: 1000,
        haptic_distance_enabled: 1,
        haptic_time_enabled: 0,
        voice_rate: 1.0,
        voice_pitch: 1.0,
        auto_pause_enabled: 1,
        created_at: '2023-01-01T10:00:00.000Z',
        updated_at: '2023-01-01T10:00:00.000Z'
      };
      
      const settings = convertRowToAppSettings(row);
      
      expect(settings.id).toBe(1);
      expect(settings.announcementFrequencyMinutes).toBe(5);
      expect(settings.announcementFrequencyDistance).toBe(1000);
      expect(settings.hapticDistanceEnabled).toBe(true);
      expect(settings.hapticTimeEnabled).toBe(false);
      expect(settings.voiceRate).toBe(1.0);
      expect(settings.voicePitch).toBe(1.0);
      expect(settings.autoPauseEnabled).toBe(true);
    });
  });

  describe('convertRowToEmergencyContact', () => {
    it('should convert database row to EmergencyContact object', () => {
      const row: EmergencyContactRow = {
        id: 1,
        name: 'John Doe',
        phone_number: '+1-555-123-4567',
        is_primary: 1,
        created_at: '2023-01-01T10:00:00.000Z'
      };
      
      const contact = convertRowToEmergencyContact(row);
      
      expect(contact.id).toBe(1);
      expect(contact.name).toBe('John Doe');
      expect(contact.phoneNumber).toBe('+1-555-123-4567');
      expect(contact.isPrimary).toBe(true);
      expect(contact.createdAt).toEqual(new Date('2023-01-01T10:00:00.000Z'));
    });
  });
});