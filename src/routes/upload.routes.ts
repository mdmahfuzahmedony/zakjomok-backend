import { randomUUID } from 'node:crypto';
import { Router, Request, Response } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import { protect } from '../middleware/auth.middleware.js';
import { authorizeRoles } from '../middleware/role.middleware.js';

const router = Router();
const maxImageSize = 5 * 1024 * 1024;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxImageSize, files: 1 },
});

router.post(
  '/image',
  protect,
  authorizeRoles('SUPER_ADMIN', 'MANAGER'),
  (req: Request, res: Response, next) => {
    upload.single('image')(req, res, (error: unknown) => {
      if (error instanceof multer.MulterError) {
        const message =
          error.code === 'LIMIT_FILE_SIZE'
            ? 'ছবির সাইজ সর্বোচ্চ ৫ MB হতে পারবে।'
            : 'একটি ছবি নির্বাচন করুন।';
        return res.status(400).json({ success: false, message });
      }

      if (error) {
        console.error('Error receiving image upload:', error);
        return res.status(400).json({
          success: false,
          message: 'ছবি গ্রহণ করা যায়নি। আবার চেষ্টা করুন।',
        });
      }

      next();
    });
  },
  async (req: Request, res: Response) => {
    const file = req.file;
    if (!file) {
      return res.status(400).json({
        success: false,
        message: 'আপলোড করার জন্য একটি ছবি নির্বাচন করুন।',
      });
    }

    const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, '');
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const configuredServiceRoleJwt = process.env.SUPABASE_SERVICE_ROLE_JWT;
    const serviceRoleJwt =
      configuredServiceRoleJwt ||
      (serviceRoleKey && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(serviceRoleKey)
        ? serviceRoleKey
        : undefined);
    const bucket = process.env.SUPABASE_STORAGE_BUCKET;
    if (!supabaseUrl || !serviceRoleKey || !serviceRoleJwt || !bucket) {
      console.error(
        'Image upload is not configured. Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_STORAGE_BUCKET, and a valid service-role JWT.',
      );
      return res.status(503).json({
        success: false,
        message:
          'Storage API key-এর পাশাপাশি valid service-role JWT দরকার। নতুন sb_secret key হলে SUPABASE_SERVICE_ROLE_JWT-তে legacy service_role JWT দিন।',
      });
    }

    const folder = req.body.folder;
    if (folder !== 'products' && folder !== 'categories') {
      return res.status(400).json({
        success: false,
        message: 'ছবির ধরন products অথবা categories হতে হবে।',
      });
    }

    let webpBuffer: Buffer;
    try {
      webpBuffer = await sharp(file.buffer, {
        failOn: 'error',
        limitInputPixels: 40_000_000,
      })
        .rotate()
        .webp({ quality: 82 })
        .toBuffer();
    } catch (error) {
      console.warn('Unsupported or invalid image upload:', error);
      return res.status(415).json({
        success: false,
        message: 'এই ছবিটি পড়া যাচ্ছে না। JPEG, PNG, WebP, GIF বা অন্য supported image দিন।',
      });
    }

    const objectPath = `${folder}/${randomUUID()}.webp`;
    const bucketPath = [bucket, ...objectPath.split('/')]
      .map((segment) => encodeURIComponent(segment))
      .join('/');

    try {
      const supabaseHeaders = {
        Authorization: `Bearer ${serviceRoleJwt}`,
        apikey: serviceRoleKey,
      };
      const bucketResponse = await fetch(
        `${supabaseUrl}/storage/v1/bucket/${encodeURIComponent(bucket)}`,
        { headers: supabaseHeaders },
      );
      if (!bucketResponse.ok) {
        console.error(
          'Supabase Storage bucket lookup failed:',
          bucketResponse.status,
          bucketResponse.statusText,
        );
        return res.status(502).json({
          success: false,
          message: 'Supabase Storage bucket পাওয়া যায়নি; bucket name যাচাই করুন।',
        });
      }

      const bucketDetails = (await bucketResponse.json()) as { public?: boolean };
      if (!bucketDetails.public) {
        return res.status(409).json({
          success: false,
          message: 'ছবি দেখানোর জন্য Supabase Storage bucket-টি public করতে হবে।',
        });
      }

      const uploadResponse = await fetch(
        `${supabaseUrl}/storage/v1/object/${bucketPath}`,
        {
          method: 'POST',
          headers: {
            ...supabaseHeaders,
            'Content-Type': 'image/webp',
            'x-upsert': 'false',
          },
          body: new Uint8Array(webpBuffer),
        },
      );

      if (!uploadResponse.ok) {
        console.error(
          'Supabase image upload failed:',
          uploadResponse.status,
          uploadResponse.statusText,
        );
        return res.status(502).json({
          success: false,
          message: 'Supabase Storage-এ ছবি আপলোড করা যায়নি।',
        });
      }

      const publicUrl = `${supabaseUrl}/storage/v1/object/public/${bucketPath}`;
      return res.status(201).json({
        success: true,
        data: { url: publicUrl, path: objectPath },
      });
    } catch (error) {
      console.error('Supabase image upload request failed:', error);
      return res.status(502).json({
        success: false,
        message: 'Supabase Storage-এর সঙ্গে যোগাযোগ করা যায়নি।',
      });
    }
  },
);

export default router;
