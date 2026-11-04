const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];
const MAX_RAW_SIZE_BYTES = 10 * 1024 * 1024; // 10MB raw before client compression

export async function readAndCompressImageFile(
  file: File
): Promise<{ dataUrl: string; fileName: string }> {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    throw new Error('Format file harus berupa JPG, PNG, WEBP, atau SVG.');
  }
  if (file.size > MAX_RAW_SIZE_BYTES) {
    throw new Error('Ukuran file maksimal 10 MB.');
  }

  if (file.type === 'image/svg+xml') {
    const rawDataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Gagal membaca file SVG.'));
      reader.readAsDataURL(file);
    });
    return { dataUrl: rawDataUrl, fileName: file.name };
  }

  const imageBitmapUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Gagal membaca file gambar.'));
    reader.readAsDataURL(file);
  });

  const compressed = await new Promise<string>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const maxDim = 1280;
      let width = img.width;
      let height = img.height;
      if (width > maxDim || height > maxDim) {
        if (width >= height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(imageBitmapUrl);
        return;
      }
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => reject(new Error('File gambar rusak atau tidak dapat diproses.'));
    img.src = imageBitmapUrl;
  });

  return { dataUrl: compressed, fileName: file.name };
}
