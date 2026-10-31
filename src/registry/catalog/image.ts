import { category } from './helpers';
const t = category('image');

export const IMAGE_TOOLS = [
  t('image-resizer', 'Image Resizer', 'file', 'Resize an image by pixels or percentage with an aspect-ratio lock and choice of PNG, JPEG or WebP output.', { keywords: ['scale', 'dimensions', 'width', 'height'], featured: true }),
  t('image-cropper', 'Image Cropper', 'file', 'Crop to exact pixel coordinates (x, y, width, height) or a centred aspect ratio, then export the cropped area.', { keywords: ['trim', 'crop', 'region'] }),
  t('image-compressor', 'Image Compressor', 'file', 'Re-encode as JPEG or WebP at a chosen quality and compare the new size with the original before downloading.', { keywords: ['reduce size', 'optimize', 'quality', 'shrink'], featured: true, statusNote: 'Already-optimised images can come out larger; both sizes are shown so you can decide.' }),
  t('image-format-converter', 'Image Format Converter', 'file', 'Convert between PNG, JPEG and WebP. Transparent areas are flattened onto a colour you choose for JPEG.', { keywords: ['png', 'jpg', 'jpeg', 'webp', 'convert'], safety: 'SVG input is rasterised in an image context where scripts never run.' }),
  t('image-rotator', 'Image Rotator', 'file', 'Rotate by 90° steps or any angle, with optional canvas expansion and background colour.', { keywords: ['turn', 'angle', 'orientation'] }),
  t('image-flipper', 'Image Flipper', 'file', 'Mirror an image horizontally, vertically, or both.', { keywords: ['mirror', 'flip'] }),
  t('image-metadata-viewer', 'Image Metadata Viewer', 'file', 'Read dimensions, format, EXIF camera settings, GPS position and PNG text chunks directly from the file bytes.', { keywords: ['exif', 'gps', 'camera', 'iptc'], featured: true }),
  t('image-color-picker', 'Image Color Picker', 'file', 'Click anywhere on an image to read the exact pixel colour as HEX, RGB and HSL, and keep a list of picked colours.', { keywords: ['eyedropper', 'pixel', 'hex'] }),
  t('image-palette-extractor', 'Image Palette Extractor', 'file', 'Extract the dominant colours of an image using median-cut quantisation and copy them as HEX.', { keywords: ['dominant colors', 'swatches', 'theme'] }),
  t('image-to-base64', 'Image to Base64', 'file', 'Encode an image file as Base64 or a data URI, ready to paste into CSS or HTML.', { keywords: ['data uri', 'encode', 'inline'] }),
  t('base64-to-image', 'Base64 to Image', 'text', 'Decode Base64 or a data URI back into an image. The bytes are checked against PNG, JPEG, GIF, WebP and BMP signatures first.', { keywords: ['decode', 'data uri'], safety: 'SVG data is refused: only raster formats verified by file signature are displayed.' }),
  t('image-preview-generator', 'Image Preview Generator', 'file', 'Create thumbnails at several sizes at once and download them together as a ZIP.', { keywords: ['thumbnail', 'sizes', 'batch'] }),
  t('image-grayscale-converter', 'Image Grayscale Converter', 'file', 'Convert to grayscale using Rec. 709 luminance, with an optional sepia tone.', { keywords: ['black and white', 'monochrome', 'sepia'] }),
  t('image-watermark-tool', 'Image Watermark Tool', 'file', 'Stamp text onto an image with chosen position, size, colour, opacity and optional tiling.', { keywords: ['text overlay', 'copyright', 'stamp'] }),
  t('image-comparison-tool', 'Image Comparison Tool', 'files', 'Compare two images with a pixel-difference map and the percentage of pixels that differ.', { keywords: ['diff', 'before after', 'slider'] }),
];
