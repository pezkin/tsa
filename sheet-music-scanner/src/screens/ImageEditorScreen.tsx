import React, { useState } from 'react';
import {
  View,
  SafeAreaView,
  StyleSheet,
  Image,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import Slider from '@react-native-community/slider';
import { MaterialIcons } from '@expo/vector-icons';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import { COLORS, SPACING, TYPOGRAPHY, BORDER_RADIUS, FILE_PATHS } from '@utils/constants';
import { generateId } from '@utils/helpers';
import { StorageService } from '@services/storage';
import { ScannedItem } from '@utils/types';

interface ImageEditorScreenProps {
  route: any;
  navigation: any;
}

const ImageEditorScreen: React.FC<ImageEditorScreenProps> = ({ route, navigation }) => {
  const { imageUri } = route.params;
  const [brightness, setBrightness] = useState(0);
  const [contrast, setContrast] = useState(0);
  const [rotation, setRotation] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processedUri, setProcessedUri] = useState(imageUri);

  const applyEffects = async () => {
    try {
      setIsProcessing(true);

      let result = await ImageManipulator.manipulateAsync(
        imageUri,
        [
          {
            rotate: rotation,
          },
        ],
        { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG }
      );

      setProcessedUri(result.uri);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.error('Error applying effects:', error);
      Alert.alert('Error', 'Failed to apply effects');
    } finally {
      setIsProcessing(false);
    }
  };

  const saveImage = async () => {
    try {
      setIsProcessing(true);

      // Verify the source image exists
      const sourceInfo = await FileSystem.getInfoAsync(processedUri);
      if (!sourceInfo.exists) {
        throw new Error('Source image file not found');
      }

      // Create directory if it doesn't exist
      const scansDir = `${FileSystem.documentDirectory}${FILE_PATHS.SCANS}`;
      const dirInfo = await FileSystem.getInfoAsync(scansDir);

      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(scansDir, { intermediates: true });
      }

      // Save image
      const filename = `scan_${generateId()}.jpg`;
      const filepath = `${scansDir}${filename}`;

      await FileSystem.copyAsync({
        from: processedUri,
        to: filepath,
      });

      // Verify the file was saved
      const savedFileInfo = await FileSystem.getInfoAsync(filepath);
      if (!savedFileInfo.exists) {
        throw new Error('Failed to save image file');
      }

      // Create thumbnail
      const thumbnail = await ImageManipulator.manipulateAsync(
        filepath,
        [{ resize: { width: 150, height: 200 } }],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
      );

      const thumbnailsDir = `${FileSystem.documentDirectory}${FILE_PATHS.THUMBNAILS}`;
      const thumbDirInfo = await FileSystem.getInfoAsync(thumbnailsDir);

      if (!thumbDirInfo.exists) {
        await FileSystem.makeDirectoryAsync(thumbnailsDir, { intermediates: true });
      }

      const thumbnailPath = `${thumbnailsDir}thumb_${filename}`;

      await FileSystem.copyAsync({
        from: thumbnail.uri,
        to: thumbnailPath,
      });

      // Verify thumbnail was saved
      const thumbFileInfo = await FileSystem.getInfoAsync(thumbnailPath);
      if (!thumbFileInfo.exists) {
        throw new Error('Failed to save thumbnail file');
      }

      // Create scanned item object
      const itemId = generateId();
      const scannedItem: ScannedItem = {
        id: itemId,
        filename: filename,
        imagePath: filepath,
        thumbnail: thumbnailPath,
        dateScanned: Date.now(),
        notes: '',
        playCount: 0,
        processingTime: 0,
      };

      // Add item to storage
      await StorageService.addScannedItem(scannedItem);

      // Navigate to viewer with saved item
      navigation.navigate('Viewer', {
        itemId: itemId,
      });

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.error('Error saving image:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      Alert.alert('Error', `Failed to save image: ${errorMessage}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const rotateImage = (degrees: number) => {
    setRotation((current) => (current + degrees) % 360);
  };

  const resetEdits = () => {
    setBrightness(0);
    setContrast(0);
    setRotation(0);
    setProcessedUri(imageUri);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={28} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Image</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Image Preview */}
        <View style={styles.previewContainer}>
          <Image source={{ uri: processedUri }} style={styles.imagePreview} />
        </View>

        {/* Editing Controls */}
        <View style={styles.controlsSection}>
          <Text style={styles.sectionTitle}>Adjustments</Text>

          {/* Brightness */}
          <View style={styles.control}>
            <View style={styles.controlHeader}>
              <MaterialIcons name="brightness-4" size={24} color={COLORS.primary} />
              <Text style={styles.controlLabel}>Brightness</Text>
              <Text style={styles.controlValue}>{brightness}</Text>
            </View>
            <Slider
              style={styles.slider}
              value={brightness}
              onValueChange={setBrightness}
              minimumValue={-50}
              maximumValue={50}
              step={1}
              minimumTrackTintColor={COLORS.primary}
              maximumTrackTintColor={COLORS.border}
            />
          </View>

          {/* Contrast */}
          <View style={styles.control}>
            <View style={styles.controlHeader}>
              <MaterialIcons name="contrast" size={24} color={COLORS.primary} />
              <Text style={styles.controlLabel}>Contrast</Text>
              <Text style={styles.controlValue}>{contrast}</Text>
            </View>
            <Slider
              style={styles.slider}
              value={contrast}
              onValueChange={setContrast}
              minimumValue={-50}
              maximumValue={50}
              step={1}
              minimumTrackTintColor={COLORS.primary}
              maximumTrackTintColor={COLORS.border}
            />
          </View>

          {/* Rotation */}
          <View style={styles.control}>
            <View style={styles.controlHeader}>
              <MaterialIcons name="rotate-right" size={24} color={COLORS.primary} />
              <Text style={styles.controlLabel}>Rotation</Text>
              <Text style={styles.controlValue}>{rotation}°</Text>
            </View>
            <View style={styles.rotationButtons}>
              <TouchableOpacity
                style={styles.rotationButton}
                onPress={() => rotateImage(-90)}
              >
                <MaterialIcons name="rotate-left" size={20} color={COLORS.primary} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.rotationButton}
                onPress={() => rotateImage(90)}
              >
                <MaterialIcons name="rotate-right" size={20} color={COLORS.primary} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Convert to Grayscale */}
          <TouchableOpacity style={styles.optionButton}>
            <MaterialIcons name="color-lens" size={24} color={COLORS.primary} />
            <Text style={styles.optionButtonText}>Convert to Grayscale</Text>
          </TouchableOpacity>

          {/* Crop */}
          <TouchableOpacity style={styles.optionButton}>
            <MaterialIcons name="crop" size={24} color={COLORS.primary} />
            <Text style={styles.optionButtonText}>Crop to Music Area</Text>
          </TouchableOpacity>
        </View>

        {/* Action Buttons */}
        <View style={styles.actionButtons}>
          <TouchableOpacity
            style={[styles.actionButton, styles.secondaryAction]}
            onPress={resetEdits}
          >
            <MaterialIcons name="refresh" size={20} color={COLORS.primary} />
            <Text style={styles.secondaryActionText}>Reset</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, styles.secondaryAction]}
            onPress={applyEffects}
            disabled={isProcessing}
          >
            {isProcessing ? (
              <ActivityIndicator size="small" color={COLORS.primary} />
            ) : (
              <>
                <MaterialIcons name="check" size={20} color={COLORS.primary} />
                <Text style={styles.secondaryActionText}>Apply</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Save Button */}
        <TouchableOpacity
          style={[styles.saveButton, isProcessing && styles.saveButtonDisabled]}
          onPress={saveImage}
          disabled={isProcessing}
        >
          {isProcessing ? (
            <ActivityIndicator size="small" color="white" />
          ) : (
            <>
              <MaterialIcons name="save" size={20} color="white" />
              <Text style={styles.saveButtonText}>Save & Process</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTitle: {
    ...TYPOGRAPHY.h3,
    color: COLORS.text,
  },
  content: {
    flex: 1,
    paddingVertical: SPACING.lg,
  },
  previewContainer: {
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.xl,
  },
  imagePreview: {
    width: '100%',
    height: 300,
    borderRadius: BORDER_RADIUS.lg,
    backgroundColor: COLORS.surface,
  },
  controlsSection: {
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.xl,
    gap: SPACING.md,
  },
  sectionTitle: {
    ...TYPOGRAPHY.h3,
    color: COLORS.text,
    marginBottom: SPACING.md,
  },
  control: {
    gap: SPACING.md,
  },
  controlHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  controlLabel: {
    ...TYPOGRAPHY.body1,
    color: COLORS.text,
    flex: 1,
  },
  controlValue: {
    ...TYPOGRAPHY.body2,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  slider: {
    height: 40,
  },
  rotationButtons: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  rotationButton: {
    flex: 1,
    height: 44,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  optionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.surface,
  },
  optionButtonText: {
    ...TYPOGRAPHY.body1,
    color: COLORS.text,
  },
  actionButtons: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.lg,
    gap: SPACING.md,
  },
  actionButton: {
    flex: 1,
    height: 48,
    borderRadius: BORDER_RADIUS.md,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  secondaryAction: {
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    backgroundColor: 'transparent',
  },
  secondaryActionText: {
    ...TYPOGRAPHY.button,
    color: COLORS.primary,
  },
  saveButton: {
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.xl,
    height: 56,
    borderRadius: BORDER_RADIUS.lg,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    gap: SPACING.md,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    ...TYPOGRAPHY.button,
    color: 'white',
    fontWeight: '700',
  },
});

export default ImageEditorScreen;
