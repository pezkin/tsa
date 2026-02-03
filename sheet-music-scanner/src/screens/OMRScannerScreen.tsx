/**
 * OMR Scanner Screen
 * Complete music sheet scanning workflow with SATB voice separation and playback
 */

import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Alert,
  Image,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { ocrPipeline, PipelineResult, ClassifiedNote } from '../services/OCRPipeline';
import { soundFontPlayer } from '../services/SoundFontPlayer';
import { VoiceControls } from './VoiceControls';
import { midiGenerator } from '../services/MIDIGenerator';

interface ScanState {
  status: 'idle' | 'capturing' | 'processing' | 'playing' | 'error';
  message: string;
  progress: number;
}

export const OMRScannerScreen: React.FC = () => {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanState, setScanState] = useState<ScanState>({
    status: 'idle',
    message: 'Ready to scan',
    progress: 0,
  });
  const [pipelineResult, setPipelineResult] = useState<PipelineResult | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const cameraRef = useRef<CameraView>(null);

  // Initialize pipeline on mount
  useEffect(() => {
    const initializeServices = async () => {
      try {
        setScanState({ status: 'idle', message: 'Initializing services...', progress: 25 });

        // Initialize OCR pipeline
        await ocrPipeline.initialize();

        // Initialize SoundFont player
        await soundFontPlayer.initialize();

        setScanState({
          status: 'idle',
          message: 'Ready to scan music sheets',
          progress: 100,
        });
      } catch (error) {
        console.error('Error initializing services:', error);
        setScanState({
          status: 'error',
          message: `Initialization error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          progress: 0,
        });
      }
    };

    initializeServices();

    return () => {
      // Cleanup on unmount
      ocrPipeline.dispose().catch(console.error);
    };
  }, []);

  // Request camera permission
  useEffect(() => {
    if (!permission?.granted) {
      requestPermission().catch((error) => {
        console.error('Camera permission error:', error);
        setScanState({
          status: 'error',
          message: 'Camera permission denied',
          progress: 0,
        });
      });
    }
  }, [permission, requestPermission]);

  /**
   * Capture image from camera
   */
  const handleCapture = async () => {
    try {
      if (!cameraRef.current) {
        Alert.alert('Error', 'Camera not ready');
        return;
      }

      setScanState({ status: 'capturing', message: 'Capturing image...', progress: 10 });

      const photo = await cameraRef.current.takePictureAsync({ quality: 0.8 });

      if (!photo || !photo.uri) {
        throw new Error('Failed to capture image');
      }

      setCapturedImage(photo.uri);
      await processImage(photo.uri);
    } catch (error) {
      console.error('Capture error:', error);
      setScanState({
        status: 'error',
        message: `Capture failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        progress: 0,
      });
    }
  };

  /**
   * Select image from library
   */
  const handlePickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
      });

      if (!result.canceled && result.assets.length > 0) {
        const imageURI = result.assets[0].uri;
        setCapturedImage(imageURI);
        await processImage(imageURI);
      }
    } catch (error) {
      console.error('Image picker error:', error);
      setScanState({
        status: 'error',
        message: `Image selection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        progress: 0,
      });
    }
  };

  /**
   * Process image through OCR pipeline
   */
  const processImage = async (imageURI: string) => {
    try {
      setScanState({ status: 'processing', message: 'Processing image...', progress: 20 });

      // Run OCR pipeline
      const result = await ocrPipeline.processImage(imageURI);

      setPipelineResult(result);

      setScanState({
        status: 'idle',
        message: `Detected ${result.stats.notesDetected} notes. Ready to play!`,
        progress: 100,
      });

      // Auto-show success alert
      Alert.alert('Scan Complete', `Found ${result.stats.notesDetected} notes\nAverage confidence: ${(result.stats.averageConfidence * 100).toFixed(1)}%`);
    } catch (error) {
      console.error('Processing error:', error);
      setScanState({
        status: 'error',
        message: `Processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        progress: 0,
      });
    }
  };

  /**
   * Play MIDI sequence
   */
  const handlePlayAll = async () => {
    try {
      if (!pipelineResult?.midiSequence) {
        Alert.alert('No notes', 'Please scan a music sheet first');
        return;
      }

      setIsPlaying(true);
      setScanState({
        status: 'playing',
        message: 'Playing MIDI...',
        progress: 50,
      });

      await soundFontPlayer.playSequence(pipelineResult.midiSequence);

      setScanState({
        status: 'idle',
        message: 'Playback complete',
        progress: 100,
      });

      setIsPlaying(false);
    } catch (error) {
      console.error('Playback error:', error);
      setScanState({
        status: 'error',
        message: `Playback failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        progress: 0,
      });
      setIsPlaying(false);
    }
  };

  /**
   * Stop playback
   */
  const handleStop = async () => {
    try {
      await soundFontPlayer.stop();
      setIsPlaying(false);
      setScanState({
        status: 'idle',
        message: 'Stopped',
        progress: 0,
      });
    } catch (error) {
      console.error('Stop error:', error);
    }
  };

  /**
   * Play single voice
   */
  const handlePlayVoice = async (voice: string) => {
    try {
      if (!pipelineResult?.midiSequence) {
        Alert.alert('No notes', 'Please scan a music sheet first');
        return;
      }

      setIsPlaying(true);

      // Extract voice-specific MIDI events
      const voiceEvents = midiGenerator.getVoiceEvents(
        pipelineResult.midiSequence,
        voice as any
      );

      await soundFontPlayer.playSequence(voiceEvents);

      setIsPlaying(false);
    } catch (error) {
      console.error('Voice playback error:', error);
      setIsPlaying(false);
    }
  };

  if (!permission?.granted) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Camera permission required</Text>
        <TouchableOpacity style={styles.button} onPress={requestPermission}>
          <Text style={styles.buttonText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Camera View or Image Preview */}
      {capturedImage ? (
        <View style={styles.previewContainer}>
          <Image source={{ uri: capturedImage }} style={styles.previewImage} />
          <TouchableOpacity
            style={styles.clearButton}
            onPress={() => {
              setCapturedImage(null);
              setPipelineResult(null);
              setScanState({ status: 'idle', message: 'Ready to scan', progress: 0 });
            }}
          >
            <Text style={styles.clearButtonText}>Clear</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <CameraView ref={cameraRef} style={styles.camera} facing="back" />
      )}

      {/* Status Bar */}
      <View style={styles.statusBar}>
        <ActivityIndicator
          animating={scanState.status === 'processing' || scanState.status === 'capturing'}
          size="small"
          color="#fff"
          style={styles.spinner}
        />
        <View style={styles.statusContent}>
          <Text style={styles.statusText}>{scanState.message}</Text>
          {scanState.progress > 0 && (
            <View style={styles.progressBar}>
              <View
                style={[styles.progressFill, { width: `${scanState.progress}%` }]}
              />
            </View>
          )}
        </View>
      </View>

      {/* Results Display */}
      {pipelineResult && (
        <ScrollView style={styles.resultsContainer}>
          <Text style={styles.resultsTitle}>Scan Results</Text>

          <View style={styles.statsGrid}>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{pipelineResult.stats.notesDetected}</Text>
              <Text style={styles.statLabel}>Notes Found</Text>
            </View>

            <View style={styles.statBox}>
              <Text style={styles.statValue}>
                {(pipelineResult.stats.averageConfidence * 100).toFixed(0)}%
              </Text>
              <Text style={styles.statLabel}>Avg Confidence</Text>
            </View>

            <View style={styles.statBox}>
              <Text style={styles.statValue}>{pipelineResult.processingTime}ms</Text>
              <Text style={styles.statLabel}>Processing Time</Text>
            </View>

            <View style={styles.statBox}>
              <Text style={styles.statValue}>
                {pipelineResult.stats.patchesAboveThreshold}
              </Text>
              <Text style={styles.statLabel}>Valid Patches</Text>
            </View>
          </View>

          {/* Voice Classification Breakdown */}
          <Text style={styles.sectionTitle}>Voice Distribution</Text>
          <VoiceDistribution notes={pipelineResult.classifiedNotes} />
        </ScrollView>
      )}

      {/* Voice Controls */}
      <VoiceControls
        isPlaying={isPlaying}
        onPlayAll={handlePlayAll}
        onPlayVoice={handlePlayVoice}
        onStop={handleStop}
      />

      {/* Action Buttons */}
      <View style={styles.actionButtons}>
        {!capturedImage && (
          <>
            <TouchableOpacity
              style={[styles.button, styles.captureButton]}
              onPress={handleCapture}
              disabled={scanState.status === 'processing'}
            >
              <Text style={styles.buttonText}>📷 Scan</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, styles.libraryButton]}
              onPress={handlePickImage}
              disabled={scanState.status === 'processing'}
            >
              <Text style={styles.buttonText}>🖼️ Library</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
};

/**
 * Voice Distribution Component
 */
const VoiceDistribution: React.FC<{ notes: ClassifiedNote[] }> = ({ notes }) => {
  const sopranoCount = notes.filter((n) => n.voice === 'SOPRANO').length;
  const altoCount = notes.filter((n) => n.voice === 'ALTO').length;
  const tenorCount = notes.filter((n) => n.voice === 'TENOR').length;
  const bassCount = notes.filter((n) => n.voice === 'BASS').length;

  return (
    <View style={styles.distributionContainer}>
      <View
        style={[
          styles.voiceBar,
          {
            width: `${(sopranoCount / notes.length) * 100}%`,
            backgroundColor: '#FF6B6B',
          },
        ]}
      >
        <Text style={styles.voiceBarText}>
          S: {sopranoCount} {sopranoCount > 0 ? '▮' : ''}
        </Text>
      </View>

      <View
        style={[
          styles.voiceBar,
          {
            width: `${(altoCount / notes.length) * 100}%`,
            backgroundColor: '#4ECDC4',
          },
        ]}
      >
        <Text style={styles.voiceBarText}>
          A: {altoCount} {altoCount > 0 ? '▮' : ''}
        </Text>
      </View>

      <View
        style={[
          styles.voiceBar,
          {
            width: `${(tenorCount / notes.length) * 100}%`,
            backgroundColor: '#45B7D1',
          },
        ]}
      >
        <Text style={styles.voiceBarText}>
          T: {tenorCount} {tenorCount > 0 ? '▮' : ''}
        </Text>
      </View>

      <View
        style={[
          styles.voiceBar,
          {
            width: `${(bassCount / notes.length) * 100}%`,
            backgroundColor: '#96CEB4',
          },
        ]}
      >
        <Text style={styles.voiceBarText}>
          B: {bassCount} {bassCount > 0 ? '▮' : ''}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },

  camera: {
    flex: 1,
  },

  previewContainer: {
    flex: 1,
    position: 'relative',
    backgroundColor: '#000',
  },

  previewImage: {
    flex: 1,
    resizeMode: 'contain',
  },

  clearButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    backgroundColor: 'rgba(255, 52, 52, 0.9)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },

  clearButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 12,
  },

  statusBar: {
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },

  spinner: {
    marginRight: 12,
  },

  statusContent: {
    flex: 1,
  },

  statusText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },

  progressBar: {
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 2,
    marginTop: 8,
    overflow: 'hidden',
  },

  progressFill: {
    height: '100%',
    backgroundColor: '#4CAF50',
  },

  resultsContainer: {
    maxHeight: 200,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    padding: 16,
    marginVertical: 8,
  },

  resultsTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },

  sectionTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 12,
    marginBottom: 8,
  },

  statsGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
    flexWrap: 'wrap',
  },

  statBox: {
    flex: 1,
    minWidth: '48%',
    backgroundColor: 'rgba(76, 175, 80, 0.2)',
    padding: 12,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#4CAF50',
  },

  statValue: {
    color: '#4CAF50',
    fontSize: 18,
    fontWeight: '700',
  },

  statLabel: {
    color: '#ccc',
    fontSize: 12,
    marginTop: 4,
  },

  distributionContainer: {
    gap: 4,
  },

  voiceBar: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 4,
    justifyContent: 'center',
  },

  voiceBarText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },

  actionButtons: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
  },

  button: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },

  captureButton: {
    backgroundColor: '#2196F3',
  },

  libraryButton: {
    backgroundColor: '#FF9800',
  },

  buttonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },

  errorText: {
    color: '#FF5252',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    marginHorizontal: 16,
  },
});
