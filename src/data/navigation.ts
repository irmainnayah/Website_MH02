import { NavigationGroup } from "@/types/navigation";

export const navigationConfig: NavigationGroup[] = [
  {
    title: "Overview",
    items: [
      {
        name: "Dashboard",
        href: "/",
        iconName: "LayoutDashboard",
      },
    ],
  },
  {
    title: "Administration",
    requiredRole: "superadmin",
    items: [
      {
        name: "User Management (RBAC)",
        href: "/administration/users",
        iconName: "Users",
        requiredRole: "superadmin",
      },
    ],
  },
  {
    title: "Operation",
    items: [
      {
        name: "Installation",
        href: "/operations/installation",
        iconName: "Wrench",
      },
      {
        name: "Replacement",
        href: "/operations/replacement",
        iconName: "RefreshCw",
      },
      {
        name: "Removal",
        href: "/operations/removal",
        iconName: "Trash2",
      },
    ],
  },
  {
    title: "Support",
    items: [
      {
        name: "Troubleshoots",
        href: "/support/troubleshoots",
        iconName: "AlertTriangle",
      },
    ],
  },
  {
    title: "Reports & Logs",
    items: [
      {
        name: "Device Activity Log",
        href: "/reports/activity-log",
        iconName: "Activity",
      },
      {
        name: "Device Timeline",
        href: "/reports/timeline",
        iconName: "Clock",
      },
      {
        name: "Audit Logs",
        href: "/reports/audit-logs",
        iconName: "FileText",
      },
    ],
  },
];
