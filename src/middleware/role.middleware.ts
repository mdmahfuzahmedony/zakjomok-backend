import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth.middleware.js';

type UserRole =
  | 'CUSTOMER'
  | 'SUPER_ADMIN'
  | 'MANAGER'
  | 'VENDOR';

export const authorizeRoles = (...roles: UserRole[]) => {
  return (
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Please login first',
      });
    }

    if (!roles.includes(req.user.role as UserRole)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to access this resource',
      });
    }

    next();
  };
};