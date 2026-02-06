import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  SafeAreaView,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
  Alert,
  Image,
  Text,
  Modal,
  Animated,
} from 'react-native';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { COLORS, SPACING, BORDER_RADIUS } from '@utils/constants';
import { getButtonAccessibility, getTestID } from '@utils/accessibilityUtils';
import { OMRService } from '@services/omr';
import { StorageService } from '@services/storage';

const { width } = Dimensions.get('window');

interface CameraScreenProps {
  navigation: any;
}

const CameraScreen: React.FC<CameraScreenProps> = ({ navigation }) => {
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<CameraType>('back');
  const [flashMode, setFlashMode] = useState('off');
  const [isCapturing, setIsCapturing] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanMessage, setScanMessage] = useState('');
  const [isOMRReady, setIsOMRReady] = useState(false);
  const [omrError, setOmrError] = useState<string | null>(null);
  const cameraRef = useRef<CameraView>(null);
  const progressAnim = useRef(new Animated.Value(0)).current;

  // Initialize OMR Service on component mount
  useEffect(() => {
    navigation.setOptions({
      headerShown: false,
    });

    if (!permission?.granted) {
      requestPermission();
    }

    // Initialize OMRService once
    const initializeOMR = async () => {
      try {
        setScanMessage('Loading ML models...');
        await OMRService.initialize((message: string) => {
          setScanMessage(message);
        });
        setIsOMRReady(true);
        setScanMessage('');
        console.log('✅ OMR Service initialized');
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Failed to initialize OMR';
        console.error('❌ OMR initialization error:', error);
        setOmrError(errorMsg);
        setIsOMRReady(false);
      }
    };

    initializeOMR();

    // Cleanup
    return () => {
      // Note: Don't close OMR service here as we want to keep models loaded
    };
  }, [navigation, permission]);



  const toggleCameraFacing = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setFacing((current) => (current === 'back' ? 'front' : 'back'));
  };

  const toggleFlash = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setFlashMode((current) => (current === 'off' ? 'on' : 'off'));
  };

  const takePicture = async () => {
    if (!cameraRef.current || isCapturing) return;

    try {
      setIsCapturing(true);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      const photo = await cameraRef.current.takePictureAsync({
        quality: 1.0,
        base64: false,
      });

      setPreviewImage(photo.uri);
    } catch (error) {
      console.error('Error taking picture:', error);
      Alert.alert('Error', 'Failed to capture image. Please try again.');
    } finally {
      setIsCapturing(false);
    }
  };

  const handleUsePhoto = async () => {
    if (!previewImage) return;

    if (!isOMRReady) {
      Alert.alert(
        'Model Loading',
        omrError ? `Error: ${omrError}` : 'ML models are still loading. Please wait.',
        [{ text: 'OK' }]
      );
      return;
    }

    try {
      setIsScanning(true);
      setScanProgress(0);
      setScanMessage('Initializing scan...');

      // Run OMR scanning with progress callback
      const result = await OMRService.scanSheetMusic(previewImage, {
        onProgress: (message: string, progress: number) => {
          setScanMessage(message);
          setScanProgress(progress);

          // Animate progress bar
          Animated.timing(progressAnim, {
            toValue: progress,
            duration: 300,
            useNativeDriver: false,
          }).start();
        },
        returnDetails: true,
      });

      if (result.success && result.musicData) {
        // Success! Save to storage and navigate to viewer
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        
        // Save to storage
        const scanData = {
          id: Date.now().toString(),
          filename: `scan_${Date.now()}.jpg`,
          imagePath: previewImage,
          thumbnail: previewImage,
          musicData: result.musicData,
          confidence: result.confidence || 0,
          dateScanned: Date.now(),
          processingTime: result.processingTime || 0,
          playCount: 0,
          notes: '',
        };
        
        await StorageService.addScannedItem(scanData);
        navigation.navigate('Viewer', { itemId: scanData.id });
      } else {
        // Retry option for failed scans
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        Alert.alert(
          'Scan Failed',
          result.error || 'Could not recognize sheet music. Please try again with a clearer image.',
          [
            { text: 'Retake', onPress: handleRetake },
            { text: 'Try Another', onPress: () => setPreviewImage(null) },
          ]
        );
      }
    } catch (error) {
      console.error('OMR scanning error:', error);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      
      Alert.alert(
        'Scanning Error',
        error instanceof Error ? error.message : 'An error occurred during scanning',
        [
          { text: 'Retake', onPress: handleRetake },
          { text: 'Cancel', onPress: () => setPreviewImage(null) },
        ]
      );
    } finally {
      setIsScanning(false);
      setScanProgress(0);
      setScanMessage('');
    }
  };

  const handleRetake = () => {
    setPreviewImage(null);
  };

  if (!permission) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.permissionContainer}>
          <MaterialIcons name="camera" size={64} color={COLORS.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.permissionContainer}>
          <MaterialIcons name="lock" size={64} color={COLORS.error} />
        </View>
      </SafeAreaView>
    );
  }

  if (previewImage) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.previewContainer}>
          <Image source={{ uri: previewImage }} style={styles.previewImage} />

          {/* Offline Indicator Badge */}
          <View style={styles.offlineBadge}>
            <MaterialCommunityIcons name="wifi-off" size={14} color={COLORS.success} />
            <Text style={styles.offlineText}>Offline Recognition</Text>
          </View>

          {/* Preview Controls */}
          <View style={styles.previewControls}>
            <TouchableOpacity
              style={[styles.controlButton, styles.retakeButton]}
              onPress={handleRetake}
              disabled={isScanning}
            >
              <MaterialIcons name="refresh" size={24} color="white" />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.controlButton, styles.useButton]}
              onPress={handleUsePhoto}
              disabled={isScanning || !isOMRReady}
            >
              {isScanning ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <MaterialIcons name="check" size={24} color="white" />
              )}
            </TouchableOpacity>
          </View>

          {/* Close Button */}
          <TouchableOpacity
            style={styles.closeButton}
            onPress={() => navigation.goBack()}
            disabled={isScanning}
            testID={getTestID('camera', 'close-button')}
            {...getButtonAccessibility('Close camera and return to home')}
          >
            <MaterialIcons name="close" size={28} color="white" />
          </TouchableOpacity>
        </View>

        {/* Scanning Progress Overlay */}
        <Modal visible={isScanning} transparent={true} animationType="fade">
          <View style={styles.scanningOverlay}>
            {/* Semi-transparent background */}
            <View style={styles.scanningBackground} />

            {/* Progress Card */}
            <View style={styles.scanningCard}>
              {/* Header */}
              <View style={styles.scanningHeader}>
                <Text style={styles.scanningTitle}>Recognizing Sheet Music</Text>
              </View>

              {/* Image Preview */}
              <Image 
                source={{ uri: previewImage }}
                style={styles.scanningImagePreview}
              />

              {/* Progress Bar */}
              <View style={styles.progressBarContainer}>
                <Animated.View
                  style={[
                    styles.progressBar,
                    {
                      width: progressAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: ['0%', '100%'],
                      }),
                    },
                  ]}
                />
              </View>

              {/* Progress Text */}
              <Text style={styles.progressText}>
                {Math.round(scanProgress * 100)}%
              </Text>

              {/* Status Message */}
              <Text style={styles.scanningMessage}>{scanMessage}</Text>

              {/* Offline Indicator */}
              <View style={styles.processingOfflineBadge}>
                <MaterialCommunityIcons 
                  name="check-circle" 
                  size={16} 
                  color={COLORS.success} 
                />
                <Text style={styles.processingOfflineText}>
                  Processing offline - No internet needed
                </Text>
              </View>

              {/* Loading Animation */}
              <View style={styles.loadingDotsContainer}>
                <View style={[styles.loadingDot, { opacity: scanProgress > 0.3 ? 1 : 0.3 }]} />
                <View style={[styles.loadingDot, { opacity: scanProgress > 0.6 ? 1 : 0.3 }]} />
                <View style={[styles.loadingDot, { opacity: scanProgress > 0.9 ? 1 : 0.3 }]} />
              </View>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing={facing}
        enableTorch={flashMode === 'on'}
      >
        {/* Grid Overlay */}
        <View style={styles.gridOverlay}>
          <View style={styles.gridLine} />
          <View style={[styles.gridLine, styles.gridLineCenter]} />
          <View style={styles.gridLine} />
        </View>

        {/* Top Controls */}
        <View style={styles.topControls}>
          <TouchableOpacity
            style={styles.controlButton}
            onPress={() => navigation.goBack()}
          >
            <MaterialIcons name="close" size={28} color="white" />
          </TouchableOpacity>

          <View style={styles.spacer} />

          <TouchableOpacity
            style={styles.controlButton}
            onPress={toggleFlash}
          >
            <MaterialIcons
              name={flashMode === 'on' ? 'flash-on' : 'flash-off'}
              size={28}
              color="white"
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.controlButton}
            onPress={toggleCameraFacing}
          >
            <MaterialIcons name="flip-camera-android" size={28} color="white" />
          </TouchableOpacity>
        </View>

        {/* Bottom Controls */}
        <View style={styles.bottomControls}>
          {/* Gallery Thumbnail */}
          <View style={styles.galleryPlaceholder}>
            <MaterialIcons name="image" size={24} color={COLORS.primary} />
          </View>

          {/* Capture Button */}
          <TouchableOpacity
            style={styles.captureButton}
            onPress={takePicture}
            disabled={isCapturing}
            activeOpacity={0.8}
          >
            {isCapturing ? (
              <ActivityIndicator size="large" color={COLORS.primary} />
            ) : (
              <View style={styles.captureButtonInner} />
            )}
          </TouchableOpacity>

          <View style={styles.galleryPlaceholder} />
        </View>
      </CameraView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.text,
  },
  camera: {
    flex: 1,
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gridOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-around',
    paddingHorizontal: width * 0.15,
  },
  gridLine: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  gridLineCenter: {
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
  },
  topControls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.md,
  },
  spacer: {
    flex: 1,
  },
  controlButton: {
    width: 48,
    height: 48,
    borderRadius: BORDER_RADIUS.round,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bottomControls: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.xl,
    paddingTop: SPACING.lg,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  galleryPlaceholder: {
    width: 50,
    height: 50,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureButton: {
    width: 80,
    height: 80,
    borderRadius: BORDER_RADIUS.round,
    backgroundColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  captureButtonInner: {
    width: 70,
    height: 70,
    borderRadius: BORDER_RADIUS.round,
    backgroundColor: COLORS.primary,
  },
  previewContainer: {
    flex: 1,
    backgroundColor: COLORS.text,
  },
  previewImage: {
    flex: 1,
    width: '100%',
  },
  previewControls: {
    position: 'absolute',
    bottom: SPACING.xl,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: SPACING.xl,
  },
  retakeButton: {
    backgroundColor: COLORS.error,
  },
  useButton: {
    backgroundColor: COLORS.success,
  },
  closeButton: {
    position: 'absolute',
    top: SPACING.lg,
    left: SPACING.lg,
    width: 48,
    height: 48,
    borderRadius: BORDER_RADIUS.round,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  offlineBadge: {
    position: 'absolute',
    top: SPACING.lg,
    right: SPACING.lg,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(76, 175, 80, 0.9)',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    gap: SPACING.sm,
  },
  offlineText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
  // Scanning overlay styles
  scanningOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  scanningBackground: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  scanningCard: {
    backgroundColor: 'white',
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    width: '85%',
    maxWidth: 400,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 15,
  },
  scanningHeader: {
    marginBottom: SPACING.lg,
  },
  scanningTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
  },
  scanningImagePreview: {
    width: '100%',
    height: 150,
    borderRadius: BORDER_RADIUS.md,
    marginBottom: SPACING.lg,
    backgroundColor: COLORS.background,
  },
  progressBarContainer: {
    width: '100%',
    height: 8,
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.round,
    overflow: 'hidden',
    marginBottom: SPACING.md,
  },
  progressBar: {
    height: '100%',
    backgroundColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.round,
  },
  progressText: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.primary,
    marginBottom: SPACING.md,
  },
  scanningMessage: {
    fontSize: 14,
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: SPACING.md,
    fontWeight: '500',
    minHeight: 20,
  },
  processingOfflineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(76, 175, 80, 0.1)',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    marginBottom: SPACING.md,
    gap: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.success,
  },
  processingOfflineText: {
    fontSize: 12,
    color: COLORS.success,
    fontWeight: '600',
  },
  loadingDotsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: SPACING.sm,
    height: 20,
  },
  loadingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
  },
});

export default CameraScreen;
