import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import cookie from 'cookie';

const {
  JWT_SECRET = 'dev_secret',
  GOOGLE_CLIENT_ID = '',
} = process.env;

const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

export async function verifyGoogleIdToken(idToken: string) {
  const ticket = await googleClient.verifyIdToken({
    idToken,
    audience: GOOGLE_CLIENT_ID,
  });
  const payload = ticket.getPayload();
  if (!payload) throw new Error('Invalid Google token');
  return {
    sub: payload.sub,
    email: payload.email,
    name: payload.name,
    picture: payload.picture,
  };
}

export function signJwt(user: { sub: string; email?: string; name?: string; picture?: string }) {
  return jwt.sign(
    { sub: user.sub, email: user.email, name: user.name, picture: user.picture },
    JWT_SECRET,
    { expiresIn: '2h' }
  );
}

export function verifyJwt(token: string) {
  return jwt.verify(token, JWT_SECRET);
}

export function parseTokenFromCookie(headerCookie: string): string | null {
  if (!headerCookie) return null;
  const cookies = cookie.parse(headerCookie);
  return cookies['token'] || null;
}