import { Link, Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { AccessibleButton } from '../src/components/AccessibleButton';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Oops!' }} />
      <View style={styles.container}>
        <Text style={styles.title}>This screen doesn't exist.</Text>
        <Text style={styles.subtitle}>
          The page you're looking for could not be found.
        </Text>
        
        <Link href="/" asChild>
          <AccessibleButton
            title="Go to home screen"
            accessibilityLabel="Go to home screen"
            accessibilityHint="Navigate back to the main home screen"
            style={styles.button}
          />
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    backgroundColor: '#000000',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 16,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#cccccc',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 24,
  },
  button: {
    marginTop: 16,
  },
});