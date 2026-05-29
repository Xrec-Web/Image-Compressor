/// <reference lib="webworker" />
//
// AVIF encoding worker.
//
// @jsquash/avif ships the multi-threaded encoder (avif_enc_mt.wasm) whenever
// the page is cross-origin isolated. That encoder spins up pthreads and then
// *blocks the calling thread* waiting on them — which, on the main thread,
// freezes the UI and triggers Emscripten's "Blocking on the main thread is
// very dangerous" warning. Running it in this worker keeps the main thread
// responsive and silences the warning (the worker is allowed to block).

import { encode } from '@jsquash/avif';

interface EncodeRequest {
  id: number;
  buffer: ArrayBuffer; // detached pixel buffer transferred from the main thread
  width: number;
  height: number;
  cqLevel?: number; // AVIF constant-quality level (0 = best … 63 = worst)
  speed?: number;
}

self.onmessage = async (e: MessageEvent<EncodeRequest>) => {
  const { id, buffer, width, height, cqLevel, speed } = e.data;
  try {
    const imageData = new ImageData(new Uint8ClampedArray(buffer), width, height);
    const out = await encode(imageData, { cqLevel, speed });
    // Transfer the result back to avoid a copy.
    (self as DedicatedWorkerGlobalScope).postMessage({ id, buffer: out }, [out]);
  } catch (err) {
    (self as DedicatedWorkerGlobalScope).postMessage({
      id,
      error: err instanceof Error ? err.message : 'AVIF encode failed',
    });
  }
};
