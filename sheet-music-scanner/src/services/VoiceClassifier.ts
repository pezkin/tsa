/**
 * Voice Classifier Service
 * Classifies detected notes into SATB (Soprano, Alto, Tenor, Bass) voices
 * Uses staff position and pitch range to determine voice assignment
 */

export enum Voice {
  SOPRANO = 'soprano',
  ALTO = 'alto',
  TENOR = 'tenor',
  BASS = 'bass',
}

export interface DetectedNote {
  pitch: number; // MIDI note number (0-127)
  duration: number; // Duration in beats
  staffPosition: number; // Position on staff (0=top line, increases downward)
  timestamp?: number;
  confidence?: number;
}

export interface ClassifiedNote extends DetectedNote {
  voice: Voice;
  channel: number; // MIDI channel (0-3 for SATB)
}

export class VoiceClassifier {
  // Standard MIDI note ranges for SATB
  private readonly VOICE_RANGES = {
    [Voice.SOPRANO]: { min: 72, max: 96 }, // C5 to C7
    [Voice.ALTO]: { min: 60, max: 84 }, // C4 to C6
    [Voice.TENOR]: { min: 48, max: 72 }, // C3 to C5
    [Voice.BASS]: { min: 36, max: 60 }, // C2 to C4
  };

  private readonly VOICE_CHANNELS = {
    [Voice.SOPRANO]: 0,
    [Voice.ALTO]: 1,
    [Voice.TENOR]: 2,
    [Voice.BASS]: 3,
  };

  // Staff line positions (treble clef)
  private readonly TREBLE_STAFF_LINES = [4, 3, 2, 1, 0]; // Top to bottom line positions
  private readonly TREBLE_NOTE_POSITIONS = {
    // Line notes (from top)
    0: 83, // F5 (top line)
    2: 79, // B4
    4: 75, // D4
    6: 71, // F4 (middle line)
    8: 67, // A3
    10: 63, // C3 (bottom line)
    // Space notes (from top)
    1: 81, // E5
    3: 77, // G4
    5: 73, // B3
    7: 69, // D3
    9: 65, // F2
  };

  private readonly BASS_NOTE_POSITIONS = {
    // Line notes (from top)
    0: 71, // F3 (top line)
    2: 67, // A2
    4: 63, // C2
    6: 59, // B1 (middle line)
    8: 55, // G1
    10: 51, // E1 (bottom line)
    // Space notes
    1: 69, // D3
    3: 65, // F2
    5: 61, // A1
    7: 57, // C1
    9: 53, // E0
  };

  /**
   * Classify a single note into a voice
   */
  classifyNote(note: DetectedNote): ClassifiedNote {
    let voice: Voice;

    // Primary classification: by pitch range
    if (this.isInRange(note.pitch, this.VOICE_RANGES[Voice.SOPRANO])) {
      voice = Voice.SOPRANO;
    } else if (
      this.isInRange(note.pitch, this.VOICE_RANGES[Voice.ALTO])
    ) {
      voice = Voice.ALTO;
    } else if (
      this.isInRange(note.pitch, this.VOICE_RANGES[Voice.TENOR])
    ) {
      voice = Voice.TENOR;
    } else {
      voice = Voice.BASS;
    }

    // Secondary refinement: by staff position if available
    if (note.staffPosition !== undefined) {
      const refinedVoice = this.classifyByStaffPosition(
        note.staffPosition,
        voice
      );
      if (refinedVoice) {
        voice = refinedVoice;
      }
    }

    return {
      ...note,
      voice,
      channel: this.VOICE_CHANNELS[voice],
    };
  }

  /**
   * Classify multiple notes
   */
  classifyNotes(notes: DetectedNote[]): ClassifiedNote[] {
    return notes.map((note) => this.classifyNote(note));
  }

  /**
   * Classify by staff position (treble clef assumed)
   */
  private classifyByStaffPosition(
    position: number,
    preferredVoice: Voice
  ): Voice | null {
    // Treble clef: high positions = higher pitches = soprano/alto
    // Bass clef: low positions = lower pitches = tenor/bass

    if (position <= 2) {
      return Voice.SOPRANO;
    } else if (position <= 4) {
      return Voice.ALTO;
    } else if (position <= 7) {
      return Voice.TENOR;
    } else {
      return Voice.BASS;
    }
  }

  /**
   * Get pitch from staff position (treble clef)
   */
  getPitchFromTreblePosition(position: number): number {
    return this.TREBLE_NOTE_POSITIONS[position] || 60;
  }

  /**
   * Get pitch from staff position (bass clef)
   */
  getPitchFromBassPosition(position: number): number {
    return this.BASS_NOTE_POSITIONS[position] || 48;
  }

  /**
   * Get voice range
   */
  getVoiceRange(voice: Voice): { min: number; max: number } {
    return this.VOICE_RANGES[voice];
  }

  /**
   * Get all voices
   */
  getAllVoices(): Voice[] {
    return [Voice.SOPRANO, Voice.ALTO, Voice.TENOR, Voice.BASS];
  }

  /**
   * Get MIDI channel for voice
   */
  getChannelForVoice(voice: Voice): number {
    return this.VOICE_CHANNELS[voice];
  }

  /**
   * Filter notes by voice
   */
  getNotesByVoice(notes: ClassifiedNote[], voice: Voice): ClassifiedNote[] {
    return notes.filter((note) => note.voice === voice);
  }

  /**
   * Get dominant voice in a sequence
   */
  getDominantVoice(notes: ClassifiedNote[]): Voice {
    const voiceCounts: { [key in Voice]: number } = {
      [Voice.SOPRANO]: 0,
      [Voice.ALTO]: 0,
      [Voice.TENOR]: 0,
      [Voice.BASS]: 0,
    };

    notes.forEach((note) => {
      voiceCounts[note.voice]++;
    });

    return Object.entries(voiceCounts).reduce((a, b) =>
      b[1] > voiceCounts[a as Voice] ? (b[0] as Voice) : a
    ) as Voice;
  }

  /**
   * Helper: Check if pitch is in range
   */
  private isInRange(
    pitch: number,
    range: { min: number; max: number }
  ): boolean {
    return pitch >= range.min && pitch <= range.max;
  }
}

// Export singleton instance
export const voiceClassifier = new VoiceClassifier();
