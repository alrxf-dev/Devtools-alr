import { category } from './helpers';
const t = category('video');
const DEC = 'Playback-based features depend on codecs your browser can decode.';

export const VIDEO_TOOLS = [
  t('video-metadata-inspector', 'Video Metadata Inspector', 'file', 'Read container brands, duration, every track’s codec, size, frame rate and language from MP4/MOV files, plus what the browser reports.', { keywords: ['codec', 'tracks', 'mp4', 'mov'], featured: true, statusNote: 'Deep inspection covers MP4/MOV/M4V. For other containers only duration and dimensions reported by the browser are shown.' }),
  t('video-duration-viewer', 'Video Duration Viewer', 'files', 'Show duration for one or many videos and the combined total.', { keywords: ['length', 'time', 'minutes'], statusNote: DEC }),
  t('video-resolution-inspector', 'Video Resolution Inspector', 'files', 'Report pixel dimensions, display aspect ratio and a resolution class (SD, HD, Full HD, 4K).', { keywords: ['width', 'height', '1080p', '4k'], statusNote: DEC }),
  t('video-aspect-ratio-calculator', 'Video Aspect Ratio Calculator', 'none', 'Reduce dimensions to a ratio, or scale a width or height to keep a ratio such as 16:9.', { keywords: ['16:9', 'ratio', 'scale', 'letterbox'] }),
  t('video-frame-rate-inspector', 'Video Frame Rate Inspector', 'file', 'Report frame rate and total frame count from MP4/MOV sample tables.', { status: 'partial', statusNote: 'Exact for MP4/MOV. For other containers the rate is only estimated from playback and may be wrong.', keywords: ['fps', 'frames per second'] }),
  t('video-thumbnail-generator', 'Video Thumbnail Generator', 'file', 'Capture a still frame at a chosen time and download it as PNG or JPEG.', { keywords: ['poster', 'screenshot', 'still frame'], statusNote: DEC, featured: true }),
  t('video-preview-player', 'Video Preview Player', 'file', 'Play a local video in the browser’s own player (speed, fullscreen, picture-in-picture) with its detected properties.', { keywords: ['play', 'watch', 'frame step'], statusNote: DEC }),
  t('video-trim-tool', 'Video Trim Tool', 'file', 'Record a chosen section of the video to a new WebM file.', { status: 'partial', statusNote: 'Works by re-recording playback in real time (MediaRecorder), so a 30-second clip takes 30 seconds and is re-encoded with some quality loss. It is not a lossless cutter. Recording was not verified in automated tests: headless Chromium returned empty output. It reports an error instead of a broken file when nothing is recorded.', keywords: ['cut', 'clip', 'webm'] }),
  t('video-frame-extractor', 'Video Frame Extractor', 'file', 'Extract frames at fixed intervals or specific times and download them as a ZIP of images.', { keywords: ['frames', 'screenshots', 'images'], statusNote: DEC }),
  t('video-file-size-inspector', 'Video File Size Inspector', 'file', 'Break down size against duration: overall bitrate, per-track sizes (MP4/MOV) and storage per minute.', { keywords: ['bitrate', 'megabytes per minute', 'size'] }),
  t('video-codec-support-checker', 'Video Codec Support Checker', 'none', 'Test which video codecs and containers this browser can play, decode with WebCodecs and record.', { keywords: ['h264', 'hevc', 'av1', 'vp9', 'compatibility'] }),
  t('video-rotation-metadata-viewer', 'Video Rotation Metadata Viewer', 'file', 'Show the rotation stored in each MP4/MOV video track and the dimensions a player will display.', { keywords: ['orientation', 'portrait', 'display matrix', 'sideways'] }),
  t('video-audio-track-inspector', 'Video Audio Track Inspector', 'file', 'List every audio track with codec, channels, sample rate, language and duration (MP4/MOV).', { keywords: ['sound', 'languages', 'tracks'] }),
  t('video-contact-sheet-generator', 'Video Contact Sheet Generator', 'file', 'Build a grid of evenly spaced frames with timestamps as one PNG.', { keywords: ['storyboard', 'thumbnails grid', 'overview'], statusNote: DEC }),
  t('video-metadata-exporter', 'Video Metadata Exporter', 'files', 'Export metadata for many videos as one JSON or CSV file.', { keywords: ['export', 'json', 'csv', 'library'] }),
];
