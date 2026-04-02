import type { CanonicalRole } from "./canonicalRoles";
import {
  getViewPermissionDefinition,
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
  hasViewAccess: (viewKey: string) => boolean,
  preferredHomeViewKey?: string | null
) => {
  const normalizedPreferredHomeViewKey = String(preferredHomeViewKey || "")
    .toLowerCase()
    .trim();

  if (normalizedPreferredHomeViewKey && hasViewAccess(normalizedPreferredHomeViewKey)) {
    return (
      getViewPermissionDefinition(normalizedPreferredHomeViewKey)?.defaultPath || "/dashboard"
    );
  }

  return resolvePreferredHomeRouteByViewAccess(roles, hasViewAccess);
};
