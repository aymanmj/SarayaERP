// src/auth/extractTokenFromCookie.ts

export function extractTokenFromCookie(cookieHeader: string): string | null {
  if (!cookieHeader) {
    return null;
  }

  // Parse cookies
  const cookies = cookieHeader.split(';').reduce((acc, cookie) => {
    const [name, value] = cookie.trim().split('=');
    acc[name] = value;
    return acc;
  }, {} as Record<string, string>);

  // Look for access_token or authentication token
  const token = cookies['access_token'] || cookies['auth_token'] || cookies['token'];
  
  return token || null;
}
