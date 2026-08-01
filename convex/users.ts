import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const seed = mutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", "mdk"))
      .first();

    if (!existing) {
      await ctx.db.insert("users", {
        username: "mdk",
        role: "admin",
      });
      return "User mdk created successfully";
    }
    return "User mdk already exists";
  },
});

export const getUserByClerkId = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user) return null;

    return {
      _id: user._id,
      username: user.username,
      role: user.role,
      clerkId: user.clerkId,
      blocked: user.blocked,
    };
  },
});

export const getUserByUsername = query({
  args: { username: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", args.username))
      .first();
    return user;
  },
});

export const updateClerkId = mutation({
  args: {
    userId: v.id("users"),
    clerkId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, { clerkId: args.clerkId });
  },
});

export const storeClerkUser = mutation({
  args: {
    clerkId: v.string(),
    username: v.string(),
    role: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthenticated. Please log in first.");
    }

    const creator = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!creator) throw new Error("Creator user record not found in database.");

    if (creator.role === "POS") {
      throw new Error("POS users cannot create new accounts");
    }

    if (creator.role === "manager" && args.role !== "POS") {
      throw new Error("Managers can only create POS accounts");
    }

    const existing = await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", args.username))
      .first();

    if (existing) {
      throw new Error("Username already exists in Convex");
    }

    const newUserId = await ctx.db.insert("users", {
      clerkId: args.clerkId,
      username: args.username,
      role: args.role,
    });

    return newUserId;
  },
});

export const listUsers = query({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();
    return users.map((user) => ({
      _id: user._id,
      username: user.username,
      role: user.role,
      clerkId: user.clerkId,
      blocked: user.blocked,
    }));
  },
});

export const deleteUser = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthenticated. Please log in first.");
    }

    const performer = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!performer) throw new Error("Performer user record not found in database.");

    const target = await ctx.db.get(args.userId);
    if (!target) throw new Error("Target user not found");

    if (performer.role === "manager" && target.role !== "POS") {
      throw new Error("Managers can only delete POS users");
    }
    if (performer.role !== "admin" && performer.role !== "manager") {
      throw new Error("Unauthorized to delete users");
    }
    if (target.role === "admin") {
      throw new Error("Admins cannot be deleted");
    }

    await ctx.db.delete(args.userId);
  },
});

export const toggleBlockUser = mutation({
  args: { userId: v.id("users"), blocked: v.boolean() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthenticated. Please log in first.");
    }

    const performer = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!performer) throw new Error("Performer user record not found in database.");

    const target = await ctx.db.get(args.userId);
    if (!target) throw new Error("Target user not found");

    if (performer.role === "manager" && target.role !== "POS") {
      throw new Error("Managers can only block/unblock POS users");
    }
    if (performer.role !== "admin" && performer.role !== "manager") {
      throw new Error("Unauthorized to block users");
    }
    if (target.role === "admin") {
      throw new Error("Admins cannot be blocked");
    }

    await ctx.db.patch(args.userId, { blocked: args.blocked });
  },
});

export const resetPassword = mutation({
  args: { username: v.string(), newPassword: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", args.username))
      .first();
    
    if (!user) {
      await ctx.db.insert("users", {
        username: args.username,
        role: args.username === "mdk" ? "admin" : "POS",
        passwordHash: args.newPassword,
      });
      return;
    }
    
    await ctx.db.patch(user._id, { passwordHash: args.newPassword });
  },
});

export const removeNameFromUsers = mutation({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();
    let count = 0;
    for (const user of users) {
      if ('name' in user) {
        // Explicitly cast to any to bypass TypeScript typing and delete the field
        await ctx.db.patch(user._id, { name: undefined } as any);
        count++;
      }
    }
    return `Removed name from ${count} users`;
  },
});

export const syncUser = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }
    const clerkId = identity.subject;
    // Extract username from identity fields
    let username = identity.nickname || identity.name || identity.preferredUsername || "user";
    // Strip usr_ prefix if clerk username has it
    username = username.replace(/^usr_/, "");

    // Check if user already exists by clerkId
    let user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", clerkId))
      .first();

    if (user) {
      return user;
    }

    // Check if user exists by username (e.g. from seed or manual input)
    user = await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", username))
      .first();

    if (user) {
      // Update their clerkId
      await ctx.db.patch(user._id, { clerkId });
      return await ctx.db.get(user._id);
    }

    // Determine role. If they are the first user or username is "mdk", make them admin
    const allUsers = await ctx.db.query("users").collect();
    const role = (allUsers.length === 0 || username === "mdk") ? "admin" : "POS";

    const newUserId = await ctx.db.insert("users", {
      clerkId,
      username,
      role,
    });

    return await ctx.db.get(newUserId);
  },
});
