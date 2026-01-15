import crypto from 'crypto';
import type { Express } from 'express';
import fs from 'fs';
import path from 'path';

const MEDIA_DIR = path.join(process.cwd(), 'attached_assets', 'media');

// Ensure media directory exists
if (!fs.existsSync(MEDIA_DIR)) {
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
}

interface MediaDownloadResult {
  success: boolean;
  url?: string;
  error?: string;
}

// Allowed Instagram/Facebook CDN domains for security
const ALLOWED_MEDIA_DOMAINS = [
  'scontent.cdninstagram.com',
  'cdninstagram.com',
  'instagram.com',
  'fbcdn.net',
  'facebook.com',
  'lookaside.fbsbx.com',
];

// Maximum media file size (50MB)
const MAX_MEDIA_SIZE = 50 * 1024 * 1024;

function isAllowedMediaUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    return ALLOWED_MEDIA_DOMAINS.some(domain => 
      parsedUrl.hostname.endsWith(domain) || parsedUrl.hostname === domain
    );
  } catch {
    return false;
  }
}

export async function downloadAndStoreMedia(
  mediaUrl: string,
  messageId: string
): Promise<MediaDownloadResult> {
  try {
    // Security: Validate URL is from allowed Instagram/Facebook CDN
    if (!isAllowedMediaUrl(mediaUrl)) {
      console.log(`[Media Storage] Rejected URL from non-allowed domain: ${mediaUrl.substring(0, 50)}...`);
      return {
        success: false,
        error: 'Media URL from non-allowed domain'
      };
    }
    
    const response = await fetch(mediaUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch media: ${response.status}`);
    }
    
    // Security: Check content length before downloading
    const contentLength = response.headers.get('content-length');
    if (contentLength && parseInt(contentLength) > MAX_MEDIA_SIZE) {
      throw new Error(`Media too large: ${contentLength} bytes`);
    }
    
    const buffer = Buffer.from(await response.arrayBuffer());
    
    // Security: Check actual size after download
    if (buffer.length > MAX_MEDIA_SIZE) {
      throw new Error(`Downloaded media too large: ${buffer.length} bytes`);
    }
    
    const extension = getExtensionFromUrl(mediaUrl) || 'jpg';
    const hash = crypto.createHash('md5').update(messageId).digest('hex');
    const filename = `${hash}.${extension}`;
    const filepath = path.join(MEDIA_DIR, filename);

    fs.writeFileSync(filepath, buffer);

    const publicUrl = `/api/media/${filename}`;

    return {
      success: true,
      url: publicUrl
    };
  } catch (error: any) {
    console.error('[Media Storage] Erro ao baixar e armazenar mídia:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

function getExtensionFromUrl(url: string): string | null {
  const match = url.match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
  return match ? match[1] : null;
}

export function setupMediaEndpoint(app: Express) {
  app.get('/api/media/:filename', async (req, res) => {
    try {
      const { filename } = req.params;
      const filepath = path.join(MEDIA_DIR, filename);

      if (!fs.existsSync(filepath)) {
        return res.status(404).json({ error: 'Media not found' });
      }

      const data = fs.readFileSync(filepath);

      const ext = filename.split('.').pop()?.toLowerCase();
      const contentTypes: Record<string, string> = {
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'gif': 'image/gif',
        'mp4': 'video/mp4',
        'webm': 'video/webm',
        'mov': 'video/quicktime',
        'mp3': 'audio/mpeg',
        'wav': 'audio/wav',
        'ogg': 'audio/ogg',
        'm4a': 'audio/mp4',
        'aac': 'audio/aac',
        'webp': 'image/webp',
      };

      const contentType = contentTypes[ext || ''] || 'application/octet-stream';

      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=31536000');
      res.send(data);
    } catch (error: any) {
      console.error('[Media Endpoint] Erro ao servir mídia:', error.message);
      res.status(500).json({ error: 'Failed to serve media' });
    }
  });
}
