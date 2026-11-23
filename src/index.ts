
import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

import categoryRoutes from './routes/category.routes.js';
import productRoutes from './routes/product.routes.js';
import orderRoutes from './routes/order.routes.js';
import adminRoutes from './routes/admin/admin.routes.js';
import authRoutes from './routes/auth.routes.js';
import couponRoutes from './routes/coupon.routes.js';
import contactRoutes from './routes/contact.routes.js';
import uploadRoutes from './routes/upload.routes.js';
import blogRoutes from './routes/blog.routes.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like curl, postman, server-to-server) or all frontend origins
      if (!origin || origin.startsWith('http://localhost:') || origin.endsWith('.vercel.app') || origin === process.env.FRONTEND_URL) {
        return callback(null, true);
      }
      return callback(null, true);
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  })
);

app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/coupons', couponRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/blogs', blogRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api/admin', adminRoutes);

// Health Check
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    brand: 'ZakJomok',
    tagline: 'Good Food • Better You',
    timestamp: new Date().toISOString(),
  });
});

// Root
app.get('/', (req: Request, res: Response) => {
  res.json({
    message: '🌿 Welcome to ZakJomok Healthy Food API',
    version: '1.0.0',
    endpoints: {
      auth: '/api/auth',
      categories: '/api/categories',
      products: '/api/products',
      orders: '/api/orders',
      coupons: '/api/coupons',
      contact: '/api/contact',
      blogs: '/api/blogs',
      admin: '/api/admin',
    },
  });
});

app.listen(port, () => {
  console.log(`🌿 ZakJomok Backend running at http://localhost:${port}`);
});
