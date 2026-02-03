/**
 * MIDI Generator Service
 * Converts classified notes into MIDI events and generates playable sequences
 */

import { ClassifiedNote, Voice } from './VoiceClassifier';

export interface MIDIEvent {
  type: 'noteOn' | 'noteOff';
  pitch: number;
  velocity: number;
  time: number;
  channel: number;
  duration?: number;
}

export interface MIDISequence {
  tempo: number; // BPM
  events: MIDIEvent[];
  duration: number; // Total duration in beats
  voices: {
    [key in Voice]?: MIDIEvent[];
  };
}

export class MIDIGenerator {
  private readonly DEFAULT_TEMPO = 120; // BPM
  private readonly TICKS_PER_BEAT = 480;
  private readonly DEFAULT_VELOCITY = 100;
  private readonly NOTE_OFF_VELOCITY = 0;

  /**
   * Generate MIDI sequence from classified notes
   */
  generateSequence(notes: ClassifiedNote[], tempo: number = this.DEFAULT_TEMPO): MIDISequence {
    const events: MIDIEvent[] = [];
    const voiceEvents: { [key in Voice]?: MIDIEvent[] } = {};

    // Initialize voice arrays
    for (const voice of [Voice.SOPRANO, Voice.ALTO, Voice.TENOR, Voice.BASS]) {
      voiceEvents[voice as Voice] = [];
    }

    let currentTime = 0;

    // Sort notes by timing
    const sortedNotes = [...notes].sort((a, b) => {
      const timeA = a.timestamp || 0;
      const timeB = b.timestamp || 0;
      return timeA - timeB;
    });

    for (const note of sortedNotes) {
      const noteOnTime = currentTime;
      const noteOffTime = currentTime + this.durationToBeats(note.duration);

      // Note ON event
      const noteOnEvent: MIDIEvent = {
        type: 'noteOn',
        pitch: note.pitch,
        velocity: this.DEFAULT_VELOCITY,
        time: noteOnTime,
        channel: note.channel,
        duration: note.duration,
      };

      // Note OFF event
      const noteOffEvent: MIDIEvent = {
        type: 'noteOff',
        pitch: note.pitch,
        velocity: this.NOTE_OFF_VELOCITY,
        time: noteOffTime,
        channel: note.channel,
      };

      events.push(noteOnEvent);
      events.push(noteOffEvent);

      // Add to voice-specific events
      if (voiceEvents[note.voice]) {
        voiceEvents[note.voice]!.push(noteOnEvent);
        voiceEvents[note.voice]!.push(noteOffEvent);
      }

      currentTime = noteOffTime;
    }

    // Sort all events by time
    events.sort((a, b) => a.time - b.time);

    const totalDuration = currentTime;

    return {
      tempo,
      events,
      duration: totalDuration,
      voices: voiceEvents,
    };
  }

  /**
   * Generate MIDI sequence with timing information
   */
  generateSequenceWithTiming(
    notes: ClassifiedNote[],
    startTime: number = 0,
    tempo: number = this.DEFAULT_TEMPO
  ): MIDISequence {
    const timedNotes = notes.map((note, index) => ({
      ...note,
      timestamp: startTime + index * (note.duration || 1),
    }));

    return this.generateSequence(timedNotes, tempo);
  }

  /**
   * Convert MIDI sequence to raw MIDI bytes
   */
  sequenceToMidiBytes(sequence: MIDISequence): Uint8Array {
    const events = sequence.events;
    const bytes: number[] = [];

    // MIDI header
    bytes.push(...this.stringToBytes('MThd')); // Header chunk type
    bytes.push(0, 0, 0, 6); // Header length (always 6)
    bytes.push(0, 0); // Format type (0 = single track)
    bytes.push(0, 1); // Number of tracks (1)

    // Tempo (ticks per quarter note)
    const tpq = this.TICKS_PER_BEAT;
    bytes.push((tpq >> 8) & 0xff, tpq & 0xff);

    // Track data
    const trackData: number[] = [];

    // Set tempo meta event
    const tempoData = this.numberToBytes(
      Math.round(60000000 / sequence.tempo),
      3
    );
    trackData.push(...this.metaEvent(0x51, tempoData));

    // Add MIDI events
    let lastTime = 0;
    for (const event of events) {
      const deltaTime = Math.round(event.time - lastTime) * 4; // Convert to MIDI ticks
      trackData.push(...this.variableLengthQuantity(deltaTime));

      if (event.type === 'noteOn') {
        trackData.push(0x90 + event.channel, event.pitch, event.velocity);
      } else if (event.type === 'noteOff') {
        trackData.push(0x80 + event.channel, event.pitch, event.velocity);
      }

      lastTime = event.time;
    }

    // End of track meta event
    trackData.push(...this.metaEvent(0x2f, []));

    // Track chunk header
    bytes.push(...this.stringToBytes('MTrk'));
    const trackLength = trackData.length;
    bytes.push(
      (trackLength >> 24) & 0xff,
      (trackLength >> 16) & 0xff,
      (trackLength >> 8) & 0xff,
      trackLength & 0xff
    );

    bytes.push(...trackData);

    return new Uint8Array(bytes);
  }

  /**
   * Get events for specific voice
   */
  getVoiceEvents(sequence: MIDISequence, voice: Voice): MIDIEvent[] {
    return sequence.voices[voice] || [];
  }

  /**
   * Get events for multiple voices
   */
  getMultiVoiceEvents(
    sequence: MIDISequence,
    voices: Voice[]
  ): MIDIEvent[] {
    const events: MIDIEvent[] = [];
    for (const voice of voices) {
      events.push(...(sequence.voices[voice] || []));
    }
    return events.sort((a, b) => a.time - b.time);
  }

  /**
   * Mute/unmute voice by modifying velocity
   */
  muteVoice(sequence: MIDISequence, voice: Voice): MIDISequence {
    return {
      ...sequence,
      events: sequence.events.map((event) => {
        if (event.channel === this.getChannelForVoice(voice)) {
          return { ...event, velocity: 0 };
        }
        return event;
      }),
    };
  }

  /**
   * Adjust tempo
   */
  adjustTempo(sequence: MIDISequence, newTempo: number): MIDISequence {
    const tempoRatio = sequence.tempo / newTempo;
    return {
      ...sequence,
      tempo: newTempo,
      duration: sequence.duration * tempoRatio,
      events: sequence.events.map((event) => ({
        ...event,
        time: event.time * tempoRatio,
        duration: event.duration
          ? event.duration * tempoRatio
          : event.duration,
      })),
    };
  }

  /**
   * Helper: Convert duration value to beats
   */
  private durationToBeats(duration: number): number {
    // Duration typically: 1=whole, 0.5=half, 0.25=quarter, 0.125=eighth, etc.
    // Or: 1=quarter, 2=half, 4=whole
    // Normalize to quarter note = 1 beat
    return duration;
  }

  /**
   * Helper: Convert string to bytes
   */
  private stringToBytes(str: string): number[] {
    return str.split('').map((c) => c.charCodeAt(0));
  }

  /**
   * Helper: Convert number to bytes (big-endian)
   */
  private numberToBytes(num: number, length: number): number[] {
    const bytes: number[] = [];
    for (let i = length - 1; i >= 0; i--) {
      bytes.unshift((num >> (i * 8)) & 0xff);
    }
    return bytes;
  }

  /**
   * Helper: Variable length quantity (MIDI format)
   */
  private variableLengthQuantity(value: number): number[] {
    const bytes: number[] = [];
    bytes.unshift(value & 0x7f);
    value >>= 7;

    while (value > 0) {
      bytes.unshift((value & 0x7f) | 0x80);
      value >>= 7;
    }

    return bytes;
  }

  /**
   * Helper: Meta event
   */
  private metaEvent(type: number, data: number[]): number[] {
    const bytes = [0xff, type];
    bytes.push(data.length);
    bytes.push(...data);
    return bytes;
  }

  /**
   * Helper: Get channel for voice
   */
  private getChannelForVoice(voice: Voice): number {
    const channels: { [key in Voice]: number } = {
      [Voice.SOPRANO]: 0,
      [Voice.ALTO]: 1,
      [Voice.TENOR]: 2,
      [Voice.BASS]: 3,
    };
    return channels[voice];
  }
}

// Export singleton instance
export const midiGenerator = new MIDIGenerator();
