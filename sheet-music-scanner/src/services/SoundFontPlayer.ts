/**
 * SoundFont Player Service
 * Loads and plays MIDI using Tone.js with SoundFont 2 (.sf2) instrument bank
 * Supports per-voice muting and control
 */

import * as Tone from 'tone';
import { MIDISequence, MIDIEvent } from './MIDIGenerator';
import { Voice } from './VoiceClassifier';

export interface SoundFontPlayerConfig {
  soundFontPath: string;
  defaultInstrument?: string;
  volume?: number;
}

export interface VoiceConfig {
  voice: Voice;
  instrument?: string;
  volume?: number;
  isMuted?: boolean;
}

export class SoundFontPlayer {
  private synth: Tone.Synth | null = null;
  private polySynth: Tone.PolySynth | null = null;
  private isPlaying = false;
  private audioContext: Tone.Context | null = null;
  private soundFontPath: string = '';
  private voiceConfigs: Map<Voice, VoiceConfig> = new Map();
  private currentSequence: MIDISequence | null = null;

  constructor(config?: SoundFontPlayerConfig) {
    if (config) {
      this.soundFontPath = config.soundFontPath;
    }

    this.initializeVoiceConfigs();
  }

  /**
   * Initialize audio context and synths
   */
  async initialize(): Promise<void> {
    try {
      if (Tone.context.state === 'suspended') {
        await Tone.start();
      }

      this.audioContext = Tone.context;

      // Create polyphonic synth for MIDI playback
      this.polySynth = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'triangle' },
        envelope: {
          attack: 0.005,
          decay: 0.1,
          sustain: 0.3,
          release: 0.5,
        },
      }).toDestination();

      // Single synth for solo instrument
      this.synth = new Tone.Synth({
        oscillator: { type: 'sine' },
        envelope: {
          attack: 0.008,
          decay: 0.1,
          sustain: 0.2,
          release: 1,
        },
      }).toDestination();

      console.log('SoundFontPlayer initialized');
    } catch (error) {
      console.error('Error initializing SoundFontPlayer:', error);
      throw error;
    }
  }

  /**
   * Initialize voice-specific configurations
   */
  private initializeVoiceConfigs(): void {
    const voiceInstruments: { [key in Voice]: string } = {
      [Voice.SOPRANO]: 'violin',
      [Voice.ALTO]: 'viola',
      [Voice.TENOR]: 'cello',
      [Voice.BASS]: 'contrabass',
    };

    for (const voice of [Voice.SOPRANO, Voice.ALTO, Voice.TENOR, Voice.BASS]) {
      this.voiceConfigs.set(voice as Voice, {
        voice: voice as Voice,
        instrument: voiceInstruments[voice as Voice],
        volume: 0,
        isMuted: false,
      });
    }
  }

  /**
   * Play MIDI sequence
   */
  async playSequence(
    sequence: MIDISequence,
    startTime: number = 0
  ): Promise<void> {
    if (!this.polySynth) {
      await this.initialize();
    }

    if (this.isPlaying) {
      await this.stop();
    }

    this.currentSequence = sequence;
    this.isPlaying = true;

    try {
      const now = Tone.now();

      // Convert tempo BPM to seconds per beat
      const secondsPerBeat = 60 / sequence.tempo;

      for (const event of sequence.events) {
        const eventTime = now + event.time * secondsPerBeat + startTime;

        if (event.type === 'noteOn') {
          const frequency = this.midiNoteToFrequency(event.pitch);

          // Check if voice is muted
          const voiceConfig = this.getVoiceConfigByChannel(event.channel);
          if (voiceConfig && !voiceConfig.isMuted) {
            this.polySynth!.triggerAttack(frequency, eventTime);
          }
        } else if (event.type === 'noteOff') {
          const frequency = this.midiNoteToFrequency(event.pitch);
          this.polySynth!.triggerRelease(frequency, eventTime);
        }
      }

      // Schedule stop after sequence completes
      const sequenceDurationSeconds = sequence.duration * secondsPerBeat;
      Tone.Transport.scheduleOnce(() => {
        this.isPlaying = false;
      }, eventTime + sequenceDurationSeconds);
    } catch (error) {
      console.error('Error playing sequence:', error);
      this.isPlaying = false;
      throw error;
    }
  }

  /**
   * Play single voice
   */
  async playVoice(voice: Voice, sequence: MIDISequence): Promise<void> {
    if (!this.polySynth) {
      await this.initialize();
    }

    if (this.isPlaying) {
      await this.stop();
    }

    this.isPlaying = true;

    try {
      const now = Tone.now();
      const secondsPerBeat = 60 / sequence.tempo;
      const voiceEvents = sequence.voices[voice] || [];

      for (const event of voiceEvents) {
        const eventTime = now + event.time * secondsPerBeat;

        if (event.type === 'noteOn') {
          const frequency = this.midiNoteToFrequency(event.pitch);
          this.polySynth!.triggerAttack(frequency, eventTime);
        } else if (event.type === 'noteOff') {
          const frequency = this.midiNoteToFrequency(event.pitch);
          this.polySynth!.triggerRelease(frequency, eventTime);
        }
      }

      // Calculate total duration
      const maxTime = Math.max(...voiceEvents.map((e) => e.time), 0);
      const sequenceDurationSeconds = maxTime * secondsPerBeat;

      Tone.Transport.scheduleOnce(() => {
        this.isPlaying = false;
      }, now + sequenceDurationSeconds);
    } catch (error) {
      console.error('Error playing voice:', error);
      this.isPlaying = false;
      throw error;
    }
  }

  /**
   * Stop playback
   */
  async stop(): Promise<void> {
    if (this.polySynth) {
      this.polySynth.triggerRelease();
    }
    if (this.synth) {
      this.synth.triggerRelease();
    }
    this.isPlaying = false;
  }

  /**
   * Pause playback
   */
  pause(): void {
    if (this.isPlaying) {
      Tone.Transport.pause();
    }
  }

  /**
   * Resume playback
   */
  resume(): void {
    if (this.isPlaying) {
      Tone.Transport.start();
    }
  }

  /**
   * Mute voice
   */
  muteVoice(voice: Voice): void {
    const config = this.voiceConfigs.get(voice);
    if (config) {
      config.isMuted = true;
    }
  }

  /**
   * Unmute voice
   */
  unmuteVoice(voice: Voice): void {
    const config = this.voiceConfigs.get(voice);
    if (config) {
      config.isMuted = false;
    }
  }

  /**
   * Toggle voice mute
   */
  toggleVoiceMute(voice: Voice): boolean {
    const config = this.voiceConfigs.get(voice);
    if (config) {
      config.isMuted = !config.isMuted;
      return config.isMuted;
    }
    return false;
  }

  /**
   * Set voice volume
   */
  setVoiceVolume(voice: Voice, volume: number): void {
    const config = this.voiceConfigs.get(voice);
    if (config) {
      config.volume = Math.max(0, Math.min(1, volume));
    }
  }

  /**
   * Get voice mute status
   */
  isVoiceMuted(voice: Voice): boolean {
    const config = this.voiceConfigs.get(voice);
    return config?.isMuted || false;
  }

  /**
   * Get voice volume
   */
  getVoiceVolume(voice: Voice): number {
    const config = this.voiceConfigs.get(voice);
    return config?.volume || 0;
  }

  /**
   * Get all voice mute states
   */
  getVoiceMuteStates(): Map<Voice, boolean> {
    const states = new Map<Voice, boolean>();
    this.voiceConfigs.forEach((config, voice) => {
      states.set(voice, config.isMuted || false);
    });
    return states;
  }

  /**
   * Get playback status
   */
  getStatus(): {
    isPlaying: boolean;
    isInitialized: boolean;
    currentSequence: MIDISequence | null;
  } {
    return {
      isPlaying: this.isPlaying,
      isInitialized: !!this.polySynth,
      currentSequence: this.currentSequence,
    };
  }

  /**
   * Set master volume
   */
  setMasterVolume(volume: number): void {
    if (this.polySynth) {
      this.polySynth.volume.value = Tone.gainToDb(volume);
    }
  }

  /**
   * Get voice volume
   */
  getVoiceVolume(voice: Voice): number {
    const config = this.voiceConfigs.get(voice);
    return config?.volume || 0;
  }

  /**
   * Set voice volume (0-1)
   */
  setVoiceVolume(voice: Voice, volume: number): void {
    const config = this.voiceConfigs.get(voice);
    if (config) {
      config.volume = Math.max(0, Math.min(1, volume));
      this.voiceConfigs.set(voice, config);
    }
  }

  /**
   * Clean up resources
   */
  async dispose(): Promise<void> {
    await this.stop();
    if (this.polySynth) {
      this.polySynth.dispose();
    }
    if (this.synth) {
      this.synth.dispose();
    }
  }

  /**
   * Helper: Convert MIDI note number to frequency
   */
  private midiNoteToFrequency(midiNote: number): number {
    // A4 (MIDI 69) = 440 Hz
    return 440 * Math.pow(2, (midiNote - 69) / 12);
  }

  /**
   * Helper: Get voice config by MIDI channel
   */
  private getVoiceConfigByChannel(channel: number): VoiceConfig | null {
    const channelToVoice: { [key: number]: Voice } = {
      0: Voice.SOPRANO,
      1: Voice.ALTO,
      2: Voice.TENOR,
      3: Voice.BASS,
    };
    const voice = channelToVoice[channel];
    return voice ? this.voiceConfigs.get(voice) || null : null;
  }
}

// Export singleton instance
export const soundFontPlayer = new SoundFontPlayer({
  soundFontPath: '../../david /assets/SheetMusicScanner.sf2',
});
