export interface AuthContext {
  userId?: number;
  profileId?: number;
  roles?: string[];
  position?: string | null;
  isAdmin?: boolean;
  isHr?: boolean;
}
