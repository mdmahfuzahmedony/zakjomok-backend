import { randomUUID } from 'node:crypto';
import { Router, Request, Response } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import prisma from '../lib/prisma.js';
import { protect } from '../middleware/auth.middleware.js';
import { authorizeRoles } from '../middleware/role.middleware.js';

const router = Router();
const db = prisma as any;

const maxImageSize = 8 * 1024 * 1024; // 8 MB max
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxImageSize, files: 1 },
});

// 1. POST upload image for live chat (Converts to WebP & stores in Supabase)
router.post('/upload-image', (req: Request, res: Response, next) => {
  upload.single('image')(req, res, (error: unknown) => {
    if (error instanceof multer.MulterError) {
      const message = error.code === 'LIMIT_FILE_SIZE'
        ? 'ছবির সাইজ সর্বোচ্চ ৮ MB হতে পারবে।'
        : 'একটি ছবি নির্বাচন করুন।';
      return res.status(400).json({ success: false, message });
    }
    if (error) {
      console.error('Error receiving chat image upload:', error);
      return res.status(400).json({ success: false, message: 'ছবি গ্রহণ করা যায়নি।' });
    }
    next();
  });
}, async (req: Request, res: Response) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ success: false, message: 'আপলোডের জন্য একটি ছবি নির্বাচন করুন।' });
    }

    const rawUrl = process.env.SUPABASE_URL || '';
    const supabaseUrl = rawUrl.replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '');
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const serviceRoleJwt = process.env.SUPABASE_SERVICE_ROLE_JWT || serviceRoleKey;
    const bucket = process.env.SUPABASE_STORAGE_BUCKET || 'product-images';

    if (!supabaseUrl || !serviceRoleKey || !serviceRoleJwt) {
      return res.status(503).json({ success: false, message: 'Supabase Storage কনফিগার করা নেই।' });
    }

    // Convert any uploaded image (JPG, PNG, GIF, etc.) to optimized WebP
    const webpBuffer = await sharp(file.buffer, { failOn: 'error' })
      .rotate()
      .webp({ quality: 82 })
      .toBuffer();

    const fileName = `${randomUUID()}.webp`;
    const objectPath = `chat/${fileName}`;
    const bucketPath = `${encodeURIComponent(bucket)}/chat/${encodeURIComponent(fileName)}`;

    const supabaseHeaders = {
      Authorization: `Bearer ${serviceRoleJwt}`,
      apikey: serviceRoleKey,
    };

    const uploadResponse = await fetch(`${supabaseUrl}/storage/v1/object/${bucketPath}`, {
      method: 'POST',
      headers: {
        ...supabaseHeaders,
        'Content-Type': 'image/webp',
        'x-upsert': 'false',
      },
      body: new Uint8Array(webpBuffer),
    });

    if (!uploadResponse.ok) {
      console.error('Supabase chat image upload failed:', uploadResponse.status, uploadResponse.statusText);
      return res.status(502).json({ success: false, message: 'Supabase Storage-এ ছবি আপলোড করা যায়নি।' });
    }

    const publicUrl = `${supabaseUrl}/storage/v1/object/public/${bucketPath}`;
    return res.status(201).json({
      success: true,
      data: { url: publicUrl, path: objectPath },
    });
  } catch (error) {
    console.error('Error processing and uploading chat image:', error);
    return res.status(500).json({ success: false, message: 'ছবি প্রসেস বা আপলোড করতে সমস্যা হয়েছে।' });
  }
});

// 2. GET messages for a specific session (Customer & Admin)
router.get('/:sessionId', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    if (!sessionId) {
      return res.status(400).json({ success: false, message: 'Session ID is required' });
    }

    const messages = await db.liveChatMessage.findMany({
      where: { sessionId: String(sessionId) },
      orderBy: { createdAt: 'asc' },
    });

    res.json({ success: true, data: messages });
  } catch (error) {
    console.error('Error fetching chat messages:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch messages' });
  }
});

// 3. POST send message from Customer
router.post('/', async (req: Request, res: Response) => {
  try {
    const { sessionId, text, imageUrl, senderName, senderPhone } = req.body;

    if (!sessionId || (!text?.trim() && !imageUrl?.trim())) {
      return res.status(400).json({
        success: false,
        message: 'Session ID and either message text or image are required',
      });
    }

    const newMessage = await db.liveChatMessage.create({
      data: {
        sessionId: String(sessionId),
        senderRole: 'CUSTOMER',
        senderName: senderName ? String(senderName).trim() : 'কাস্টমার',
        senderPhone: senderPhone ? String(senderPhone).trim() : null,
        text: text ? String(text).trim() : '',
        imageUrl: imageUrl ? String(imageUrl).trim() : null,
        isRead: false,
      },
    });

    res.status(201).json({ success: true, data: newMessage });
  } catch (error) {
    console.error('Error saving chat message:', error);
    res.status(500).json({ success: false, message: 'Failed to send message' });
  }
});

// 4. GET all active conversations for Admin Dashboard
router.get('/admin/conversations', protect, authorizeRoles('ADMIN'), async (_req: Request, res: Response) => {
  try {
    const allMessages = await db.liveChatMessage.findMany({
      orderBy: { createdAt: 'desc' },
    });

    // Group by sessionId
    const conversationsMap = new Map<string, any>();

    for (const msg of allMessages) {
      if (!conversationsMap.has(msg.sessionId)) {
        conversationsMap.set(msg.sessionId, {
          sessionId: msg.sessionId,
          customerName: msg.senderRole === 'CUSTOMER' ? msg.senderName : 'কাস্টমার',
          customerPhone: msg.senderPhone || null,
          lastMessage: msg.text || (msg.imageUrl ? '📷 [ছবি]' : ''),
          lastMessageAt: msg.createdAt,
          lastSenderRole: msg.senderRole,
          unreadCount: msg.senderRole === 'CUSTOMER' && !msg.isRead ? 1 : 0,
          totalMessages: 1,
        });
      } else {
        const conv = conversationsMap.get(msg.sessionId);
        conv.totalMessages += 1;
        if (msg.senderRole === 'CUSTOMER' && !msg.isRead) {
          conv.unreadCount += 1;
        }
        if (msg.senderPhone && !conv.customerPhone) {
          conv.customerPhone = msg.senderPhone;
        }
        if (msg.senderRole === 'CUSTOMER' && conv.customerName === 'কাস্টমার') {
          conv.customerName = msg.senderName;
        }
      }
    }

    const conversations = Array.from(conversationsMap.values());
    res.json({ success: true, data: conversations });
  } catch (error) {
    console.error('Error fetching admin conversations:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch conversations' });
  }
});

// 5. POST send reply from Admin
router.post('/admin/reply', protect, authorizeRoles('ADMIN'), async (req: Request, res: Response) => {
  try {
    const { sessionId, text, imageUrl } = req.body;

    if (!sessionId || (!text?.trim() && !imageUrl?.trim())) {
      return res.status(400).json({
        success: false,
        message: 'Session ID and either reply text or image are required',
      });
    }

    const replyMessage = await db.liveChatMessage.create({
      data: {
        sessionId: String(sessionId),
        senderRole: 'ADMIN',
        senderName: 'মাহফুজ (ZaKJomok)',
        text: text ? String(text).trim() : '',
        imageUrl: imageUrl ? String(imageUrl).trim() : null,
        isRead: true,
      },
    });

    // Mark customer messages in this session as read
    await db.liveChatMessage.updateMany({
      where: { sessionId: String(sessionId), senderRole: 'CUSTOMER', isRead: false },
      data: { isRead: true },
    });

    res.status(201).json({ success: true, data: replyMessage });
  } catch (error) {
    console.error('Error sending admin reply:', error);
    res.status(500).json({ success: false, message: 'Failed to send admin reply' });
  }
});

export default router;
