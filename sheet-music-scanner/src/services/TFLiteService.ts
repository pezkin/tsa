/**
 * TensorFlow Lite Service
 * 
 * Wrapper around react-native-fast-tflite for model loading and inference
 * Handles:
 * - Model initialization and caching
 * - Inference execution
 * - Resource cleanup
 * - Error handling
 */

import { Platform } from 'react-native';

export interface ModelLoadOptions {
  numThreads?: number;
  useGPU?: boolean;
  useNNAPI?: boolean;
  quantized?: boolean;
}

export interface InferenceOptions {
  inputShape?: number[];
  outputShape?: number[];
}

/**
 * TFLiteService - Singleton for TensorFlow Lite operations
 */
export class TFLiteService {
  private static instance: TFLiteService;
  private tflite: any = null;
  private models: Map<string, any> = new Map();
  private isInitialized = false;

  private constructor() {}

  /**
   * Get singleton instance
   */
  static getInstance(): TFLiteService {
    if (!TFLiteService.instance) {
      TFLiteService.instance = new TFLiteService();
    }
    return TFLiteService.instance;
  }

  /**
   * Initialize TFLite interpreter
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Try to import react-native-fast-tflite
      const { TensorflowLite } = require('react-native-fast-tflite');
      this.tflite = new TensorflowLite();
      this.isInitialized = true;
      console.log('✅ TFLite initialized successfully');
    } catch (error) {
      // Fallback for development without react-native-fast-tflite
      console.warn('⚠️  react-native-fast-tflite not available, using mock implementation');
      this.setupMockTFLite();
      this.isInitialized = true;
    }
  }

  /**
   * Setup mock TFLite for development/testing
   */
  private setupMockTFLite(): void {
    this.tflite = {
      loadModel: async (path: string, options: any) => {
        console.log(`[Mock] Loading model from ${path}`);
        return {
          runInference: async (input: any) => {
            // Return mock output matching input shape
            return new Float32Array(input.length);
          },
        };
      },
    };
  }

  /**
   * Load a TFLite model from file path or require()
   * 
   * @param name - Model identifier
   * @param modelPath - Path to .tflite file (or require() result)
   * @param options - Loading options (GPU, threads, etc.)
   */
  async loadModel(
    name: string,
    modelPath: string | number,
    options: ModelLoadOptions = {}
  ): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    // Check if model already loaded
    if (this.models.has(name)) {
      console.log(`⚠️  Model '${name}' already loaded, skipping`);
      return;
    }

    try {
      const modelOptions = this.buildModelOptions(options);

      // Convert require() result to path if needed
      const resolvedPath = typeof modelPath === 'number' 
        ? this.resolveAssetPath(modelPath)
        : modelPath;

      console.log(`Loading TFLite model '${name}' with options:`, modelOptions);

      const model = await this.tflite.loadModel(resolvedPath, modelOptions);
      this.models.set(name, model);

      console.log(`✅ Loaded model: ${name}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`❌ Failed to load model '${name}':`, errorMessage);
      throw new Error(`Model loading failed: ${errorMessage}`);
    }
  }

  /**
   * Run inference on input data
   * 
   * @param modelName - Identifier of loaded model
   * @param input - Input tensor (Float32Array or Uint8Array)
   * @param options - Inference options
   * @returns Output tensor
   */
  async runInference(
    modelName: string,
    input: Float32Array | Uint8Array,
    options: InferenceOptions = {}
  ): Promise<Float32Array | Uint8Array> {
    const model = this.models.get(modelName);
    if (!model) {
      throw new Error(`Model not found: ${modelName}`);
    }

    try {
      const output = await model.runInference(input, options);
      return output;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Inference error for '${modelName}':`, errorMessage);
      throw error;
    }
  }

  /**
   * Run batch inference on multiple inputs
   * Useful for processing multiple regions/symbols
   * 
   * @param modelName - Model identifier
   * @param inputs - Array of input tensors
   * @returns Array of output tensors
   */
  async batchInference(
    modelName: string,
    inputs: (Float32Array | Uint8Array)[]
  ): Promise<(Float32Array | Uint8Array)[]> {
    const results: (Float32Array | Uint8Array)[] = [];

    for (const input of inputs) {
      try {
        const output = await this.runInference(modelName, input);
        results.push(output);
      } catch (error) {
        console.warn(`Batch inference error:`, error);
        // Continue with other inputs
      }
    }

    return results;
  }

  /**
   * Get information about a loaded model
   */
  getModelInfo(modelName: string): {
    name: string;
    isLoaded: boolean;
    inputShape?: number[];
    outputShape?: number[];
  } | null {
    const model = this.models.get(modelName);
    if (!model) return null;

    return {
      name: modelName,
      isLoaded: true,
      inputShape: model.getInputShape?.(),
      outputShape: model.getOutputShape?.(),
    };
  }

  /**
   * Get list of loaded models
   */
  getLoadedModels(): string[] {
    return Array.from(this.models.keys());
  }

  /**
   * Unload a specific model to free memory
   */
  async unloadModel(modelName: string): Promise<void> {
    const model = this.models.get(modelName);
    if (!model) return;

    try {
      if (model.close) {
        await model.close();
      }
      this.models.delete(modelName);
      console.log(`✅ Unloaded model: ${modelName}`);
    } catch (error) {
      console.warn(`Error unloading model ${modelName}:`, error);
    }
  }

  /**
   * Close and cleanup all resources
   */
  async close(): Promise<void> {
    try {
      // Close all models
      for (const [name, model] of this.models.entries()) {
        if (model?.close) {
          await model.close();
        }
      }

      this.models.clear();
      this.isInitialized = false;
      console.log('✅ TFLite service closed');
    } catch (error) {
      console.error('Error closing TFLite service:', error);
    }
  }

  /**
   * Check if GPU is available (Android NNAPI)
   */
  async isGPUAvailable(): Promise<boolean> {
    if (!this.tflite?.isGPUAvailable) {
      return false;
    }

    try {
      return await this.tflite.isGPUAvailable();
    } catch {
      return false;
    }
  }

  /**
   * Build model loading options for target platform
   */
  private buildModelOptions(options: ModelLoadOptions): any {
    const modelOptions: any = {
      threads: options.numThreads ?? 4,
      gpu: options.useGPU ?? false,
    };

    // Android-specific options
    if (Platform.OS === 'android') {
      modelOptions.nnapi = options.useNNAPI ?? false; // Use NNAPI for GPU
    }

    return modelOptions;
  }

  /**
   * Resolve require() asset to file path
   * In Expo/Metro, require() for assets returns a numeric module ID
   * that the asset system can resolve at runtime.
   */
  private resolveAssetPath(asset: number): string {
    return String(asset);
  }
}

export default TFLiteService;
