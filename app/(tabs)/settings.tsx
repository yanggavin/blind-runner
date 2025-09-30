import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  Alert,
  TextInput,
  Modal,
  FlatList,
  SafeAreaView,
} from 'react-native';
import { AccessibleButton } from '../../src/components/AccessibleButton';
import { DatabaseService } from '../../src/database/DatabaseService';
import { AppSettings, EmergencyContact, validateAppSettings, validateEmergencyContact } from '../../src/models/types';
import { TTSServiceImpl } from '../../src/services/TTSService';

interface SettingsScreenProps {}

export default function SettingsScreen({}: SettingsScreenProps) {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [emergencyContacts, setEmergencyContacts] = useState<EmergencyContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [showContactModal, setShowContactModal] = useState(false);
  const [editingContact, setEditingContact] = useState<EmergencyContact | null>(null);
  const [contactForm, setContactForm] = useState({ name: '', phoneNumber: '', isPrimary: false });

  const ttsService = new TTSServiceImpl();

  useEffect(() => {
    loadSettings();
    loadEmergencyContacts();
  }, []);

  const loadSettings = async () => {
    try {
      const db = await DatabaseService.getInstance();
      const currentSettings = await db.getSettings();
      setSettings(currentSettings);
    } catch (error) {
      console.error('Failed to load settings:', error);
      await ttsService.speak('Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const loadEmergencyContacts = async () => {
    try {
      const db = await DatabaseService.getInstance();
      const contacts = await db.getEmergencyContacts();
      setEmergencyContacts(contacts);
    } catch (error) {
      console.error('Failed to load emergency contacts:', error);
      await ttsService.speak('Failed to load emergency contacts');
    }
  };

  const updateSettings = async (newSettings: Partial<AppSettings>) => {
    if (!settings) return;

    const errors = validateAppSettings(newSettings);
    if (errors.length > 0) {
      Alert.alert('Invalid Settings', errors.join('\n'));
      await ttsService.speak(`Invalid settings: ${errors.join(', ')}`);
      return;
    }

    try {
      const db = await DatabaseService.getInstance();
      await db.updateSettings(newSettings);
      setSettings({ ...settings, ...newSettings });
      await ttsService.speak('Settings updated');
    } catch (error) {
      console.error('Failed to update settings:', error);
      Alert.alert('Error', 'Failed to update settings');
      await ttsService.speak('Failed to update settings');
    }
  };

  const handleContactSave = async () => {
    const errors = validateEmergencyContact(contactForm);
    if (errors.length > 0) {
      Alert.alert('Invalid Contact', errors.join('\n'));
      await ttsService.speak(`Invalid contact: ${errors.join(', ')}`);
      return;
    }

    if (!contactForm.name.trim() || !contactForm.phoneNumber.trim()) {
      Alert.alert('Error', 'Name and phone number are required');
      await ttsService.speak('Name and phone number are required');
      return;
    }

    try {
      const db = await DatabaseService.getInstance();
      
      if (editingContact) {
        await db.updateEmergencyContact(editingContact.id, contactForm);
        await ttsService.speak('Contact updated');
      } else {
        await db.addEmergencyContact(contactForm);
        await ttsService.speak('Contact added');
      }
      
      await loadEmergencyContacts();
      setShowContactModal(false);
      setEditingContact(null);
      setContactForm({ name: '', phoneNumber: '', isPrimary: false });
    } catch (error) {
      console.error('Failed to save contact:', error);
      Alert.alert('Error', 'Failed to save contact');
      await ttsService.speak('Failed to save contact');
    }
  };

  const handleContactDelete = async (contact: EmergencyContact) => {
    Alert.alert(
      'Delete Contact',
      `Are you sure you want to delete ${contact.name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const db = await DatabaseService.getInstance();
              await db.deleteEmergencyContact(contact.id);
              await loadEmergencyContacts();
              await ttsService.speak(`${contact.name} deleted`);
            } catch (error) {
              console.error('Failed to delete contact:', error);
              Alert.alert('Error', 'Failed to delete contact');
              await ttsService.speak('Failed to delete contact');
            }
          },
        },
      ]
    );
  };

  const openContactModal = (contact?: EmergencyContact) => {
    if (contact) {
      setEditingContact(contact);
      setContactForm({
        name: contact.name,
        phoneNumber: contact.phoneNumber,
        isPrimary: contact.isPrimary,
      });
    } else {
      setEditingContact(null);
      setContactForm({ name: '', phoneNumber: '', isPrimary: false });
    }
    setShowContactModal(true);
  };

  const testTTSSettings = async () => {
    if (!settings) return;
    await ttsService.speak('This is a test of your voice settings', { 
      rate: settings.voiceRate, 
      pitch: settings.voicePitch 
    });
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading settings...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!settings) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Failed to load settings</Text>
          <AccessibleButton
            title="Retry"
            onPress={loadSettings}
            accessibilityLabel="Retry loading settings"
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>Settings</Text>

        {/* Announcement Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Announcements</Text>
          
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Time Interval (minutes)</Text>
            <TextInput
              style={styles.numberInput}
              value={settings.announcementFrequencyMinutes.toString()}
              onChangeText={(text) => {
                const value = parseInt(text) || 1;
                updateSettings({ announcementFrequencyMinutes: Math.max(1, Math.min(60, value)) });
              }}
              keyboardType="numeric"
              accessibilityLabel="Announcement time interval in minutes"
              accessibilityHint="Enter a number between 1 and 60"
            />
          </View>

          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Distance Interval (meters)</Text>
            <TextInput
              style={styles.numberInput}
              value={settings.announcementFrequencyDistance.toString()}
              onChangeText={(text) => {
                const value = parseInt(text) || 500;
                updateSettings({ announcementFrequencyDistance: Math.max(100, Math.min(5000, value)) });
              }}
              keyboardType="numeric"
              accessibilityLabel="Announcement distance interval in meters"
              accessibilityHint="Enter a number between 100 and 5000"
            />
          </View>
        </View>

        {/* Haptic Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Haptic Feedback</Text>
          
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Distance-based Vibrations</Text>
            <Switch
              value={settings.hapticDistanceEnabled}
              onValueChange={(value) => updateSettings({ hapticDistanceEnabled: value })}
              accessibilityLabel="Toggle distance-based haptic feedback"
              accessibilityRole="switch"
            />
          </View>

          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Time-based Vibrations</Text>
            <Switch
              value={settings.hapticTimeEnabled}
              onValueChange={(value) => updateSettings({ hapticTimeEnabled: value })}
              accessibilityLabel="Toggle time-based haptic feedback"
              accessibilityRole="switch"
            />
          </View>
        </View>

        {/* Voice Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Voice Settings</Text>
          
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Speech Rate: {settings.voiceRate.toFixed(1)}</Text>
            <View style={styles.sliderContainer}>
              <AccessibleButton
                title="-"
                onPress={() => updateSettings({ voiceRate: Math.max(0.1, settings.voiceRate - 0.1) })}
                accessibilityLabel="Decrease speech rate"
                size="small"
                variant="secondary"
              />
              <Text style={styles.sliderValue}>{settings.voiceRate.toFixed(1)}</Text>
              <AccessibleButton
                title="+"
                onPress={() => updateSettings({ voiceRate: Math.min(2.0, settings.voiceRate + 0.1) })}
                accessibilityLabel="Increase speech rate"
                size="small"
                variant="secondary"
              />
            </View>
          </View>

          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Speech Pitch: {settings.voicePitch.toFixed(1)}</Text>
            <View style={styles.sliderContainer}>
              <AccessibleButton
                title="-"
                onPress={() => updateSettings({ voicePitch: Math.max(0.5, settings.voicePitch - 0.1) })}
                accessibilityLabel="Decrease speech pitch"
                size="small"
                variant="secondary"
              />
              <Text style={styles.sliderValue}>{settings.voicePitch.toFixed(1)}</Text>
              <AccessibleButton
                title="+"
                onPress={() => updateSettings({ voicePitch: Math.min(2.0, settings.voicePitch + 0.1) })}
                accessibilityLabel="Increase speech pitch"
                size="small"
                variant="secondary"
              />
            </View>
          </View>

          <AccessibleButton
            title="Test Voice Settings"
            onPress={testTTSSettings}
            accessibilityLabel="Test current voice settings"
            variant="secondary"
            style={styles.testButton}
          />
        </View>

        {/* Auto-pause Setting */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Run Tracking</Text>
          
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Auto-pause when stopped</Text>
            <Switch
              value={settings.autoPauseEnabled}
              onValueChange={(value) => updateSettings({ autoPauseEnabled: value })}
              accessibilityLabel="Toggle auto-pause when stopped"
              accessibilityRole="switch"
            />
          </View>
        </View>

        {/* Emergency Contacts */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Emergency Contacts</Text>
          
          <AccessibleButton
            title="Add Emergency Contact"
            onPress={() => openContactModal()}
            accessibilityLabel="Add new emergency contact"
            variant="secondary"
            style={styles.addContactButton}
          />

          {emergencyContacts.map((contact) => (
            <View key={contact.id} style={styles.contactItem}>
              <View style={styles.contactInfo}>
                <Text style={styles.contactName}>
                  {contact.name} {contact.isPrimary && '(Primary)'}
                </Text>
                <Text style={styles.contactPhone}>{contact.phoneNumber}</Text>
              </View>
              <View style={styles.contactActions}>
                <AccessibleButton
                  title="Edit"
                  onPress={() => openContactModal(contact)}
                  accessibilityLabel={`Edit contact ${contact.name}`}
                  size="small"
                  variant="secondary"
                />
                <AccessibleButton
                  title="Delete"
                  onPress={() => handleContactDelete(contact)}
                  accessibilityLabel={`Delete contact ${contact.name}`}
                  size="small"
                  variant="secondary"
                  style={styles.deleteButton}
                />
              </View>
            </View>
          ))}

          {emergencyContacts.length === 0 && (
            <Text style={styles.noContactsText}>
              No emergency contacts configured. Add at least one contact for SOS functionality.
            </Text>
          )}
        </View>
      </ScrollView>

      {/* Contact Modal */}
      <Modal
        visible={showContactModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowContactModal(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {editingContact ? 'Edit Contact' : 'Add Contact'}
            </Text>
            <AccessibleButton
              title="Cancel"
              onPress={() => setShowContactModal(false)}
              accessibilityLabel="Cancel contact editing"
              variant="secondary"
              size="small"
            />
          </View>

          <View style={styles.modalContent}>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Name</Text>
              <TextInput
                style={styles.textInput}
                value={contactForm.name}
                onChangeText={(text) => setContactForm({ ...contactForm, name: text })}
                placeholder="Enter contact name"
                accessibilityLabel="Contact name"
                accessibilityHint="Enter the name of the emergency contact"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Phone Number</Text>
              <TextInput
                style={styles.textInput}
                value={contactForm.phoneNumber}
                onChangeText={(text) => setContactForm({ ...contactForm, phoneNumber: text })}
                placeholder="Enter phone number"
                keyboardType="phone-pad"
                accessibilityLabel="Phone number"
                accessibilityHint="Enter the phone number for the emergency contact"
              />
            </View>

            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>Primary Contact</Text>
              <Switch
                value={contactForm.isPrimary}
                onValueChange={(value) => setContactForm({ ...contactForm, isPrimary: value })}
                accessibilityLabel="Set as primary emergency contact"
                accessibilityRole="switch"
              />
            </View>

            <AccessibleButton
              title={editingContact ? 'Update Contact' : 'Add Contact'}
              onPress={handleContactSave}
              accessibilityLabel={editingContact ? 'Update emergency contact' : 'Add emergency contact'}
              style={styles.saveButton}
            />
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 18,
    color: '#ffffff',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 18,
    color: '#ff6b6b',
    marginBottom: 20,
    textAlign: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 30,
    textAlign: 'center',
  },
  section: {
    marginBottom: 30,
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 20,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 20,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    minHeight: 56,
  },
  settingLabel: {
    fontSize: 18,
    color: '#ffffff',
    flex: 1,
    marginRight: 16,
  },
  numberInput: {
    backgroundColor: '#2a2a2a',
    color: '#ffffff',
    fontSize: 18,
    padding: 12,
    borderRadius: 8,
    minWidth: 80,
    textAlign: 'center',
    borderWidth: 2,
    borderColor: '#0b95da',
  },
  sliderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  sliderValue: {
    fontSize: 18,
    color: '#ffffff',
    minWidth: 40,
    textAlign: 'center',
  },
  testButton: {
    marginTop: 16,
  },
  addContactButton: {
    marginBottom: 20,
  },
  contactItem: {
    backgroundColor: '#2a2a2a',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  contactInfo: {
    flex: 1,
  },
  contactName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 4,
  },
  contactPhone: {
    fontSize: 16,
    color: '#cccccc',
  },
  contactActions: {
    flexDirection: 'row',
    gap: 8,
  },
  deleteButton: {
    backgroundColor: '#ff6b6b',
  },
  noContactsText: {
    fontSize: 16,
    color: '#cccccc',
    textAlign: 'center',
    fontStyle: 'italic',
    marginTop: 20,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#000000',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  modalContent: {
    flex: 1,
    padding: 20,
  },
  inputGroup: {
    marginBottom: 24,
  },
  inputLabel: {
    fontSize: 18,
    color: '#ffffff',
    marginBottom: 8,
  },
  textInput: {
    backgroundColor: '#2a2a2a',
    color: '#ffffff',
    fontSize: 18,
    padding: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#0b95da',
    minHeight: 56,
  },
  saveButton: {
    marginTop: 32,
  },
});