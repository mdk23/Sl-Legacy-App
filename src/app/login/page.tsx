"use client";

import { useState, FormEvent, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSignIn, useClerk, useUser } from "@clerk/nextjs";
import { useConvex } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { enforceSingleSessionAction } from "../actions/clerkActions";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import LuxuryLoader from "../../components/LuxuryLoader";

export default function LoginPage() {
  const [mounted, setMounted] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
 
  const { signIn } = useSignIn();
  const { signOut, setActive } = useClerk();
  const { isSignedIn, isLoaded: isUserLoaded } = useUser();
  const router = useRouter();
  const convex = useConvex();
 
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && isUserLoaded && isSignedIn) {
      setIsRedirecting(true);
      router.replace("/");
    }
  }, [mounted, isUserLoaded, isSignedIn, router]);

  if (isRedirecting) {
    return <LuxuryLoader text="Entering secure portal..." />;
  }

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();

    if (isUserLoaded && isSignedIn) {
      toast.success("Active session detected! Entering portal...");
      setIsRedirecting(true);
      window.location.href = "/";
      return;
    }

    if (!signIn) return;

    setIsSubmitting(true);

    const formattedIdentifier = username.trim().startsWith("usr_") 
      ? username.trim() 
      : `usr_${username.trim()}`;

    try {
      let result: any = await signIn.create({
        identifier: formattedIdentifier,
        password,
      });

      if (result?.status === "needs_first_factor" || result?.status === "needs_factor_one") {
        if (typeof (signIn as any).attemptFirstFactor === "function") {
          result = await (signIn as any).attemptFirstFactor({
            strategy: "password",
            password,
          });
        }
      }

      const isComplete = result?.status === "complete" || (signIn as any)?.status === "complete";

      if (isComplete) {
        const cleanUsername = username.trim().replace(/^usr_/, "");
        const dbUser = await convex.query(api.users.getUserByUsername, { username: cleanUsername });
        
        if (dbUser && dbUser.blocked) {
          toast.error("User is blocked, contact admin");
          await signOut();
          setIsSubmitting(false);
          return;
        }

        const sessionId = result?.createdSessionId || (signIn as any)?.createdSessionId;
        if (sessionId) {
          await enforceSingleSessionAction(sessionId);
          if (setActive) {
            await setActive({ session: sessionId });
          }
        }

        toast.success("Welcome back!");
        setIsRedirecting(true);
        window.location.href = "/";
      } else {
        console.log("Sign-in incomplete status:", result?.status, result);
        if (result?.firstFactorVerification?.status === "failed" || result?.status === "needs_first_factor") {
          toast.error("Invalid username or password. Please check your credentials.");
        } else {
          toast.error("Invalid username or password. Please check your credentials.");
        }
      }
    } catch (err: any) {
      const clerkErrorMsg = (err.errors?.[0]?.longMessage || err.errors?.[0]?.message || err.message || "").toString();
      
      if (clerkErrorMsg.toLowerCase().includes("already signed in") || isSignedIn) {
        toast.success("Active session detected! Entering portal...");
        setIsRedirecting(true);
        window.location.href = "/";
        return;
      }
      
      toast.error(clerkErrorMsg || "Invalid credentials");
      console.error("Login error:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden min-h-screen">
      {/* Background Image */}
      <div className="fixed inset-0 z-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          alt="Gold jewelry and cufflinks on black marble"
          className="w-full h-full object-cover"
          src="/ultra-bg.png"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background/30 via-background/20 to-background/60"></div>
      </div>

      {/* Main Content */}
      <main className="relative z-10 flex-grow flex items-center justify-center px-gutter">
        <motion.div
          className="w-full max-w-[440px]"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, ease: "easeOut" }}
        >
          {/* Branding Header */}
          <div className="text-center mb-6 flex flex-col items-center">
            <motion.img
              src="/sl-legacy-full.svg"
              alt="SL Legacy — Acessorios Que Deixam Marca"
              className="w-[228px] h-auto drop-shadow-[0_4px_24px_rgba(0,0,0,0.65)]"
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1.1, ease: "easeOut" }}
            />
          </div>

          {/* Login Card */}
          <div className="glass-panel p-10 rounded-xl shadow-[0_20px_40px_rgba(48,25,52,0.08)]">
            <form onSubmit={handleLogin} className="space-y-6">
              {/* Username Field */}
              <div>
                <label
                  className="block font-label-caps text-label-caps text-on-surface-variant mb-2"
                  htmlFor="username"
                >
                  Username
                </label>
                <input
                  className="w-full bg-transparent border-0 border-b border-outline-variant py-3 px-0 font-body-md text-on-surface focus:ring-0 focus:border-secondary-fixed-dim focus:shadow-[0_1px_0_0_var(--color-secondary-fixed-dim)] transition-all placeholder:text-on-surface-variant/40 outline-none"
                  id="username"
                  name="username"
                  placeholder="User"
                  required
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={isSubmitting}
                />
              </div>

              {/* Password Field */}
              <div>
                <label
                  className="block font-label-caps text-label-caps text-on-surface-variant mb-2"
                  htmlFor="password"
                >
                  Password
                </label>
                <div className="relative">
                  <input
                    className="w-full bg-transparent border-0 border-b border-outline-variant py-3 px-0 font-body-md text-on-surface focus:ring-0 focus:border-secondary-fixed-dim focus:shadow-[0_1px_0_0_var(--color-secondary-fixed-dim)] transition-all placeholder:text-on-surface-variant/40 outline-none"
                    id="password"
                    name="password"
                    placeholder="********"
                    required
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isSubmitting}
                  />
                  <button
                    className="absolute right-0 top-1/2 -translate-y-1/2 text-on-surface-variant/60 hover:text-primary transition-colors focus:outline-none"
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Options */}


              {/* Submit Button */}
              <div className="pt-6">
                <button
                  className="w-full flex justify-center items-center py-4 px-6 rounded-full font-label-caps text-label-caps text-on-primary tracking-[0.2em] shadow-lg bg-gradient-to-br from-[#B4832B] to-[#D9B45B] hover:-translate-y-[2px] hover:shadow-[0_10px_20px_rgba(180,131,43,0.35)] transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] disabled:opacity-70 disabled:hover:translate-y-0"
                  type="submit"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : "ACCESS SECURE PORTAL"}
                </button>
              </div>
            </form>

            {/* Alternative Action */}
            <div className="mt-8 pt-8 border-t border-white/8 text-center">
              <p className="font-label-caps text-[10px] text-on-surface-variant/60 tracking-widest uppercase">
                Administrative access only
              </p>
            </div>
          </div>
        </motion.div>
      </main>

      {/* Footer Content */}
      <footer className="relative z-10 w-full py-8 px-gutter flex flex-col md:flex-row justify-between items-center text-on-surface-variant/70 font-label-caps text-[13px] tracking-widest">
        <div className="mb-4 md:mb-0 flex items-center space-x-2">
          <span>© 2026 DIGITAL ATELIER.</span>
          <span className="text-on-surface-variant/40">|</span>
          <div className="flex items-center">
            <span className="mr-2">POWERED BY</span>
            <div className="flex items-center ">
              <div className="text-4xl leading-none">
                <span className="text-[#FF7F50]" style={{ fontFamily: 'var(--font-agatha-italic)' }}>X</span>
                <span className="text-blue-600" style={{ fontFamily: 'var(--font-rc)' }}>alima</span>
              </div>
            </div>
          </div>
        </div>
        <div className="flex space-x-8">
          <Link
            className="hover:text-primary transition-colors border-b border-transparent hover:border-primary pb-0.5"
            href="/privacy"
          >
            PRIVACY
          </Link>
          <Link
            className="hover:text-primary transition-colors border-b border-transparent hover:border-primary pb-0.5"
            href="/terms"
          >
            TERMS
          </Link>
          <Link
            className="hover:text-primary transition-colors border-b border-transparent hover:border-primary pb-0.5"
            href="/support"
          >
            SUPPORT
          </Link>
        </div>
      </footer>
    </div>
  );
}
