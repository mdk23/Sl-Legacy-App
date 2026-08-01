"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useUser, useClerk } from "@clerk/nextjs";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { toast } from "sonner";
import LuxuryLoader from "./LuxuryLoader";

export type UserSession = {
  _id: string;
  username: string;
  role: string;
  clerkId?: string;
};

type AuthContextType = {
  user: UserSession | null;
  isLoading: boolean;
  logout: () => void;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const defaultAdminUser: UserSession = {
  _id: "kh7fpq2m16k6hnh56yawjd0znx8988kj",
  username: "mdk",
  role: "admin",
  clerkId: "user_3Fe9z6wBbcaaSJpE19raWsaJWLd",
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isLoaded, isSignedIn, user: clerkUser } = useUser();
  const { signOut } = useClerk();
  const syncUser = useMutation(api.users.syncUser);
  const [isSyncing, setIsSyncing] = useState(false);

  const convexUser = useQuery(
    api.users.getUserByClerkId,
    clerkUser ? { clerkId: clerkUser.id } : "skip"
  );

  useEffect(() => {
    if (isSignedIn && clerkUser && convexUser === null && !isSyncing) {
      setIsSyncing(true);
      syncUser()
        .catch((err) => console.error("Error syncing user:", err))
        .finally(() => setIsSyncing(false));
    }
  }, [isSignedIn, clerkUser, convexUser, syncUser, isSyncing]);

  useEffect(() => {
    if (!isLoaded) return;

    const isPublicPage = 
      pathname === "/privacy" || 
      pathname === "/terms" || 
      pathname === "/support" ||
      pathname?.startsWith("/privacy") ||
      pathname?.startsWith("/terms") ||
      pathname?.startsWith("/support");

    const isLoginPage = pathname === "/login" || pathname?.startsWith("/login");

    if (!isSignedIn) {
      if (!isLoginPage && !isPublicPage) {
        router.replace("/login");
      }
    } else {
      if (isLoginPage) {
        router.replace("/");
      }
    }
  }, [isLoaded, isSignedIn, pathname, router]);

  const logout = () => {
    signOut(() => {
      router.push("/login");
    });
  };

  const activeUser: UserSession | null = convexUser ? {
    _id: convexUser._id,
    username: convexUser.username,
    role: convexUser.role,
    clerkId: convexUser.clerkId,
  } : null;

  const isLoading = !isLoaded || (isSignedIn && (convexUser === undefined || !activeUser));

  if (isLoading) {
    return <LuxuryLoader text="Initializing secure portal..." />;
  }

  return (
    <AuthContext.Provider value={{ user: activeUser, isLoading: false, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
