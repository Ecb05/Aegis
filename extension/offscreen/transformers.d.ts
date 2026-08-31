// Type declarations for @huggingface/transformers
// The npm package doesn't ship types for all exports

declare module '@huggingface/transformers' {
  export interface PipelineOptions {
    device?: 'webgpu' | 'wasm' | 'cpu';
    progress_callback?: (progress: any) => void;
    [key: string]: any;
  }

  export interface ClassificationResult {
    label: string;
    score: number;
  }

  export interface DetectionResult {
    label: string;
    score: number;
    box: { xmin: number; ymin: number; xmax: number; ymax: number };
  }

  export interface Pipeline {
    (input: any, options?: any): Promise<any>;
  }

  export function pipeline(
    task: string,
    model: string,
    options?: PipelineOptions
  ): Promise<Pipeline>;

  export const env: {
    allowLocalModels: boolean;
    useBrowserCache: boolean;
    backends: Record<string, any>;
  };
}
