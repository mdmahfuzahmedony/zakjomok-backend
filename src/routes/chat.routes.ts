import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma.js';
import { protect } from '../middleware/auth.middleware.js';
import { authorizeRoles } from '../middleware/role.middleware.js';

const router = Router();
const db = prisma as any;

// 1. GET messages for a specific session (Customer & Admin)
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

// 2. POST send message from Customer
router.post('/', async (req: Request, res: Response) => {
  try {
    const { sessionId, text, senderName, senderPhone } = req.body;

    if (!sessionId || !text || !text.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Session ID and text are required',
      });
    }

    const newMessage = await db.liveChatMessage.create({
      data: {
        sessionId: String(sessionId),
        senderRole: 'CUSTOMER',
        senderName: senderName ? String(senderName).trim() : 'কাস্টমার',
        senderPhone: senderPhone ? String(senderPhone).trim() : null,
        text: String(text).trim(),
        isRead: false,
      },
    });

    res.status(201).json({ success: true, data: newMessage });
  } catch (error) {
    console.error('Error saving chat message:', error);
    res.status(500).json({ success: false, message: 'Failed to send message' });
  }
});

// 3. GET all active conversations for Admin Dashboard
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
          lastMessage: msg.text,
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

// 4. POST send reply from Admin
router.post('/admin/reply', protect, authorizeRoles('ADMIN'), async (req: Request, res: Response) => {
  try {
    const { sessionId, text } = req.body;

    if (!sessionId || !text || !text.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Session ID and reply text are required',
      });
    }

    const replyMessage = await db.liveChatMessage.create({
      data: {
        sessionId: String(sessionId),
        senderRole: 'ADMIN',
        senderName: 'ZaKJomok সাপোর্ট',
        text: String(text).trim(),
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
