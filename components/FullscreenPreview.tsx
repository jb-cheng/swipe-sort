import { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  ScrollView,
  Platform,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Ionicons from '@expo/vector-icons/Ionicons';
import { FileItem } from '../lib/types';
import { getFilePreview } from '../lib/api';

interface Props {
  file: FileItem;
  onClose: () => void;
}

export default function FullscreenPreview({ file, onClose }: Props) {
  const [preview, setPreview] = useState<string | null>(null);
  const [previewType, setPreviewType] = useState<'image' | 'text' | null>(null);
  const [loading, setLoading] = useState(true);
  const cancelledRef = useRef(false);

  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.9);

  useEffect(() => {
    opacity.value = withTiming(1, { duration: 200 });
    scale.value = withTiming(1, { duration: 200 });

    cancelledRef.current = false;
    getFilePreview(file.id)
      .then((result) => {
        if (cancelledRef.current) return;
        if (result) {
          if (result.startsWith('data:')) {
            setPreviewType('image');
          } else {
            setPreviewType('text');
          }
          setPreview(result);
        }
        setLoading(false);
      })
      .catch(() => {
        if (!cancelledRef.current) setLoading(false);
      });

    return () => {
      cancelledRef.current = true;
    };
  }, [file.id]);

  const handleClose = () => {
    opacity.value = withTiming(0, { duration: 150 });
    scale.value = withTiming(0.95, { duration: 150 });
    setTimeout(onClose, 160);
  };

  const tapGesture = Gesture.Tap().onEnd(() => {
    runOnJS(handleClose)();
  });

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <GestureDetector gesture={tapGesture}>
      <Animated.View style={[styles.overlay, animatedStyle]}>
        <View style={styles.header}>
          <Text style={styles.fileName} numberOfLines={1}>
            {file.name}.{file.extension}
          </Text>
          <Pressable onPress={handleClose} style={styles.closeButton}>
            <Ionicons name="close" size={24} color="#fff" />
          </Pressable>
        </View>

        <View style={styles.content}>
          {loading && (
            <ActivityIndicator size="large" color="rgba(255,255,255,0.7)" />
          )}

          {!loading && previewType === 'image' && preview && (
            <Image
              source={{ uri: preview }}
              style={styles.image}
              resizeMode="contain"
            />
          )}

          {!loading && previewType === 'text' && preview && (
            <ScrollView style={styles.textScroll} showsVerticalScrollIndicator={false}>
              <Text style={styles.textContent}>
                {preview.startsWith('META:') ? preview.replace(/^META:/, '') : preview}
              </Text>
            </ScrollView>
          )}

          {!loading && !preview && (
            <View style={styles.noPreview}>
              <Ionicons name="eye-off-outline" size={40} color="rgba(255,255,255,0.4)" />
              <Text style={styles.noPreviewText}>No preview available</Text>
            </View>
          )}
        </View>

        <Text style={styles.hint}>Tap anywhere to close</Text>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.92)',
    zIndex: 1000,
    paddingTop: Platform.OS === 'web' ? 20 : 50,
    paddingBottom: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  fileName: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
    marginRight: 12,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  image: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
  },
  textScroll: {
    flex: 1,
    width: '100%',
  },
  textContent: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 14,
    fontFamily: Platform.OS === 'web' ? 'monospace' : 'Courier',
    lineHeight: 20,
  },
  noPreview: {
    alignItems: 'center',
    gap: 12,
  },
  noPreviewText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
    fontWeight: '500',
  },
  hint: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 12,
    textAlign: 'center',
    paddingTop: 12,
  },
});
