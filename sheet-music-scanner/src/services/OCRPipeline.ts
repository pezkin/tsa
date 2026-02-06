/**
 * OCR Pipeline Service
 * Orchestrates image processing → model inference → voice classification → MIDI generation
 */

import * as tf from '@tensorflow/tfjs';
import { TFLiteModelLoader, modelLoader } from './TFLiteModelLoader';
import { VoiceClassifier, Voice, voiceClassifier } from './VoiceClassifier';
import { MIDIGenerator, midiGenerator } from './MIDIGenerator';
import { ImagePreprocessor, imagePreprocessor } from './ImagePreprocessor';

export interface DetectedNote {
  pitch: number; // MIDI note number
  confidence: number; // Model confidence (0-1)
  duration: number; // Duration in milliseconds
  x: number; // Position in image
  y: number;
}

export interface ClassifiedNote extends DetectedNote {
  voice: Voice;
}

export interface PipelineOptions {
  confidenceThreshold?: number;
  minDuration?: number;
  maxDuration?: number;
  tempo?: number;
}

export interface PipelineResult {
  imageShape: { width: number; height: number };
  detectedNotes: DetectedNote[];
  classifiedNotes: ClassifiedNote[];
  midiSequence: any; // MIDISequence type
  processingTime: number;
  stats: {
    totalPatchesExtracted: number;
    patchesAboveThreshold: number;
    notesDetected: number;
    averageConfidence: number;
  };
}

export class OCRPipeline {
  private modelLoader: TFLiteModelLoader;
  private voiceClassifier: VoiceClassifier;
  private midiGenerator: MIDIGenerator;
  private preprocessor: ImagePreprocessor;
  private options: PipelineOptions;
  private isInitialized = false;
  private model: tf.LayersModel | null = null;
  private isCancelled = false;

  constructor(options?: PipelineOptions) {
    this.modelLoader = modelLoader;
    this.voiceClassifier = voiceClassifier;
    this.midiGenerator = midiGenerator;
    this.preprocessor = imagePreprocessor;

    this.options = {
      confidenceThreshold: 0.5,
      minDuration: 100,
      maxDuration: 4000,
      tempo: 120,
      ...options,
    };
  }

  /**
   * Initialize pipeline (load models)
   */
  async initialize(): Promise<void> {
    try {
      console.log('Initializing OCR Pipeline...');

      // Load OCR model
      this.model = await this.modelLoader.loadOCRModel();

      this.isInitialized = true;
      console.log('OCR Pipeline initialized successfully');
    } catch (error) {
      console.error('Error initializing OCR Pipeline:', error);
      throw error;
    }
  }

  /**
   * Check if pipeline is initialized
   */
  isReady(): boolean {
    return this.isInitialized && !!this.model;
  }

  /**
   * Process image end-to-end: image → notes → voices → MIDI
   */
  async processImage(imageURI: string): Promise<PipelineResult> {
    const startTime = Date.now();
    this.isCancelled = false;

    try {
      if (!this.isReady()) {
        throw new Error('Pipeline not initialized. Call initialize() first.');
      }

      // Step 1: Image preprocessing
      console.log('Step 1: Preprocessing image...');
      const patches = await this.preprocessor.processImageURI(imageURI);

      if (this.isCancelled) throw new Error('Processing cancelled');

      const filteredPatches = this.preprocessor.filterPatches(
        patches,
        this.options.confidenceThreshold || 0.3
      );

      // Step 2: OCR model inference
      console.log('Step 2: Running OCR inference...');
      const detectedNotes = await this.runInference(filteredPatches);

      if (this.isCancelled) throw new Error('Processing cancelled');

      // Step 3: Voice classification
      console.log('Step 3: Classifying voices...');
      const classifiedNotes = this.voiceClassifier.classifyNotes(detectedNotes);

      // Step 4: MIDI generation
      console.log('Step 4: Generating MIDI...');
      const midiSequence = this.midiGenerator.generateSequence(
        classifiedNotes,
        this.options.tempo || 120
      );

      const processingTime = Date.now() - startTime;

      // Calculate statistics
      const stats = {
        totalPatchesExtracted: patches.length,
        patchesAboveThreshold: filteredPatches.length,
        notesDetected: detectedNotes.length,
        averageConfidence:
          detectedNotes.length > 0
            ? detectedNotes.reduce((sum, n) => sum + n.confidence, 0) /
              detectedNotes.length
            : 0,
      };

      console.log('Pipeline processing complete:', {
        processingTime: `${processingTime}ms`,
        stats,
      });

      return {
        imageShape: {
          // Image dimensions from preprocessor's canvas (the loadImageData target size)
          width: patches.length > 0 ? Math.max(...patches.map(p => p.x)) + this.preprocessor.getConfig().patchSize : 1024,
          height: patches.length > 0 ? Math.max(...patches.map(p => p.y)) + this.preprocessor.getConfig().patchSize : 768,
        },
        detectedNotes,
        classifiedNotes,
        midiSequence,
        processingTime,
        stats,
      };
    } catch (error) {
      console.error('Error processing image:', error);
      throw error;
    }
  }

  /**
   * Run OCR model inference on patches
   */
  private async runInference(patches: any[]): Promise<DetectedNote[]> {
    const detectedNotes: DetectedNote[] = [];

    try {
      // Batch patches
      const batchSize = 32;
      const batches = this.preprocessor.batchPatches(patches, batchSize);

      let patchIndex = 0;
      for (const batch of batches) {
        try {
          // Track which patches are in this batch
          const batchStartIdx = patchIndex;
          const currentBatchSize = Math.min(batchSize, patches.length - patchIndex);

          // Run inference on batch
          const predictions = await this.modelLoader.predict(batch as tf.Tensor);

          // Parse predictions
          const predictionData = await predictions.data();

          // Calculate outputs per patch (total predictions / patches in batch)
          const outputsPerPatch = currentBatchSize > 0
            ? Math.floor(predictionData.length / currentBatchSize)
            : predictionData.length;

          // Iterate through each patch's predictions
          for (let patchIdx = 0; patchIdx < currentBatchSize; patchIdx++) {
            const sourcePatch = patches[batchStartIdx + patchIdx];
            const patchOutputStart = patchIdx * outputsPerPatch;

            for (let j = 0; j < outputsPerPatch; j++) {
              const confidence = predictionData[patchOutputStart + j];

              if (confidence >= (this.options.confidenceThreshold || 0.5)) {
                const midiNote = this.outputToPitch(j, outputsPerPatch);

                detectedNotes.push({
                  pitch: midiNote,
                  confidence,
                  duration: this.options.minDuration || 100,
                  x: sourcePatch?.x ?? 0,
                  y: sourcePatch?.y ?? 0,
                });
              }
            }
          }

          predictions.dispose();
          patchIndex += currentBatchSize;
        } catch (error) {
          console.error('Error in inference batch:', error);
          patchIndex += batchSize;
          continue;
        }
      }
    } catch (error) {
      console.error('Error running inference:', error);
    }

    return detectedNotes;
  }

  /**
   * Convert model output index to MIDI pitch
   */
  private outputToPitch(index: number, totalOutputs: number): number {
    // Assuming model outputs probabilities for notes C3 (36) to C7 (96)
    const minMIDI = 36;
    const maxMIDI = 96;
    const totalNotes = maxMIDI - minMIDI + 1;

    // Map index to MIDI range
    const midiNote = minMIDI + (index % totalNotes);
    return midiNote;
  }

  /**
   * Get pipeline configuration
   */
  getConfig(): PipelineOptions {
    return this.options;
  }

  /**
   * Update pipeline configuration
   */
  updateConfig(newOptions: Partial<PipelineOptions>): void {
    this.options = { ...this.options, ...newOptions };
  }

  /**
   * Process multiple images in batch
   */
  async processBatch(imageURIs: string[]): Promise<PipelineResult[]> {
    const results: PipelineResult[] = [];

    for (const uri of imageURIs) {
      try {
        const result = await this.processImage(uri);
        results.push(result);
      } catch (error) {
        console.error(`Error processing image ${uri}:`, error);
        continue;
      }
    }

    return results;
  }

  /**
   * Cancel processing (if async operations are in progress)
   */
  async cancel(): Promise<void> {
    this.isCancelled = true;
    console.log('Processing cancellation requested');
  }

  /**
   * Clean up resources
   */
  async dispose(): Promise<void> {
    try {
      if (this.model) {
        this.model.dispose();
      }
      await this.modelLoader.dispose();
      this.isInitialized = false;
    } catch (error) {
      console.error('Error disposing pipeline:', error);
    }
  }

  /**
   * Get processing statistics
   */
  getStats(): { isInitialized: boolean; modelLoaded: boolean } {
    return {
      isInitialized: this.isInitialized,
      modelLoaded: !!this.model,
    };
  }
}

// Export singleton instance
export const ocrPipeline = new OCRPipeline();
