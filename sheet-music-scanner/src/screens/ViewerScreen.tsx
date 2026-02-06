import React, { useState, useEffect } from 'react';
import {
  View,
  SafeAreaView,
  StyleSheet,
  Text,
  Image,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
} from 'react-native';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import Slider from '@react-native-community/slider';
import { StorageService } from '@services/storage';
import { ExportService } from '@services/export';
import MIDIService from '@services/MIDIService';
import { ScannedItem } from '@utils/types';
import { COLORS, SPACING, TYPOGRAPHY, BORDER_RADIUS } from '@utils/constants';
import { formatDuration, getTimeAgo } from '@utils/helpers';


interface ViewerScreenProps {
  route: any;
  navigation: any;
}

const ViewerScreen: React.FC<ViewerScreenProps> = ({ route, navigation }) => {
  const { itemId } = route.params;
  const [item, setItem] = useState<ScannedItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [showExportModal, setShowExportModal] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  
  // MIDI Service state
  const [midiService] = useState(() => new MIDIService());
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackPosition, setPlaybackPosition] = useState(0);
  const [playbackDuration, setPlaybackDuration] = useState(0);

  useEffect(() => {
    loadItem();
    navigation.setOptions({
      headerShown: true,
      title: '',
    });
  }, []);

  // Load MIDI when item is loaded
  useEffect(() => {
    if (item?.musicData) {
      loadMIDI();
    }
    
    return () => {
      midiService.cleanup();
    };
  }, [item]);

  const loadMIDI = async () => {
    try {
      if (!item?.musicData) return;
      
      // Export music data to MIDI
      const midiBase64 = await ExportService.exportToMIDI(item.musicData);
      await midiService.loadMIDI(midiBase64);
      setPlaybackDuration(midiService.getDuration());
      
      // Subscribe to status updates
      const unsubscribe = midiService.onStatusChange((info) => {
        setIsPlaying(info.isPlaying);
        setPlaybackPosition(info.currentPosition);
      });
      
      return unsubscribe;
    } catch (error) {
      console.error('Failed to load MIDI:', error);
    }
  };

  const loadItem = async () => {
    try {
      setIsLoading(true);
      const loadedItem = await StorageService.getScannedItem(itemId);
      if (loadedItem) {
        setItem(loadedItem);
        // Update last played
        await StorageService.updateScannedItem(itemId, {
          lastPlayed: Date.now(),
          playCount: loadedItem.playCount + 1,
        });
      }
    } catch (error) {
      console.error('Error loading item:', error);
      Alert.alert('Error', 'Failed to load item');
      navigation.goBack();
    } finally {
      setIsLoading(false);
    }
  };

  const togglePlayback = async () => {
    try {
      if (isPlaying) {
        await midiService.pause();
      } else {
        await midiService.play();
      }
    } catch (error) {
      console.error('Playback error:', error);
      Alert.alert('Playback Error', 'Failed to play audio');
    }
  };

  const handleShare = () => {
    Alert.alert('Share', 'Share functionality coming soon!');
  };

  const handleEdit = () => {
    navigation.navigate('ImageEditor', { imageUri: item?.imagePath });
  };

  const handleDelete = () => {
    Alert.alert('Delete', 'Are you sure you want to delete this item?', [
      { text: 'Cancel' },
      {
        text: 'Delete',
        onPress: async () => {
          try {
            await StorageService.deleteScannedItem(itemId);
            navigation.goBack();
          } catch (error) {
            Alert.alert('Error', 'Failed to delete item');
          }
        },
        style: 'destructive',
      },
    ]);
  };

  const handleExport = async (format: 'midi' | 'musicxml' | 'json') => {
    if (!item?.musicData) {
      Alert.alert('Error', 'No music data to export');
      return;
    }

    try {
      setIsExporting(true);
      setExportProgress(0);

      let exportedData: string | undefined;

      if (format === 'midi') {
        exportedData = await ExportService.exportToMIDI(item.musicData);
        setExportProgress(100);
      } else if (format === 'musicxml') {
        exportedData = await ExportService.exportToMusicXML(item.musicData);
        setExportProgress(100);
      } else if (format === 'json') {
        exportedData = JSON.stringify(item.musicData, null, 2);
        setExportProgress(100);
      }

      if (exportedData) {
        // Save to documents or share
        const filename = `${item.filename || 'music'}.${format === 'midi' ? 'mid' : format === 'musicxml' ? 'xml' : 'json'}`;
        
        // Try to share directly - use Paths.cache from expo-file-system
        const cacheFile = new FileSystem.File(FileSystem.Paths.cache, filename);
        await cacheFile.write(exportedData);
        
        Alert.alert('Success', `Exported as ${format.toUpperCase()}`, [
          { text: 'Done' },
          {
            text: 'Share',
            onPress: () => shareExport(cacheFile.uri, filename),
          },
        ]);
      }
    } catch (error) {
      console.error('Export error:', error);
      Alert.alert('Error', `Failed to export as ${format.toUpperCase()}`);
    } finally {
      setIsExporting(false);
      setShowExportModal(false);
    }
  };

  const shareExport = async (uri: string, filename: string) => {
    try {
      await Sharing.shareAsync(uri, {
        mimeType: filename.endsWith('.mid') ? 'audio/midi' : 'text/plain',
        dialogTitle: `Share ${filename}`,
        UTI: filename.endsWith('.mid') ? 'com.midi' : 'public.plain-text',
      });
    } catch (error) {
      console.error('Share error:', error);
    }
  };

  if (isLoading || !item) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Music Image */}
        {item.imagePath && (
          <View style={styles.imageContainer}>
            <Image source={{ uri: item.imagePath }} style={styles.musicImage} />
          </View>
        )}

        {/* Music Info */}
        <View style={styles.infoSection}>
          <Text style={styles.title}>{item.musicData?.title || item.filename}</Text>
          <Text style={styles.composer}>
            {item.musicData?.composer || 'Unknown Composer'}
          </Text>

          <View style={styles.metaContainer}>
            <MetaItem icon="calendar" text={getTimeAgo(item.dateScanned)} />
            {item.duration && <MetaItem icon="schedule" text={formatDuration(item.duration)} />}
            <MetaItem
              icon="play-arrow"
              text={`${item.playCount} play${item.playCount !== 1 ? 's' : ''}`}
            />
          </View>
        </View>

        {/* Confidence Score Visualization */}
        {item.musicData?.confidence && (
          <View style={styles.confidenceSection}>
            <View style={styles.confidenceHeader}>
              <Text style={styles.confidenceTitle}>Recognition Confidence</Text>
              <Text
                style={[
                  styles.confidenceValue,
                  {
                    color:
                      item.musicData.confidence > 0.8
                        ? COLORS.success
                        : item.musicData.confidence > 0.6
                          ? COLORS.warning
                          : COLORS.error,
                  },
                ]}
              >
                {Math.round(item.musicData.confidence * 100)}%
              </Text>
            </View>

            {/* Confidence Bar */}
            <View style={styles.confidenceBarContainer}>
              <View
                style={[
                  styles.confidenceBar,
                  {
                    width: `${item.musicData.confidence * 100}%`,
                    backgroundColor:
                      item.musicData.confidence > 0.8
                        ? COLORS.success
                        : item.musicData.confidence > 0.6
                          ? COLORS.warning
                          : COLORS.error,
                  },
                ]}
              />
            </View>

            {/* Confidence Explanation */}
            <Text style={styles.confidenceText}>
              {item.musicData.confidence > 0.8
                ? 'High confidence - Results are very reliable'
                : item.musicData.confidence > 0.6
                  ? 'Medium confidence - Some details may need review'
                  : 'Low confidence - Please review and edit as needed'}
            </Text>

            {/* Additional Metadata */}
            <View style={styles.metadataGrid}>
              {item.musicData.timeSignature && (
                <View style={styles.metadataItem}>
                  <MaterialCommunityIcons name="music-note" size={20} color={COLORS.primary} style={styles.metadataIcon} />
                  <View>
                    <Text style={styles.metadataLabel}>Time Signature</Text>
                    <Text style={styles.metadataValue}>{item.musicData.timeSignature}</Text>
                  </View>
                </View>
              )}
              {item.musicData.key && (
                <View style={styles.metadataItem}>
                  <MaterialCommunityIcons name="music-clef-treble" size={20} color={COLORS.primary} style={styles.metadataIcon} />
                  <View>
                    <Text style={styles.metadataLabel}>Key Signature</Text>
                    <Text style={styles.metadataValue}>{item.musicData.key}</Text>
                  </View>
                </View>
              )}
              {item.musicData.measures && (
                <View style={styles.metadataItem}>
                  <MaterialCommunityIcons name="format-list-numbered" size={20} color={COLORS.primary} style={styles.metadataIcon} />
                  <View>
                    <Text style={styles.metadataLabel}>Measures</Text>
                    <Text style={styles.metadataValue}>{item.musicData.measures.length}</Text>
                  </View>
                </View>
              )}
              {item.musicData.noteCount && (
                <View style={styles.metadataItem}>
                  <MaterialCommunityIcons name="music-note-eighth" size={20} color={COLORS.primary} style={styles.metadataIcon} />
                  <View>
                    <Text style={styles.metadataLabel}>Notes Detected</Text>
                    <Text style={styles.metadataValue}>{item.musicData.noteCount}</Text>
                  </View>
                </View>
              )}
              {item.processingTime && (
                <View style={styles.metadataItem}>
                  <MaterialCommunityIcons name="clock-outline" size={20} color={COLORS.primary} style={styles.metadataIcon} />
                  <View>
                    <Text style={styles.metadataLabel}>Processing Time</Text>
                    <Text style={styles.metadataValue}>{item.processingTime}ms</Text>
                  </View>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Player Controls */}
        <View style={styles.playerSection}>
          <Text style={styles.playerTitle}>Playback</Text>

          {/* Play Button */}
          <TouchableOpacity
            style={styles.playButton}
            onPress={togglePlayback}
          >
            <MaterialIcons
              name={isPlaying ? 'pause' : 'play-arrow'}
              size={40}
              color="white"
            />
          </TouchableOpacity>

          {/* Progress Bar */}
          <View style={styles.progressContainer}>
            <View style={styles.timeRow}>
              <Text style={styles.timeText}>
                {MIDIService.formatTime(playbackPosition)}
              </Text>
              <Text style={styles.timeText}>
                {MIDIService.formatTime(playbackDuration)}
              </Text>
            </View>
            <Slider
              style={styles.slider}
              value={playbackPosition}
              onValueChange={(value) => {
                midiService.seek(value);
              }}
              minimumValue={0}
              maximumValue={playbackDuration}
              minimumTrackTintColor={COLORS.primary}
              maximumTrackTintColor={COLORS.border}
            />
          </View>

          {/* Speed Control */}
          <View style={styles.speedContainer}>
            <Text style={styles.speedLabel}>Speed</Text>
            <View style={styles.speedButtons}>
              {[0.5, 1, 1.5, 2].map((speed) => (
                <TouchableOpacity
                  key={speed}
                  style={[
                    styles.speedButton,
                    playbackSpeed === speed && styles.speedButtonActive,
                  ]}
                  onPress={async () => {
                    setPlaybackSpeed(speed);
                    await midiService.setPlaybackSpeed(speed);
                  }}
                >
                  <Text
                    style={[
                      styles.speedButtonText,
                      playbackSpeed === speed && styles.speedButtonTextActive,
                    ]}
                  >
                    {speed}x
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        {/* Music Details */}
        {item.musicData && (
          <View style={styles.detailsSection}>
            <Text style={styles.detailsTitle}>Music Details</Text>

            {item.musicData.tempo && (
              <DetailItem label="Tempo" value={`${item.musicData.tempo} BPM`} />
            )}
            {item.musicData.timeSignature && (
              <DetailItem label="Time Signature" value={item.musicData.timeSignature} />
            )}
            {item.musicData.key && (
              <DetailItem label="Key" value={item.musicData.key} />
            )}
            {item.musicData.pages && (
              <DetailItem label="Pages" value={`${item.musicData.pages} page(s)`} />
            )}
          </View>
        )}

        {/* Actions */}
        <View style={styles.actionsSection}>
          <ActionButton icon="edit" label="Edit" onPress={handleEdit} />
          <ActionButton
            icon="download"
            label="Export"
            onPress={() => setShowExportModal(true)}
          />
          <ActionButton icon="share" label="Share" onPress={handleShare} />
          <ActionButton
            icon="delete"
            label="Delete"
            onPress={handleDelete}
            isDanger
          />
        </View>

        {/* Export Modal */}
        <Modal
          visible={showExportModal}
          transparent
          animationType="slide"
          onRequestClose={() => setShowExportModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Export Music</Text>
                <TouchableOpacity
                  onPress={() => setShowExportModal(false)}
                  style={styles.closeButton}
                >
                  <MaterialIcons name="close" size={24} color={COLORS.text} />
                </TouchableOpacity>
              </View>

              {isExporting && (
                <View style={styles.exportProgress}>
                  <ActivityIndicator size="large" color={COLORS.primary} />
                  <Text style={styles.exportProgressText}>Exporting...</Text>
                  <View style={styles.progressBarContainer}>
                    <View
                      style={[
                        styles.progressBar,
                        { width: `${exportProgress}%` },
                      ]}
                    />
                  </View>
                </View>
              )}

              {!isExporting && (
                <View style={styles.exportOptions}>
                  <Text style={styles.exportLabel}>Select Export Format</Text>

                  <TouchableOpacity
                    style={styles.exportOption}
                    onPress={() => handleExport('midi')}
                  >
                    <MaterialCommunityIcons
                      name="music"
                      size={24}
                      color={COLORS.primary}
                    />
                    <View style={styles.exportOptionText}>
                      <Text style={styles.exportOptionTitle}>MIDI</Text>
                      <Text style={styles.exportOptionDesc}>
                        Compatible with DAWs and music software
                      </Text>
                    </View>
                    <MaterialIcons
                      name="chevron-right"
                      size={24}
                      color={COLORS.border}
                    />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.exportOption}
                    onPress={() => handleExport('musicxml')}
                  >
                    <MaterialCommunityIcons
                      name="file-music"
                      size={24}
                      color={COLORS.primary}
                    />
                    <View style={styles.exportOptionText}>
                      <Text style={styles.exportOptionTitle}>MusicXML</Text>
                      <Text style={styles.exportOptionDesc}>
                        Standard music notation format
                      </Text>
                    </View>
                    <MaterialIcons
                      name="chevron-right"
                      size={24}
                      color={COLORS.border}
                    />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.exportOption}
                    onPress={() => handleExport('json')}
                  >
                    <MaterialCommunityIcons
                      name="code-json"
                      size={24}
                      color={COLORS.primary}
                    />
                    <View style={styles.exportOptionText}>
                      <Text style={styles.exportOptionTitle}>JSON</Text>
                      <Text style={styles.exportOptionDesc}>
                        Raw music data for custom processing
                      </Text>
                    </View>
                    <MaterialIcons
                      name="chevron-right"
                      size={24}
                      color={COLORS.border}
                    />
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>
        </Modal>
      </ScrollView>
    </SafeAreaView>
  );
};

const MetaItem: React.FC<{ icon: string; text: string }> = ({ icon, text }) => (
  <View style={styles.metaItem}>
    <MaterialIcons name={icon as any} size={16} color={COLORS.primary} />
    <Text style={styles.metaText}>{text}</Text>
  </View>
);

const DetailItem: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <View style={styles.detailItem}>
    <Text style={styles.detailLabel}>{label}</Text>
    <Text style={styles.detailValue}>{value}</Text>
  </View>
);

const ActionButton: React.FC<{
  icon: string;
  label: string;
  onPress: () => void;
  isDanger?: boolean;
}> = ({ icon, label, onPress, isDanger }) => (
  <TouchableOpacity
    style={[styles.actionButton, isDanger && styles.actionButtonDanger]}
    onPress={onPress}
  >
    <MaterialIcons
      name={icon as any}
      size={20}
      color={isDanger ? COLORS.error : COLORS.primary}
    />
    <Text style={[styles.actionButtonText, isDanger && styles.actionButtonTextDanger]}>
      {label}
    </Text>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageContainer: {
    width: '100%',
    height: 400,
    backgroundColor: COLORS.surface,
  },
  musicImage: {
    width: '100%',
    height: '100%',
  },
  infoSection: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.xl,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  title: {
    ...TYPOGRAPHY.h2,
    color: COLORS.text,
  },
  composer: {
    ...TYPOGRAPHY.body1,
    color: COLORS.textSecondary,
    marginTop: SPACING.sm,
  },
  metaContainer: {
    flexDirection: 'row',
    gap: SPACING.lg,
    marginTop: SPACING.md,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  metaText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
  },
  playerSection: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.xl,
    gap: SPACING.lg,
  },
  playerTitle: {
    ...TYPOGRAPHY.h3,
    color: COLORS.text,
  },
  playButton: {
    width: 80,
    height: 80,
    borderRadius: BORDER_RADIUS.round,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
  },
  progressContainer: {
    gap: SPACING.md,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.xs,
  },
  timeText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
  },
  slider: {
    height: 40,
  },
  speedContainer: {
    gap: SPACING.md,
  },
  speedLabel: {
    ...TYPOGRAPHY.body2,
    color: COLORS.text,
    fontWeight: '600',
  },
  speedButtons: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  speedButton: {
    flex: 1,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
  },
  speedButtonActive: {
    backgroundColor: COLORS.primary,
  },
  speedButtonText: {
    ...TYPOGRAPHY.body2,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  speedButtonTextActive: {
    color: 'white',
  },
  detailsSection: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.xl,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  detailsTitle: {
    ...TYPOGRAPHY.h3,
    color: COLORS.text,
    marginBottom: SPACING.md,
  },
  detailItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.md,
  },
  detailLabel: {
    ...TYPOGRAPHY.body1,
    color: COLORS.textSecondary,
  },
  detailValue: {
    ...TYPOGRAPHY.body1,
    color: COLORS.text,
    fontWeight: '600',
  },
  actionsSection: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.xl,
    gap: SPACING.md,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    backgroundColor: COLORS.surface,
  },
  actionButtonDanger: {
    backgroundColor: 'rgba(234, 67, 53, 0.1)',
  },
  actionButtonText: {
    ...TYPOGRAPHY.body2,
    color: COLORS.primary,
    fontWeight: '600',
  },
  actionButtonTextDanger: {
    color: COLORS.error,
  },
  confidenceSection: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.xl,
    backgroundColor: 'rgba(33, 150, 243, 0.05)',
    borderRadius: BORDER_RADIUS.lg,
    marginHorizontal: SPACING.lg,
    marginVertical: SPACING.md,
  },
  confidenceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  confidenceTitle: {
    ...TYPOGRAPHY.body1,
    color: COLORS.text,
    fontWeight: '600',
  },
  confidenceValue: {
    ...TYPOGRAPHY.h3,
    fontWeight: 'bold',
  },
  confidenceBarContainer: {
    height: 8,
    backgroundColor: COLORS.border,
    borderRadius: BORDER_RADIUS.sm,
    overflow: 'hidden',
    marginBottom: SPACING.md,
  },
  confidenceBar: {
    height: '100%',
    borderRadius: BORDER_RADIUS.sm,
  },
  confidenceText: {
    ...TYPOGRAPHY.body2,
    color: COLORS.textSecondary,
    marginBottom: SPACING.md,
  },
  metadataGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.md,
  },
  metadataItem: {
    flex: 0.48,
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    backgroundColor: 'white',
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  metadataIcon: {
    marginRight: SPACING.sm,
  },
  metadataLabel: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
  },
  metadataValue: {
    ...TYPOGRAPHY.body1,
    color: COLORS.text,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: 'white',
    borderTopLeftRadius: BORDER_RADIUS.xl,
    borderTopRightRadius: BORDER_RADIUS.xl,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  modalTitle: {
    ...TYPOGRAPHY.h2,
    color: COLORS.text,
    fontWeight: 'bold',
  },
  closeButton: {
    padding: SPACING.sm,
  },
  exportProgress: {
    padding: SPACING.xl,
    alignItems: 'center',
    gap: SPACING.lg,
  },
  exportProgressText: {
    ...TYPOGRAPHY.body1,
    color: COLORS.text,
  },
  progressBarContainer: {
    width: '100%',
    height: 6,
    backgroundColor: COLORS.border,
    borderRadius: BORDER_RADIUS.sm,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: COLORS.primary,
  },
  exportOptions: {
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  exportLabel: {
    ...TYPOGRAPHY.body1,
    color: COLORS.text,
    fontWeight: '600',
    marginBottom: SPACING.md,
  },
  exportOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.lg,
    borderRadius: BORDER_RADIUS.lg,
    backgroundColor: COLORS.surface,
    gap: SPACING.md,
  },
  exportOptionText: {
    flex: 1,
    gap: SPACING.xs,
  },
  exportOptionTitle: {
    ...TYPOGRAPHY.body1,
    color: COLORS.text,
    fontWeight: '600',
  },
  exportOptionDesc: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
  },
});

export default ViewerScreen;
