import { category } from './helpers';
const t = category('audio');
const CODEC = 'Decoding uses your browser’s codecs, so formats it cannot play (often AAC or other proprietary codecs) will not load.';

export const AUDIO_TOOLS = [
  t('audio-metadata-inspector', 'Audio Metadata Inspector', 'file', 'Read the container, codec, channels, sample rate, bit depth, duration and tags (title, artist, album) from WAV, FLAC, MP3 and Ogg headers.', { keywords: ['id3', 'tags', 'codec', 'bitrate'], featured: true, statusNote: 'Header parsing covers WAV, FLAC, MP3 and Ogg. Other formats report only what the browser can decode.' }),
  t('audio-duration-viewer', 'Audio Duration Viewer', 'files', 'Show the duration of one or many audio files and the combined total.', { keywords: ['length', 'time', 'minutes'] }),
  t('audio-format-support-checker', 'Audio Format Support Checker', 'none', 'Test which audio formats and codecs this browser can play, decode and record, using the browser’s own capability APIs.', { keywords: ['codecs', 'mp3', 'aac', 'opus', 'flac', 'compatibility'] }),
  t('audio-file-size-inspector', 'Audio File Size Inspector', 'file', 'Break down file size against duration: effective bitrate, bytes per second and how much is metadata.', { keywords: ['bitrate', 'megabytes per minute', 'size'] }),
  t('audio-waveform-preview', 'Audio Waveform Preview', 'file', 'Decode a file with the Web Audio API and draw its pixel waveform with peak and RMS levels, plus a player.', { keywords: ['visualize', 'wave', 'peaks'], statusNote: CODEC }),
  t('audio-trimmer', 'Audio Trimmer', 'file', 'Cut audio to a start and end time and export the result as WAV, with fade options.', { keywords: ['cut', 'crop audio', 'clip'], statusNote: `${CODEC} Output is WAV only.` }),
  t('audio-volume-normalizer', 'Audio Volume Normalizer', 'file', 'Measure peak and RMS level and apply gain so the loudest peak reaches a target level (dBFS). Exports WAV.', { keywords: ['loudness', 'gain', 'amplify', 'peak'], statusNote: `${CODEC} This is peak normalisation, not LUFS loudness matching.` }),
  t('audio-channel-inspector', 'Audio Channel Inspector', 'file', 'Report channel count and, per channel, peak and RMS level plus left-right correlation to spot mono-as-stereo or out-of-phase audio.', { keywords: ['stereo', 'mono', 'phase', 'balance'], statusNote: CODEC }),
  t('audio-sample-rate-inspector', 'Audio Sample Rate Inspector', 'file', 'Show the file’s native sample rate and the rate your device’s audio engine decodes at, and flag when resampling occurs.', { keywords: ['hz', 'khz', '44100', '48000'] }),
  t('audio-bit-depth-inspector', 'Audio Bit Depth Inspector', 'file', 'Report bit depth for WAV and FLAC and explain why lossy formats have none, with the theoretical dynamic range.', { keywords: ['16 bit', '24 bit', 'dynamic range', 'pcm'] }),
  t('audio-playback-speed-controller', 'Audio Playback Speed Controller', 'file', 'Export audio at 0.25x to 4x speed as WAV. Pitch changes with speed (resampling); there is no pitch-preserving stretch.', { keywords: ['tempo', 'slow down', 'speed up'], statusNote: `${CODEC} Exported speed changes alter pitch (tape-style); live playback can preserve pitch.` }),
  t('audio-silence-detector', 'Audio Silence Detector', 'file', 'Find silent stretches below a threshold and list their start, end and length.', { keywords: ['gaps', 'quiet', 'dead air'], statusNote: CODEC }),
  t('audio-segment-extractor', 'Audio Segment Extractor', 'file', 'Cut several segments from one file in a single pass and download them as separate WAV files in a ZIP.', { keywords: ['split audio', 'chapters', 'multiple clips'], statusNote: `${CODEC} Output is WAV only.` }),
  t('audio-metadata-exporter', 'Audio Metadata Exporter', 'files', 'Export header metadata for many audio files as one JSON or CSV file.', { keywords: ['export tags', 'json', 'csv', 'library'] }),
  t('audio-file-comparison', 'Audio File Comparison', 'files', 'Compare two audio files: header fields, duration, peak and RMS, and whether the decoded samples are identical.', { keywords: ['compare audio', 'identical', 'diff'], statusNote: CODEC }),
];
