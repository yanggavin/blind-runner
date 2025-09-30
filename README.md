# Blind Runner App 🏃‍♀️👁️

A voice-first, accessibility-focused running app designed specifically for blind and visually impaired runners. Built with React Native and Expo, featuring comprehensive audio feedback, haptic guidance, and emergency safety features.

## 🌟 Features

### 🎯 **Voice-First Design**
- Complete app navigation using voice announcements
- Real-time audio feedback for all running metrics
- Screen reader compatibility (VoiceOver/TalkBack)
- Customizable speech rate and voice settings

### 🏃‍♀️ **Smart Run Tracking**
- GPS-based distance and pace tracking
- Auto-pause detection when stopped
- Kilometer milestone announcements
- Split time tracking and analysis
- Background tracking when app is minimized

### 🔊 **Audio Announcements**
- Configurable announcement frequency (time/distance based)
- Current pace, distance, and duration updates
- Split times and average pace calculations
- Battery level and GPS signal status

### 📳 **Haptic Feedback**
- Distinct vibration patterns for different milestones
- Half-kilometer and full-kilometer notifications
- Run start, pause, resume, and completion feedback
- Emergency SOS confirmation patterns

### 🆘 **Emergency Safety Features**
- Hardware button SOS activation
- Automatic location sharing with emergency contacts
- SMS emergency messaging with run status
- Offline SOS message queuing

### 📊 **Run History & Analytics**
- Comprehensive run data storage
- Historical performance tracking
- Export capabilities for data analysis
- Offline-first data management

### ⚙️ **Accessibility & Customization**
- Full screen reader support
- High contrast visual elements
- Customizable audio and haptic settings
- Voice rate and pitch adjustments
- Announcement frequency controls

## 🏗️ Architecture

### 📱 **Tech Stack**
- **Framework**: React Native with Expo
- **Navigation**: Expo Router (file-based routing)
- **Database**: SQLite with Expo SQLite
- **Location**: Expo Location with background tracking
- **Audio**: Expo Speech for TTS announcements
- **Haptics**: Expo Haptics for tactile feedback
- **Testing**: Jest with comprehensive test coverage

### 🔧 **Service Architecture**
```
ServiceIntegrationManager
├── LocationService (GPS tracking)
├── TTSService (Text-to-speech)
├── HapticService (Vibration patterns)
├── RunTrackingService (Run logic)
├── SOSService (Emergency features)
├── DatabaseService (Data persistence)
├── ErrorHandlingService (Error management)
├── PerformanceService (Battery optimization)
├── BackgroundTaskManager (Background processing)
└── OfflineDataService (Offline capabilities)
```

### 📂 **Project Structure**
```
blind-runner-app/
├── app/                          # Expo Router pages
│   ├── (tabs)/                   # Tab navigation
│   │   ├── index.tsx            # Home screen
│   │   ├── history.tsx          # Run history
│   │   └── settings.tsx         # App settings
│   ├── run/                     # Run-specific screens
│   │   └── active.tsx           # Active run screen
│   └── _layout.tsx              # Root layout
├── src/
│   ├── components/              # Reusable UI components
│   │   ├── AccessibleButton.tsx
│   │   ├── MetricsDisplay.tsx
│   │   └── RunControls.tsx
│   ├── services/                # Business logic services
│   │   ├── LocationService.ts
│   │   ├── TTSService.ts
│   │   ├── HapticService.ts
│   │   ├── RunTrackingService.ts
│   │   ├── SOSService.ts
│   │   └── ServiceIntegrationManager.ts
│   ├── database/                # Data layer
│   │   ├── DatabaseService.ts
│   │   ├── schema.ts
│   │   └── index.ts
│   ├── models/                  # TypeScript types
│   │   └── types.ts
│   └── __tests__/               # Test suites
│       ├── integration/         # Integration tests
│       ├── e2e/                # End-to-end tests
│       └── accessibility/       # Accessibility tests
└── .kiro/specs/                 # Design specifications
```

## 🚀 Getting Started

### 📋 **Prerequisites**
- Node.js 18+ 
- npm or yarn
- Expo CLI (`npm install -g @expo/cli`)
- iOS Simulator (for iOS development)
- Android Studio/Emulator (for Android development)

### 🔧 **Installation**

1. **Clone the repository**
   ```bash
   git clone https://github.com/yanggavin/blind-runner.git
   cd blind-runner/blind-runner-app
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the development server**
   ```bash
   npm start
   ```

4. **Run on device/simulator**
   ```bash
   # iOS
   npm run ios
   
   # Android
   npm run android
   ```

### 🧪 **Testing**

```bash
# Run all tests
npm test

# Run integration tests
npm test -- --testPathPatterns="integration"

# Run accessibility tests  
npm test -- --testPathPatterns="accessibility"

# Run with coverage
npm run test:coverage
```

## 📱 **Usage Guide**

### 🏃‍♀️ **Starting a Run**
1. Open the app and navigate to the Home tab
2. Tap "Start Run" button or use voice command
3. Grant location permissions when prompted
4. Listen for "Run started" confirmation
5. Begin running - audio announcements will guide you

### 🔊 **During Your Run**
- **Audio Updates**: Receive periodic distance, time, and pace announcements
- **Milestone Feedback**: Feel haptic vibrations at 500m and 1km intervals
- **Pause/Resume**: Double-tap screen or use hardware buttons
- **Emergency**: Long-press volume buttons to trigger SOS

### 📊 **After Your Run**
1. Tap "Stop Run" when finished
2. Listen to run summary announcement
3. View detailed metrics in Run History
4. Export data if needed

### ⚙️ **Customizing Settings**
- **Voice Settings**: Adjust speech rate and pitch
- **Announcements**: Configure frequency and content
- **Haptics**: Enable/disable vibration patterns
- **Emergency**: Set up emergency contacts

## 🛡️ **Accessibility Features**

### 🎯 **Voice-First Design**
- Every action has audio feedback
- Complete navigation without visual interface
- Descriptive button labels and hints
- Status announcements for all operations

### 📱 **Screen Reader Support**
- Full VoiceOver (iOS) compatibility
- Complete TalkBack (Android) support
- Proper accessibility labels and roles
- Logical navigation order

### 🔧 **Customization Options**
- Adjustable speech rate (0.5x - 2.0x)
- Voice pitch control
- Announcement frequency settings
- Haptic feedback intensity

### 🆘 **Emergency Accessibility**
- Hardware button SOS activation
- Voice confirmation of emergency actions
- Clear error messages and recovery guidance
- Offline emergency functionality

## 🔒 **Privacy & Security**

### 📍 **Location Data**
- GPS data stored locally on device
- No cloud storage of location information
- User controls data export and sharing
- Automatic data cleanup options

### 📞 **Emergency Contacts**
- Contacts stored securely on device
- Encrypted emergency contact database
- User-controlled contact management
- No third-party contact sharing

### 📊 **Run Data**
- All run history stored locally
- Optional data export in standard formats
- No automatic cloud synchronization
- User-controlled data retention

## 🤝 **Contributing**

We welcome contributions from the community! Please see our [Contributing Guidelines](CONTRIBUTING.md) for details.

### 🐛 **Bug Reports**
- Use GitHub Issues for bug reports
- Include device information and steps to reproduce
- Test with screen reader enabled if accessibility-related

### 💡 **Feature Requests**
- Discuss new features in GitHub Discussions
- Consider accessibility impact in proposals
- Provide use cases and user stories

### 🧪 **Testing**
- All PRs must include tests
- Accessibility features require accessibility tests
- Integration tests for service interactions

## 📄 **License**

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 **Acknowledgments**

- **Accessibility Community**: For feedback and testing
- **Expo Team**: For excellent React Native tooling
- **Open Source Contributors**: For libraries and inspiration
- **Beta Testers**: Blind and visually impaired runners who provided invaluable feedback

## 📞 **Support**

- **Documentation**: [Wiki](https://github.com/yanggavin/blind-runner/wiki)
- **Issues**: [GitHub Issues](https://github.com/yanggavin/blind-runner/issues)
- **Discussions**: [GitHub Discussions](https://github.com/yanggavin/blind-runner/discussions)
- **Email**: support@blindrunner.app

## 🗺️ **Roadmap**

### 🔄 **Version 1.1** (Next Release)
- [ ] Apple Watch companion app
- [ ] Advanced training plans
- [ ] Social features for running groups
- [ ] Integration with popular fitness platforms

### 🚀 **Version 2.0** (Future)
- [ ] AI-powered running coach
- [ ] Advanced route planning
- [ ] Community challenges
- [ ] Multi-language support

---

**Made with ❤️ for the blind and visually impaired running community**

*"Every step counts, every voice matters, every runner deserves to feel the freedom of the road."*