import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

let ffmpeg: FFmpeg | null = null;
let ffmpegLoading = false;
let ffmpegLoaded = false;

// Initialize FFmpeg lazily
async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpegLoaded && ffmpeg) return ffmpeg;
  if (ffmpegLoading) {
    // Wait for existing load
    while (ffmpegLoading) {
      await new Promise((r) => setTimeout(r, 100));
    }
    if (ffmpeg) return ffmpeg;
  }

  ffmpegLoading = true;
  try {
    ffmpeg = new FFmpeg();

    // Load FFmpeg core from CDN
    const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm";
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
    });

    ffmpegLoaded = true;
    return ffmpeg;
  } finally {
    ffmpegLoading = false;
  }
}

export type ExportProgress = {
  stage: "recording" | "processing" | "done";
  progress: number; // 0-1
  message: string;
};

// Record canvas to WebM with audio from audio context
export async function recordWebM(
  canvas: HTMLCanvasElement,
  audioDestination: MediaStreamAudioDestinationNode | null,
  durationMs: number | null, // null = manual stop
  fps: number,
  onProgress?: (p: ExportProgress) => void,
  stopSignal?: { stop: boolean }
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const canvasStream = canvas.captureStream(fps);
    
    // Combine video and audio streams
    const tracks = [...canvasStream.getTracks()];
    if (audioDestination) {
      const audioTracks = audioDestination.stream.getAudioTracks();
      tracks.push(...audioTracks);
    }
    
    const combinedStream = new MediaStream(tracks);
    
    // Try codecs in order of preference
    const codecs = [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm;codecs=vp9",
      "video/webm;codecs=vp8",
      "video/webm",
    ];
    
    let mimeType = "video/webm";
    for (const codec of codecs) {
      if (MediaRecorder.isTypeSupported(codec)) {
        mimeType = codec;
        break;
      }
    }
    
    const recorder = new MediaRecorder(combinedStream, {
      mimeType,
      videoBitsPerSecond: 8_000_000,
    });
    
    const chunks: Blob[] = [];
    
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunks.push(e.data);
      }
    };
    
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: mimeType });
      onProgress?.({ stage: "done", progress: 1, message: "Complete!" });
      resolve(blob);
    };
    
    recorder.onerror = (e) => {
      reject(new Error("Recording failed"));
    };
    
    recorder.start(100); // Collect data every 100ms
    
    const startTime = Date.now();
    
    // Progress tracking
    const progressInterval = setInterval(() => {
      if (durationMs) {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(1, elapsed / durationMs);
        onProgress?.({
          stage: "recording",
          progress,
          message: `Recording... ${Math.floor(elapsed / 1000)}s / ${Math.floor(durationMs / 1000)}s`,
        });
      } else {
        const elapsed = Date.now() - startTime;
        onProgress?.({
          stage: "recording",
          progress: 0.5,
          message: `Recording... ${Math.floor(elapsed / 1000)}s`,
        });
      }
      
      // Check for stop signal
      if (stopSignal?.stop) {
        clearInterval(progressInterval);
        recorder.stop();
      }
    }, 200);
    
    // Auto-stop after duration
    if (durationMs) {
      setTimeout(() => {
        clearInterval(progressInterval);
        if (recorder.state === "recording") {
          recorder.stop();
        }
      }, durationMs);
    }
  });
}

// Export MP4 with audio using FFmpeg
export async function exportMP4(
  canvas: HTMLCanvasElement,
  audioUrl: string | null,
  durationMs: number,
  fps: number,
  onProgress?: (p: ExportProgress) => void
): Promise<Blob> {
  onProgress?.({ stage: "recording", progress: 0, message: "Recording video..." });
  
  // First record to WebM (video only)
  const webmBlob = await recordWebM(canvas, null, durationMs, fps, (p) => {
    if (p.stage === "recording") {
      onProgress?.({
        stage: "recording",
        progress: p.progress * 0.5, // Recording is first 50%
        message: p.message,
      });
    }
  });
  
  onProgress?.({ stage: "processing", progress: 0.5, message: "Loading FFmpeg..." });
  
  const ff = await getFFmpeg();
  
  onProgress?.({ stage: "processing", progress: 0.55, message: "Processing video..." });
  
  // Set up progress monitoring
  ff.on("progress", ({ progress }: { progress: number }) => {
    // progress is 0-1, map it to the processing phase (0.55 - 0.95)
    const mappedProgress = 0.55 + (progress * 0.4);
    onProgress?.({ 
      stage: "processing", 
      progress: mappedProgress, 
      message: `Processing video... ${Math.round(progress * 100)}%`
    });
  });
  
  // Write video to FFmpeg virtual filesystem
  const videoData = new Uint8Array(await webmBlob.arrayBuffer());
  await ff.writeFile("input.webm", videoData);
  
  // If we have audio, fetch and write it
  if (audioUrl) {
    onProgress?.({ stage: "processing", progress: 0.6, message: "Processing audio..." });
    const audioData = await fetchFile(audioUrl);
    await ff.writeFile("audio.mp3", audioData);
    
    onProgress?.({ stage: "processing", progress: 0.7, message: "Muxing audio and video..." });
    
    // Mux video + audio into MP4
    try {
      await ff.exec([
        "-i", "input.webm",
        "-i", "audio.mp3",
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "23",
        "-c:a", "aac",
        "-b:a", "192k",
        "-shortest",
        "-movflags", "+faststart",
        "output.mp4",
      ]);
    } catch (err) {
      console.error("FFmpeg muxing failed:", err);
      throw new Error("Failed to mux audio and video");
    }
  } else {
    onProgress?.({ stage: "processing", progress: 0.7, message: "Converting to MP4..." });
    
    // Just convert video to MP4
    try {
      await ff.exec([
        "-i", "input.webm",
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "23",
        "-an",
        "-movflags", "+faststart",
        "output.mp4",
      ]);
    } catch (err) {
      console.error("FFmpeg conversion failed:", err);
      throw new Error("Failed to convert video to MP4");
    }
  }
  
  onProgress?.({ stage: "processing", progress: 0.95, message: "Finalizing..." });
  
  // Read the output
  const output = await ff.readFile("output.mp4");
  
  // Cleanup
  await ff.deleteFile("input.webm");
  if (audioUrl) await ff.deleteFile("audio.mp3");
  await ff.deleteFile("output.mp4");
  
  onProgress?.({ stage: "done", progress: 1, message: "Complete!" });
  
  // Convert FileData to Blob - output can be Uint8Array or string
  if (typeof output === "string") {
    // If it's a string, encode it
    return new Blob([new TextEncoder().encode(output)], { type: "video/mp4" });
  }
  // It's a Uint8Array - create a new copy to ensure clean ArrayBuffer
  const arrayBuffer = new Uint8Array(output).buffer;
  return new Blob([arrayBuffer], { type: "video/mp4" });
}

// Download a blob as a file
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
