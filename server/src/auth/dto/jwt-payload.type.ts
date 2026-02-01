export type JwtPayload = {
  sub: number;       // user id
  username: string;
  hospitalId: number;
  roles: string[];   // مثل: ['ADMIN', 'DOCTOR']
};
