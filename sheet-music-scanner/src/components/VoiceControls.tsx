/**
 * Voice Controls Component
 * UI for controlling SATB voice muting/unmuting and playback
 */

import React, { useState, useEffect } from 'react';
import { View, TouchableOpacity, Text, StyleSheet, ScrollView } from 'react-native';
import { Voice } from '../services/VoiceClassifier';
import { soundFontPlayer } from '../services/SoundFontPlayer';

interface VoiceControlsProps {
  onVoiceMuteChange?: (voice: Voice, isMuted: boolean) => void;
  isPlaying?: boolean;
  onPlayVoice?: (voice: Voice) => void;
  onPlayAll?: () => void;
  onStop?: () => void;
}

interface VoiceButtonState {
  voice: Voice;
  isMuted: boolean;
  label: string;
  color: string;
}

const VOICE_COLORS: { [key in Voice]: string } = {
  [Voice.SOPRANO]: '#FF6B6B',
  [Voice.ALTO]: '#4ECDC4',
  [Voice.TENOR]: '#45B7D1',
  [Voice.BASS]: '#96CEB4',
};

const VOICE_LABELS: { [key in Voice]: string } = {
  [Voice.SOPRANO]: 'Soprano',
  [Voice.ALTO]: 'Alto',
  [Voice.TENOR]: 'Tenor',
  [Voice.BASS]: 'Bass',
};

export const VoiceControls: React.FC<VoiceControlsProps> = ({
  onVoiceMuteChange,
  isPlaying = false,
  onPlayVoice,
  onPlayAll,
  onStop,
}) => {
  const [voiceStates, setVoiceStates] = useState<Map<Voice, boolean>>(
    soundFontPlayer.getVoiceMuteStates()
  );

  useEffect(() => {
    const updateVoiceStates = () => {
      setVoiceStates(soundFontPlayer.getVoiceMuteStates());
    };

    const interval = setInterval(updateVoiceStates, 500);
    return () => clearInterval(interval);
  }, []);

  const handleVoiceMuteToggle = (voice: Voice) => {
    const isMuted = soundFontPlayer.toggleVoiceMute(voice);
    setVoiceStates((prev) => new Map(prev).set(voice, isMuted));

    if (onVoiceMuteChange) {
      onVoiceMuteChange(voice, isMuted);
    }
  };

  const handlePlayVoice = (voice: Voice) => {
    if (onPlayVoice) {
      onPlayVoice(voice);
    }
  };

  const handlePlayAll = () => {
    if (onPlayAll) {
      onPlayAll();
    }
  };

  const handleStop = () => {
    if (onStop) {
      onStop();
    }
  };

  const voices: Voice[] = [Voice.SOPRANO, Voice.ALTO, Voice.TENOR, Voice.BASS];

  return (
    <View style={styles.container}>
      {/* Voice Buttons */}
      <View style={styles.voiceButtonsContainer}>
        <Text style={styles.sectionTitle}>Voices</Text>

        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {voices.map((voice) => {
            const isMuted = voiceStates.get(voice) || false;
            return (
              <VoiceButton
                key={voice}
                voice={voice}
                label={VOICE_LABELS[voice]}
                color={VOICE_COLORS[voice]}
                isMuted={isMuted}
                onToggleMute={() => handleVoiceMuteToggle(voice)}
                onPlay={() => handlePlayVoice(voice)}
              />
            );
          })}
        </ScrollView>
      </View>

      {/* Playback Controls */}
      <View style={styles.playbackControlsContainer}>
        <Text style={styles.sectionTitle}>Playback</Text>

        <View style={styles.playbackButtonsRow}>
          <TouchableOpacity
            style={[styles.playbackButton, styles.playAllButton]}
            onPress={handlePlayAll}
            disabled={isPlaying}
          >
            <Text style={styles.playbackButtonText}>
              {isPlaying ? 'Playing...' : 'Play All'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.playbackButton, styles.stopButton]}
            onPress={handleStop}
            disabled={!isPlaying}
          >
            <Text style={styles.playbackButtonText}>Stop</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Voice Equalizer / Mixer */}
      <View style={styles.mixerContainer}>
        <Text style={styles.sectionTitle}>Voice Mixer</Text>

        {voices.map((voice) => (
          <VoiceMixerSlider key={voice} voice={voice} label={VOICE_LABELS[voice]} />
        ))}
      </View>
    </View>
  );
};

/**
 * Individual Voice Button Component
 */
interface VoiceButtonProps {
  voice: Voice;
  label: string;
  color: string;
  isMuted: boolean;
  onToggleMute: () => void;
  onPlay: () => void;
}

const VoiceButton: React.FC<VoiceButtonProps> = ({
  voice,
  label,
  color,
  isMuted,
  onToggleMute,
  onPlay,
}) => {
  return (
    <View style={styles.voiceButtonWrapper}>
      <TouchableOpacity
        style={[
          styles.voiceButton,
          { backgroundColor: color, opacity: isMuted ? 0.4 : 1 },
        ]}
        onPress={onToggleMute}
      >
        <Text style={styles.voiceButtonLabel}>{label}</Text>
        <Text style={styles.voiceButtonStatus}>{isMuted ? '🔇' : '🔊'}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.playButton} onPress={onPlay}>
        <Text style={styles.playButtonText}>▶</Text>
      </TouchableOpacity>
    </View>
  );
};

/**
 * Voice Mixer Slider Component
 */
interface VoiceMixerSliderProps {
  voice: Voice;
  label: string;
}

const VoiceMixerSlider: React.FC<VoiceMixerSliderProps> = ({ voice, label }) => {
  const [volume, setVolume] = useState(soundFontPlayer.getVoiceVolume(voice));

  const handleVolumeChange = (newVolume: number) => {
    setVolume(newVolume);
    soundFontPlayer.setVoiceVolume(voice, newVolume);
  };

  return (
    <View style={styles.mixerSliderContainer}>
      <Text style={styles.mixerLabel}>{label}</Text>

      <View style={styles.sliderWrapper}>
        <Text style={styles.volumeValue}>0%</Text>

        <View
          style={[
            styles.sliderTrack,
            {
              width: `${volume * 100}%`,
              backgroundColor: VOICE_COLORS[voice],
            },
          ]}
        />

        <Text style={styles.volumeValue}>100%</Text>
      </View>

      <TouchableOpacity
        style={styles.volumeButton}
        onPress={() => handleVolumeChange(volume === 0 ? 1 : 0)}
      >
        <Text style={styles.volumeButtonText}>{volume === 0 ? 'Muted' : 'On'}</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#f5f5f5',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: 400,
  },

  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
    color: '#333',
  },

  // Voice Buttons Section
  voiceButtonsContainer: {
    marginBottom: 20,
  },

  voiceButtonWrapper: {
    marginRight: 12,
    alignItems: 'center',
  },

  voiceButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 5,
  },

  voiceButtonLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },

  voiceButtonStatus: {
    fontSize: 16,
    marginTop: 4,
  },

  playButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#4CAF50',
    justifyContent: 'center',
    alignItems: 'center',
  },

  playButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },

  // Playback Controls Section
  playbackControlsContainer: {
    marginBottom: 20,
  },

  playbackButtonsRow: {
    flexDirection: 'row',
    gap: 12,
  },

  playbackButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },

  playAllButton: {
    backgroundColor: '#2196F3',
  },

  stopButton: {
    backgroundColor: '#FF5252',
  },

  playbackButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },

  // Mixer Section
  mixerContainer: {
    marginBottom: 12,
  },

  mixerSliderContainer: {
    marginBottom: 16,
    paddingHorizontal: 8,
  },

  mixerLabel: {
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 8,
    color: '#555',
  },

  sliderWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 24,
    backgroundColor: '#e0e0e0',
    borderRadius: 4,
    marginBottom: 8,
    overflow: 'hidden',
  },

  sliderTrack: {
    height: '100%',
    backgroundColor: '#4CAF50',
  },

  volumeValue: {
    fontSize: 10,
    color: '#999',
    marginHorizontal: 4,
  },

  volumeButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#fff',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#ddd',
  },

  volumeButtonText: {
    fontSize: 10,
    fontWeight: '500',
    color: '#555',
  },
});
