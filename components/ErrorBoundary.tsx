import { Component, ReactNode } from 'react';
import { View, Text, Pressable, StyleSheet, useColorScheme } from 'react-native';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: { componentStack?: string }) {
    console.warn('[ErrorBoundary] Caught:', error.message, errorInfo?.componentStack);
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return <ErrorFallback error={this.state.error} onReload={this.handleReload} />;
    }
    return this.props.children;
  }
}

function ErrorFallback({ error, onReload }: { error: Error | null; onReload: () => void }) {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';

  return (
    <View style={[styles.container, { backgroundColor: isDark ? '#0f172a' : '#f8fafc' }]}>
      <Text style={styles.emoji}>⚠️</Text>
      <Text style={[styles.title, { color: isDark ? '#fff' : '#0f172a' }]}>
        Something went wrong
      </Text>
      <Text style={[styles.message, { color: isDark ? '#94a3b8' : '#64748b' }]} numberOfLines={3}>
        {error?.message || 'An unexpected error occurred.'}
      </Text>
      <Pressable
        onPress={onReload}
        style={({ pressed }) => ({
          backgroundColor: '#3B82F6',
          borderRadius: 16,
          paddingHorizontal: 28,
          paddingVertical: 14,
          opacity: pressed ? 0.85 : 1,
          transform: [{ scale: pressed ? 0.97 : 1 }],
          marginTop: 20,
        })}
      >
        <Text style={styles.reloadText}>Reload</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  emoji: {
    fontSize: 56,
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 8,
    textAlign: 'center',
  },
  message: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 4,
    maxWidth: 320,
  },
  reloadText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 16,
  },
});
