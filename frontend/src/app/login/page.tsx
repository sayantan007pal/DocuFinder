"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [tenantName, setTenantName] = useState("");
  const [tenantSlug, setTenantSlug] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001";

  const handleRegister = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API}/api/v1/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          tenant_name: tenantName,
          tenant_slug: tenantSlug,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || "Registration failed");
      }
      // Auto-login after registration
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });
      if (result?.ok) router.push("/documents");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    setLoading(true);
    setError("");
    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });
      if (result?.ok) {
        router.push("/documents");
      } else {
        setError("Invalid email or password");
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "hsl(222, 84%, 5%)",
        padding: "24px",
      }}
    >
      {/* Background glow */}
      <div
        style={{
          position: "fixed",
          top: "20%",
          left: "50%",
          transform: "translateX(-50%)",
          width: 600,
          height: 400,
          background:
            "radial-gradient(ellipse, hsl(262 80% 65% / 0.15) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />

      <div
        className="glass animate-slide-in"
        style={{
          width: "100%",
          maxWidth: 420,
          borderRadius: 16,
          padding: "40px 36px",
          position: "relative",
        }}
      >
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
              marginBottom: 8,
            }}
          >
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                background: "linear-gradient(135deg, hsl(262,80%,65%), hsl(200,90%,65%))",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 20,
              }}
            >
              📄
            </div>
            <span
              className="gradient-text"
              style={{ fontSize: 22, fontWeight: 700 }}
            >
              DocuFinder
            </span>
          </div>
          <p style={{ color: "hsl(215, 20%, 65%)", fontSize: 14 }}>
            AI-powered company document intelligence
          </p>
        </div>

        {/* Tab switcher */}
        <div
          style={{
            display: "flex",
            background: "hsl(217, 33%, 12%)",
            borderRadius: 8,
            padding: 4,
            marginBottom: 28,
          }}
        >
          {(["Sign In", "Register"] as const).map((tab, idx) => (
            <button
              key={tab}
              onClick={() => {
                setIsLogin(idx === 0);
                setError("");
              }}
              style={{
                flex: 1,
                padding: "8px 0",
                borderRadius: 6,
                border: "none",
                cursor: "pointer",
                fontSize: 14,
                fontWeight: 500,
                transition: "all 0.2s",
                background: (idx === 0) === isLogin ? "hsl(262,80%,65%)" : "transparent",
                color: (idx === 0) === isLogin ? "white" : "hsl(215, 20%, 65%)",
              }}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Form */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {!isLogin && (
            <>
              <InputField
                label="Organization Name"
                value={tenantName}
                onChange={setTenantName}
                placeholder="Acme Corp"
              />
              <InputField
                label="Organization Slug"
                value={tenantSlug}
                onChange={(v) => setTenantSlug(v.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
                placeholder="acme-corp"
              />
            </>
          )}
          <InputField
            label="Email"
            value={email}
            onChange={setEmail}
            placeholder="admin@company.com"
            type="email"
          />
          <InputField
            label="Password"
            value={password}
            onChange={setPassword}
            placeholder="••••••••"
            type="password"
          />

          {error && (
            <div
              style={{
                background: "hsl(0 62% 55% / 0.15)",
                border: "1px solid hsl(0 62% 55% / 0.3)",
                borderRadius: 8,
                padding: "10px 14px",
                color: "hsl(0, 62%, 70%)",
                fontSize: 14,
              }}
            >
              {error}
            </div>
          )}

          <button
            onClick={isLogin ? handleLogin : handleRegister}
            disabled={loading}
            style={{
              padding: "12px 0",
              borderRadius: 8,
              border: "none",
              cursor: loading ? "not-allowed" : "pointer",
              fontSize: 15,
              fontWeight: 600,
              background: loading
                ? "hsl(262 80% 65% / 0.5)"
                : "linear-gradient(135deg, hsl(262,80%,65%), hsl(200,90%,65%))",
              color: "white",
              transition: "all 0.2s",
              marginTop: 4,
            }}
          >
            {loading
              ? "Please wait..."
              : isLogin
              ? "Sign in to DocuFinder"
              : "Create Organization"}
          </button>
        </div>
      </div>
    </div>
  );
}

function InputField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  type?: string;
}) {
  return (
    <div>
      <label
        style={{
          display: "block",
          fontSize: 13,
          fontWeight: 500,
          color: "hsl(215, 20%, 75%)",
          marginBottom: 6,
        }}
      >
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: "100%",
          padding: "10px 14px",
          borderRadius: 8,
          border: "1px solid hsl(217, 33%, 22%)",
          background: "hsl(222, 47%, 8%)",
          color: "hsl(210, 40%, 98%)",
          fontSize: 14,
          outline: "none",
          transition: "border-color 0.2s",
        }}
        onFocus={(e) => (e.target.style.borderColor = "hsl(262,80%,65%)")}
        onBlur={(e) => (e.target.style.borderColor = "hsl(217, 33%, 22%)")}
      />
    </div>
  );
}
