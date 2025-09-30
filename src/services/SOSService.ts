import * as SMS from 'expo-sms';
import * as SecureStore from 'expo-secure-store';
import { DatabaseService } from '../database/DatabaseService';
import { EmergencyContact } from '../models/types';
import { LocationService } from './LocationService';
import { TTSService } from './TTSService';
import { Priority } from './interfaces';

export interface SOSServiceInterface {
  activateSOS(): Promise<void>;
  configureSOS(contacts: EmergencyContact[]): Promise<void>;
  testSOS(): Promise<void>;
  isSOSConfigured(): Promise<boolean>;
  getEmergencyContacts(): Promise<EmergencyContact[]>;
  addEmergencyContact(contact: Omit<EmergencyContact, 'id' | 'createdAt'>): Promise<EmergencyContact>;
  updateEmergencyContact(id: number, contact: Partial<EmergencyContact>): Promise<void>;
  deleteEmergencyContact(id: number): Promise<void>;
}

export class SOSService implements SOSServiceInterface {
  private databaseService: DatabaseService;
  private locationService: LocationService;
  private ttsService: TTSService;
  private isTestMode: boolean = false;

  constructor(
    databaseService: DatabaseService,
    locationService: LocationService,
    ttsService: TTSService
  ) {
    this.databaseService = databaseService;
    this.locationService = locationService;
    this.ttsService = ttsService;
  }

  /**
   * Activates SOS functionality - sends emergency messages to all configured contacts
   */
  async activateSOS(): Promise<void> {
    try {
      // Check if SOS is configured
      const isConfigured = await this.isSOSConfigured();
      if (!isConfigured) {
        await this.ttsService.speak('SOS not configured. Please add emergency contacts in settings.', Priority.HIGH);
        throw new Error('SOS not configured - no emergency contacts found');
      }

      // Get current location
      let locationText = 'Location unavailable';
      try {
        const location = await this.locationService.getCurrentLocation();
        locationText = `https://maps.google.com/?q=${location.latitude},${location.longitude}`;
      } catch (error) {
        console.warn('Could not get current location for SOS:', error);
        locationText = 'Location unavailable - GPS signal lost';
      }

      // Get emergency contacts
      const contacts = await this.getEmergencyContacts();
      
      // Create SOS message
      const timestamp = new Date().toLocaleString();
      const message = this.isTestMode 
        ? `[TEST] Emergency SOS activated at ${timestamp}. Location: ${locationText}. This is a test message from Blind Runner App.`
        : `EMERGENCY: SOS activated at ${timestamp}. Location: ${locationText}. Sent from Blind Runner App.`;

      // Send SMS to all contacts
      const phoneNumbers = contacts.map(contact => contact.phoneNumber);
      
      if (await SMS.isAvailableAsync()) {
        const result = await SMS.sendSMSAsync(phoneNumbers, message);
        
        if (result.result === 'sent') {
          const confirmationMessage = this.isTestMode 
            ? 'Test SOS message sent to emergency contacts'
            : 'SOS message sent to emergency contacts';
          await this.ttsService.speak(confirmationMessage, Priority.HIGH);
        } else {
          throw new Error('Failed to send SOS message');
        }
      } else {
        throw new Error('SMS not available on this device');
      }

      // Log SOS activation (for debugging and audit trail)
      console.log(`SOS activated at ${timestamp}, sent to ${phoneNumbers.length} contacts`);
      
    } catch (error) {
      console.error('SOS activation failed:', error);
      await this.ttsService.speak('SOS activation failed. Please try again or contact emergency services directly.', Priority.HIGH);
      throw error;
    }
  }

  /**
   * Configures SOS with emergency contacts
   */
  async configureSOS(contacts: EmergencyContact[]): Promise<void> {
    try {
      // Validate contacts
      if (contacts.length === 0) {
        throw new Error('At least one emergency contact is required');
      }

      // Clear existing contacts and add new ones
      await this.databaseService.clearEmergencyContacts();
      
      for (const contact of contacts) {
        await this.addEmergencyContact({
          name: contact.name,
          phoneNumber: contact.phoneNumber,
          isPrimary: contact.isPrimary
        });
      }

      await this.ttsService.speak(`SOS configured with ${contacts.length} emergency contacts`, Priority.NORMAL);
    } catch (error) {
      console.error('SOS configuration failed:', error);
      throw error;
    }
  }

  /**
   * Tests SOS functionality without sending real emergency messages
   */
  async testSOS(): Promise<void> {
    try {
      this.isTestMode = true;
      await this.activateSOS();
    } finally {
      this.isTestMode = false;
    }
  }

  /**
   * Checks if SOS is properly configured
   */
  async isSOSConfigured(): Promise<boolean> {
    try {
      const contacts = await this.getEmergencyContacts();
      return contacts.length > 0;
    } catch (error) {
      console.error('Error checking SOS configuration:', error);
      return false;
    }
  }

  /**
   * Gets all emergency contacts
   */
  async getEmergencyContacts(): Promise<EmergencyContact[]> {
    return await this.databaseService.getEmergencyContacts();
  }

  /**
   * Adds a new emergency contact
   */
  async addEmergencyContact(contact: Omit<EmergencyContact, 'id' | 'createdAt'>): Promise<EmergencyContact> {
    const id = await this.databaseService.addEmergencyContact(contact);
    return {
      id,
      name: contact.name,
      phoneNumber: contact.phoneNumber,
      isPrimary: contact.isPrimary,
      createdAt: new Date()
    };
  }

  /**
   * Updates an existing emergency contact
   */
  async updateEmergencyContact(id: number, contact: Partial<EmergencyContact>): Promise<void> {
    await this.databaseService.updateEmergencyContact(id, contact);
  }

  /**
   * Deletes an emergency contact
   */
  async deleteEmergencyContact(id: number): Promise<void> {
    await this.databaseService.deleteEmergencyContact(id);
  }
}