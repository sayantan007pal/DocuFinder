"use client";

import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import Link from "next/link";
import { useState } from "react";
import { Icon, Icons } from "@/components/ui";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: Icons.dashboard },
  { href: "/documents", label: "Document Matrix", icon: Icons.documents },
  { href: "/search", label: "Intelligence Terminal", icon: Icons.chat },
  { href: "/graph", label: "Reasoning Graph", icon: Icons.graph },
];

export function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [collapsed, setCollapsed] = useState(false);

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  return (
    <aside
      className="glass-panel"
      style={{
        width: collapsed ? 72 : 256,
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        transition: "width 0.25s cubic-bezier(0.4,0,0.2,1)",
        flexShrink: 0,
        overflow: "hidden",
        background: "var(--surface-container-low)",
      }}
    >
      {/* Logo / Branding */}
      <div
        style={{
          padding: collapsed ? "20px 12px" : "20px 20px",
          display: "flex",
          alignItems: "center",
          gap: 12,
          minHeight: 76,
        }}
      >
        <div
          className="gradient-glow"
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            background: "linear-gradient(135deg, hsl(262,80%,65%), hsl(200,90%,65%))",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Icon name="hub" size={22} style={{ color: "#fff" }} />
        </div>
        {!collapsed && (
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span 
              className="gradient-text font-display" 
              style={{ fontWeight: 700, fontSize: 18, lineHeight: 1.2 }}
            >
              Command Center
            </span>
            <span style={{ fontSize: 11, color: "hsl(215, 20%, 55%)", letterSpacing: "0.05em" }}>
              Document Intelligence
            </span>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav style={{ padding: "12px 12px", flex: 1 }}>
        <div 
          style={{ 
            marginBottom: 12, 
            padding: "0 8px",
            display: collapsed ? "none" : "block",
          }}
        >
          <span className="uppercase-label">Navigation</span>
        </div>
        
        {NAV_ITEMS.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: collapsed ? "12px" : "12px 16px",
                borderRadius: 10,
                marginBottom: 4,
                textDecoration: "none",
                background: active
                  ? "linear-gradient(135deg, hsl(262 80% 65% / 0.2), hsl(200 90% 65% / 0.1))"
                  : "transparent",
                color: active ? "hsl(210, 40%, 98%)" : "hsl(215, 20%, 65%)",
                transition: "all 0.15s ease",
                position: "relative",
                justifyContent: collapsed ? "center" : "flex-start",
              }}
              onMouseEnter={(e) => {
                if (!active) {
                  e.currentTarget.style.background = "var(--surface-container)";
                  e.currentTarget.style.color = "hsl(210, 40%, 90%)";
                }
              }}
              onMouseLeave={(e) => {
                if (!active) {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.color = "hsl(215, 20%, 65%)";
                }
              }}
            >
              {/* Active indicator */}
              {active && (
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    top: "50%",
                    transform: "translateY(-50%)",
                    width: 3,
                    height: 24,
                    background: "linear-gradient(180deg, hsl(262, 80%, 70%), hsl(200, 90%, 65%))",
                    borderRadius: "0 4px 4px 0",
                  }}
                />
              )}
              <Icon 
                name={item.icon} 
                size={20} 
                filled={active}
                style={{ 
                  color: active ? "hsl(262, 80%, 75%)" : "inherit",
                  flexShrink: 0
                }} 
              />
              {!collapsed && (
                <span style={{ fontSize: 14, fontWeight: active ? 500 : 400 }}>
                  {item.label}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* User Section + Controls */}
      <div style={{ padding: "12px 12px" }}>
        {/* User info */}
        {!collapsed && session && (
          <div
            className="glass"
            style={{
              padding: "12px 14px",
              marginBottom: 12,
              borderRadius: 10,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background: "linear-gradient(135deg, hsl(262, 80%, 65%), hsl(200, 90%, 65%))",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon name={Icons.user} size={16} style={{ color: "#fff" }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: "hsl(210, 40%, 98%)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {session.user?.email?.split("@")[0]}
                </p>
                <p
                  style={{
                    fontSize: 11,
                    color: "hsl(215, 20%, 55%)",
                  }}
                >
                  {(session as unknown as { user?: { tenantSlug?: string } })?.user?.tenantSlug || "Workspace"}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Sign out button */}
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: collapsed ? "12px" : "12px 16px",
            borderRadius: 10,
            border: "none",
            background: "transparent",
            color: "hsl(215, 20%, 65%)",
            cursor: "pointer",
            fontSize: 14,
            width: "100%",
            transition: "all 0.15s",
            justifyContent: collapsed ? "center" : "flex-start",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "hsl(0 84% 60% / 0.1)";
            e.currentTarget.style.color = "hsl(0, 84%, 70%)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = "hsl(215, 20%, 65%)";
          }}
        >
          <Icon name={Icons.logout} size={20} />
          {!collapsed && <span>Sign out</span>}
        </button>

        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: collapsed ? "center" : "flex-start",
            gap: 12,
            padding: collapsed ? "12px" : "12px 16px",
            borderRadius: 10,
            border: "none",
            background: "transparent",
            color: "hsl(215, 20%, 65%)",
            cursor: "pointer",
            fontSize: 13,
            width: "100%",
            marginTop: 4,
            transition: "all 0.15s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--surface-container)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
          }}
        >
          <Icon 
            name={collapsed ? "chevron_right" : "chevron_left"} 
            size={20} 
          />
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </aside>
  );
}
