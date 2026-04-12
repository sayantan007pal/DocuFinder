"use client";

import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import Link from "next/link";
import { useState } from "react";

const NAV_ITEMS = [
  { href: "/documents", label: "Documents", emoji: "📁" },
  { href: "/search", label: "Search", emoji: "🔍" },
  { href: "/tables", label: "Tables", emoji: "📊" },
];

export function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className="glass"
      style={{
        width: collapsed ? 72 : 240,
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        borderRight: "1px solid hsl(217, 33%, 17%)",
        transition: "width 0.25s cubic-bezier(0.4,0,0.2,1)",
        flexShrink: 0,
        overflow: "hidden",
      }}
    >
      {/* Logo */}
      <div
        style={{
          padding: "20px 16px",
          display: "flex",
          alignItems: "center",
          gap: 12,
          borderBottom: "1px solid hsl(217, 33%, 17%)",
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 9,
            background: "linear-gradient(135deg, hsl(262,80%,65%), hsl(200,90%,65%))",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 18,
            flexShrink: 0,
          }}
        >
          📄
        </div>
        {!collapsed && (
          <span className="gradient-text" style={{ fontWeight: 700, fontSize: 16 }}>
            DocuFinder
          </span>
        )}
      </div>

      {/* Navigation */}
      <nav style={{ padding: "12px 8px", flex: 1 }}>
        {NAV_ITEMS.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 12px",
                borderRadius: 8,
                marginBottom: 4,
                textDecoration: "none",
                background: active
                  ? "hsl(262 80% 65% / 0.15)"
                  : "transparent",
                border: active
                  ? "1px solid hsl(262 80% 65% / 0.3)"
                  : "1px solid transparent",
                color: active ? "hsl(262,80%,80%)" : "hsl(215, 20%, 65%)",
                transition: "all 0.15s",
              }}
              onMouseEnter={(e) => {
                if (!active) {
                  e.currentTarget.style.background = "hsl(217, 33%, 17%)";
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
              <span style={{ fontSize: 18, flexShrink: 0 }}>{item.emoji}</span>
              {!collapsed && (
                <span style={{ fontSize: 14, fontWeight: 500 }}>{item.label}</span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* User + Logout */}
      <div
        style={{
          padding: "12px 8px",
          borderTop: "1px solid hsl(217, 33%, 17%)",
        }}
      >
        {!collapsed && session && (
          <div
            style={{
              padding: "10px 12px",
              marginBottom: 8,
              borderRadius: 8,
              background: "hsl(217, 33%, 9%)",
            }}
          >
            <p
              style={{
                fontSize: 12,
                color: "hsl(215, 20%, 65%)",
                marginBottom: 2,
              }}
            >
              Signed in as
            </p>
            <p
              style={{
                fontSize: 13,
                fontWeight: 500,
                color: "hsl(210, 40%, 90%)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {session.user?.email}
            </p>
          </div>
        )}

        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "10px 12px",
            borderRadius: 8,
            border: "none",
            background: "transparent",
            color: "hsl(215, 20%, 65%)",
            cursor: "pointer",
            fontSize: 14,
            width: "100%",
            transition: "all 0.15s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "hsl(0 62% 55% / 0.1)";
            e.currentTarget.style.color = "hsl(0, 62%, 70%)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = "hsl(215, 20%, 65%)";
          }}
        >
          <span style={{ fontSize: 18 }}>🚪</span>
          {!collapsed && <span>Sign out</span>}
        </button>

        <button
          onClick={() => setCollapsed(!collapsed)}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            padding: "10px 12px",
            borderRadius: 8,
            border: "none",
            background: "transparent",
            color: "hsl(215, 20%, 65%)",
            cursor: "pointer",
            fontSize: 14,
            width: "100%",
            marginTop: 4,
          }}
        >
          <span style={{ fontSize: 16 }}>{collapsed ? "→" : "←"}</span>
          {!collapsed && <span style={{ fontSize: 13 }}>Collapse</span>}
        </button>
      </div>
    </aside>
  );
}
