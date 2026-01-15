import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { prisma } from '../../lib/prisma'
// Extend Express Request to include user data
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: number
        email: string
        userId: number
        roles: string[]
      }
      token?: string
    }
  }
}

interface TokenPayload {
  id: number
  email: string
  userId: number
  iat: number
  exp: number
}

export const authMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = extractToken(req)

    if (!token) {
      res.status(401).json({ error: 'No token provided' })
      return
    }

    const decoded = verifyToken(token)
    const session = await prisma.session.findUnique({
      where: { token },
      include: {
        user: {
          include: {
            roles: true,
            profile: true,
          },
        },
      },
    })

    if (!session || session.revokedAt) {
      res.status(401).json({ error: 'Invalid or revoked session' })
      return
    }

    if (new Date() > session.expiresAt) {
      res.status(401).json({ error: 'Session expired' })
      return
    }

    req.user = {
      id: session.user.id,
      email: session.user.email!,
      userId: session.user.id,
      roles: session.user.roles.map((ur) => ur.role),
    }
    req.token = token

    next()
  } catch (error) {
    res.status(401).json({ error: 'Authentication failed' })
  }
}

export const optionalAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = extractToken(req)

    if (!token) {
      next()
      return
    }

    const session = await prisma.session.findUnique({
      where: { token },
      include: {
        user: {
          include: {
            roles: true,
            profile: true,
          },
        },
      },
    })

    if (session && !session.revokedAt && new Date() <= session.expiresAt) {
      req.user = {
        id: session.user.id,
        email: session.user.email!,
        userId: session.user.id,
        roles: session.user.roles.map((ur) => ur.role),
      }
      req.token = token
    }

    next()
  } catch (error) {
    next()
  }
}

export const requireRole = (...roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' })
      return
    }

    const hasRole = req.user.roles.some((role) => roles.includes(role))

    if (!hasRole) {
      res
        .status(403)
        .json({
          error: `Required role(s): ${roles.join(', ')}`,
        })
      return
    }

    next()
  }
}

export const requirePermission = (permission: string) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' })
      return
    }

    try {
      const role = await prisma.role.findFirst({
        where: {
          name: {
            in: req.user.roles,
          },
        },
      })

      if (!role) {
        res.status(403).json({ error: 'No role found' })
        return
      }

      const permissions = (role.permissions as string[]) || []

      if (!permissions.includes(permission)) {
        res.status(403).json({ error: `Permission required: ${permission}` })
        return
      }

      next()
    } catch (error) {
      res.status(500).json({ error: 'Permission check failed' })
    }
  }
}

export const requireActive = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' })
    return
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
    })

    if (!user || !user.isActive) {
      res.status(403).json({ error: 'User account is inactive' })
      return
    }

    next()
  } catch (error) {
    res.status(500).json({ error: 'Account status check failed' })
  }
}

// Helper functions
function extractToken(req: Request): string | null {
  const authHeader = req.headers.authorization

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null
  }

  return authHeader.substring(7)
}

function verifyToken(token: string): TokenPayload {
  const secret = process.env.JWT_SECRET || 'your-secret-key'
  return jwt.verify(token, secret) as TokenPayload
}

export const createSession = async (
  userId: number,
  expiresIn: number = 24 * 60 * 60 * 1000 // 24 hours
) => {
  const token = jwt.sign(
    { id: userId, userId },
    process.env.JWT_SECRET || 'your-secret-key',
    { expiresIn: expiresIn / 1000 }
  )

  return prisma.session.create({
    data: {
      userId,
      token,
      expiresAt: new Date(Date.now() + expiresIn),
    },
  })
}

export const revokeSession = async (token: string) => {
  return prisma.session.update({
    where: { token },
    data: { revokedAt: new Date() },
  })
}