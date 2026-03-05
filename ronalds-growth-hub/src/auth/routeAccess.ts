import type { CanonicalRole } from "./canonicalRoles";
import {
  resolvePreferredHomeRouteByViewAccess,
  resolveViewPermissionByPath,
  type ModuleAction,
} from "./viewAccess";

export type RouteAccessRule = {
  viewKey: string;
  module?: string;
  action?: ModuleAction;
};

export const getRouteAccessRule = (pathname: string): RouteAccessRule | null => {
  const viewDefinition = resolveViewPermissionByPath(pathname);
  if (!viewDefinition) return null;
  return {
    viewKey: viewDefinition.key,
    module: viewDefinition.module,
    action: viewDefinition.action || "read",
  };
};

export const getPreferredHomeRoute = (
  roles: CanonicalRole[],
  hasViewAccess: (viewKey: string) => boolean
) => resolvePreferredHomeRouteByViewAccess(roles, hasViewAccess);
