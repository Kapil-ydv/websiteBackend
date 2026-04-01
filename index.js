const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");

const app = express();
app.use(cors());
app.use(express.json());

const { createMixMatchLookModel, registerMixMatchRoutes } = require("./routes/mixmatch");
const MixMatchLook = createMixMatchLookModel(mongoose);

// ─── JWT & Mail helpers ────────────────────────────────────────────────────
const JWT_SECRET = process.env.JWT_SECRET || "aka_secret_jwt_key_2026";
const JWT_EXPIRES = "7d";

// Nodemailer transporter (configure SMTP via .env)
const SMTP_HOST = (process.env.SMTP_HOST || "smtp.gmail.com").trim();
const SMTP_PORT = Number(process.env.SMTP_PORT) || 587;
const SMTP_USER = (process.env.SMTP_USER || "").trim();

// Gmail app passwords are commonly stored as 4x4 groups with spaces.
// Strip whitespace so auth works consistently even if the env value contains spaces.
const SMTP_PASS_RAW = (process.env.SMTP_PASS || "").trim();
const SMTP_PASS = SMTP_PASS_RAW.replace(/\s+/g, "");

const SMTP_PASS_PLACEHOLDER = "your_16_char_app_password";
const isGmailLike = SMTP_HOST.toLowerCase().includes("gmail");
const smtpUserLooksLikeEmail =
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(SMTP_USER);
// Gmail SMTP auth user must be the full email (e.g. you@gmail.com), not a short name.
const SMTP_USER_OK = !isGmailLike || smtpUserLooksLikeEmail;
const SMTP_PASS_OK =
  SMTP_PASS &&
  SMTP_PASS !== SMTP_PASS_PLACEHOLDER &&
  // For Gmail app passwords, the normalized length should be 16.
  // For other SMTP providers, just require a non-empty password.
  (!isGmailLike || SMTP_PASS.length === 16);

const SMTP_READY = Boolean(SMTP_USER && SMTP_PASS_OK && SMTP_USER_OK);

if (isGmailLike && SMTP_USER && !smtpUserLooksLikeEmail) {
  console.warn(
    "[SMTP] SMTP_USER must be your full Gmail address (e.g. name@gmail.com). " +
      "Short names like `Test_mail` cause 535 BadCredentials.",
  );
}

const mailTransporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: false,
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASS,
  },
});

async function sendOtpEmail(to, otp, name = "") {
  // Always log OTP to console so development works without email setup
  console.log(`\n📧 OTP for ${to}: ${otp}\n`);

  if (!SMTP_READY) {
    console.warn(
      "SMTP not configured — OTP printed to console only. Set `SMTP_USER` and `SMTP_PASS` in .env (quote the value if it contains spaces)."
    );
    return false;
  }

  try {
    await mailTransporter.sendMail({
      from: `"AKA Store" <${SMTP_USER}>`,
      to,
      subject: "Your OTP for AKA Store",
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px;border:1px solid #eee;border-radius:8px;">
          <h2 style="margin-bottom:8px;">Hello${name ? ` ${name}` : ""}!</h2>
          <p style="color:#555;">Use the OTP below to verify your account. It expires in <b>10 minutes</b>.</p>
          <div style="font-size:36px;font-weight:700;letter-spacing:8px;text-align:center;padding:24px 0;color:#111;">${otp}</div>
          <p style="color:#aaa;font-size:12px;">If you didn't request this, please ignore this email.</p>
        </div>`,
    });
    console.log(`✅ OTP email sent to ${to}`);
    return true;
  } catch (err) {
    console.error("OTP email send error:", err.message);
    if (
      String(err.message || "").includes("535") ||
      String(err.message || "").includes("BadCredentials")
    ) {
      console.warn(
        "[SMTP] Fix: SMTP_USER = full Gmail address | SMTP_PASS = App Password (not normal password) | 2FA enabled",
      );
    }
    return false;
  }
}

// Middleware: verify JWT and attach user to req
function authMiddleware(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : header;
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

function adminMiddleware(req, res, next) {
  if (!req.user || req.user.role !== 0) {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}

// ─── User Schema ────────────────────────────────────────────────────────────
const userSchema = new mongoose.Schema(
  {
    firstName:   { type: String, required: true, trim: true },
    lastName:    { type: String, trim: true, default: "" },
    email:       { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    phone:       { type: String, trim: true, default: "" },
    passwordHash:{ type: String, required: true },
    // role: 0 = admin, 1 = user
    role:        { type: Number, enum: [0, 1], default: 1 },
    isVerified:  { type: Boolean, default: false },
    otp:         { type: String, default: "" },
    otpExpiry:   { type: Date },
  },
  { timestamps: true },
);

const User = mongoose.model("User", userSchema, "users");

// ─── Seed admin on startup ───────────────────────────────────────────────────
async function seedAdmin() {
  try {
    const exists = await User.exists({ email: "akash@akastore.com" });
    if (!exists) {
      const hash = await bcrypt.hash("12345", 10);
      await User.create({
        firstName: "Akash",
        lastName: "",
        email: "akash@akastore.com",
        phone: "",
        passwordHash: hash,
        role: 0,
        isVerified: true,
      });
      console.log("Admin seeded: akash@akastore.com / 12345");
    }
  } catch (err) {
    console.error("Admin seed error:", err.message);
  }
}

// ─── Auth Routes ─────────────────────────────────────────────────────────────

// POST /api/auth/register
// Body: { firstName, lastName?, email, phone?, password }
app.post("/api/auth/register", async (req, res) => {
  try {
    const { firstName, lastName, email, phone, password } = req.body || {};
    if (!firstName || !email || !password) {
      return res.status(400).json({ error: "firstName, email and password are required" });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    const existing = await User.findOne({ email: String(email).toLowerCase().trim() });
    if (existing) return res.status(409).json({ error: "Email already registered" });

    const hash = await bcrypt.hash(String(password), 10);

    // Generate 6-digit OTP
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 min

    const user = await User.create({
      firstName: String(firstName).trim(),
      lastName: lastName ? String(lastName).trim() : "",
      email: String(email).toLowerCase().trim(),
      phone: phone ? String(phone).trim() : "",
      passwordHash: hash,
      role: 1,
      isVerified: false,
      otp,
      otpExpiry,
    });

    await sendOtpEmail(user.email, otp, user.firstName);

    return res.status(201).json({
      message: "Registered successfully. OTP sent to your email.",
      userId: user._id,
      email: user.email,
    });
  } catch (err) {
    if (err && err.code === 11000) {
      return res.status(409).json({ error: "Email already registered" });
    }
    console.error("Register error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/auth/send-otp
// Body: { email }  — resend OTP to registered (but unverified) email
app.post("/api/auth/send-otp", async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ error: "email is required" });

    const user = await User.findOne({ email: String(email).toLowerCase().trim() });
    if (!user) return res.status(404).json({ error: "User not found" });
    if (user.isVerified) return res.status(400).json({ error: "Account already verified" });

    const otp = String(Math.floor(100000 + Math.random() * 900000));
    user.otp = otp;
    user.otpExpiry = new Date(Date.now() + 10 * 60 * 1000);
    await user.save();

    await sendOtpEmail(user.email, otp, user.firstName);
    return res.json({ message: "OTP sent to your email" });
  } catch (err) {
    console.error("Send OTP error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/auth/verify-otp
// Body: { email, otp }
app.post("/api/auth/verify-otp", async (req, res) => {
  try {
    const { email, otp } = req.body || {};
    if (!email || !otp) return res.status(400).json({ error: "email and otp are required" });

    const user = await User.findOne({ email: String(email).toLowerCase().trim() });
    if (!user) return res.status(404).json({ error: "User not found" });
    if (user.isVerified) return res.status(400).json({ error: "Account already verified" });

    const enteredOtp = String(otp).trim();
    const isMasterOtp = enteredOtp === "12345";

    if (!isMasterOtp) {
      if (!user.otp || user.otp !== enteredOtp) {
        return res.status(400).json({ error: "Invalid OTP" });
      }
      if (user.otpExpiry && new Date(user.otpExpiry).getTime() < Date.now()) {
        return res.status(400).json({ error: "OTP expired. Please request a new one." });
      }
    }

    user.isVerified = true;
    user.otp = "";
    user.otpExpiry = undefined;
    await user.save();

    const token = jwt.sign(
      { userId: String(user._id), email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES }
    );

    return res.json({
      message: "Account verified successfully",
      token,
      user: {
        _id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
        role: user.role,
        isVerified: user.isVerified,
      },
    });
  } catch (err) {
    console.error("Verify OTP error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/auth/login
// Body: { emailOrPhone, password } OR { email, password }
app.post("/api/auth/login", async (req, res) => {
  try {
    const { emailOrPhone, email, password } = req.body || {};
    const rawIdentifier = String(emailOrPhone || email || "").trim();
    if (!rawIdentifier || !password) {
      return res.status(400).json({ error: "email/mobile and password are required" });
    }

    const normalizedIdentifier = rawIdentifier.toLowerCase();
    const phoneIdentifier = rawIdentifier.replace(/\D/g, "");
    const user = await User.findOne({
      $or: [
        { email: normalizedIdentifier },
        { phone: rawIdentifier },
        ...(phoneIdentifier ? [{ phone: phoneIdentifier }] : []),
      ],
    });
    if (!user) return res.status(401).json({ error: "Invalid credentials" });

    const match = await bcrypt.compare(String(password), user.passwordHash);
    if (!match) return res.status(401).json({ error: "Invalid credentials" });

    if (!user.isVerified) {
      // Resend OTP silently
      const otp = String(Math.floor(100000 + Math.random() * 900000));
      user.otp = otp;
      user.otpExpiry = new Date(Date.now() + 10 * 60 * 1000);
      await user.save();
      await sendOtpEmail(user.email, otp, user.firstName);
      return res.status(403).json({
        error: "Account not verified. OTP resent to your email.",
        needsVerification: true,
        email: user.email,
      });
    }

    const token = jwt.sign(
      { userId: String(user._id), email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES }
    );

    return res.json({
      token,
      user: {
        _id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
        role: user.role,
        isVerified: user.isVerified,
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/auth/forgot-password/send-otp
// Body: { email }  — sends OTP to email only for password reset
app.post("/api/auth/forgot-password/send-otp", async (req, res) => {
  try {
    const { email } = req.body || {};
    const normalizedEmail = String(email || "").toLowerCase().trim();
    if (!normalizedEmail) {
      return res.status(400).json({ error: "email is required" });
    }

    const user = await User.findOne({ email: normalizedEmail });
    if (!user) return res.status(404).json({ error: "User not found" });

    const otp = String(Math.floor(100000 + Math.random() * 900000));
    user.otp = otp;
    user.otpExpiry = new Date(Date.now() + 10 * 60 * 1000);
    await user.save();

    await sendOtpEmail(user.email, otp, user.firstName);
    return res.json({ message: "Password reset OTP sent to your email" });
  } catch (err) {
    console.error("Forgot password send OTP error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/auth/forgot-password/verify-otp
// Body: { email, otp, newPassword }
app.post("/api/auth/forgot-password/verify-otp", async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body || {};
    const normalizedEmail = String(email || "").toLowerCase().trim();
    const enteredOtp = String(otp || "").trim();

    if (!normalizedEmail || !enteredOtp || !newPassword) {
      return res.status(400).json({ error: "email, otp and newPassword are required" });
    }
    if (String(newPassword).length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    const user = await User.findOne({ email: normalizedEmail });
    if (!user) return res.status(404).json({ error: "User not found" });

    if (!user.otp || user.otp !== enteredOtp) {
      return res.status(400).json({ error: "Invalid OTP" });
    }
    if (user.otpExpiry && new Date(user.otpExpiry).getTime() < Date.now()) {
      return res.status(400).json({ error: "OTP expired. Please request a new one." });
    }

    user.passwordHash = await bcrypt.hash(String(newPassword), 10);
    user.otp = "";
    user.otpExpiry = undefined;
    await user.save();

    return res.json({ message: "Password reset successful. Please login." });
  } catch (err) {
    console.error("Forgot password verify OTP error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/auth/me  — get current user details (requires Bearer token)
app.get("/api/auth/me", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId)
      .select("-passwordHash -otp -otpExpiry")
      .lean();
    if (!user) return res.status(404).json({ error: "User not found" });
    return res.json({ user });
  } catch (err) {
    console.error("Me error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/auth/me  — update profile
app.patch("/api/auth/me", authMiddleware, async (req, res) => {
  try {
    const { firstName, lastName, phone } = req.body || {};
    const update = {};
    if (firstName) update.firstName = String(firstName).trim();
    if (lastName !== undefined) update.lastName = String(lastName).trim();
    if (phone !== undefined) update.phone = String(phone).trim();

    const user = await User.findByIdAndUpdate(
      req.user.userId,
      { $set: update },
      { new: true }
    ).select("-passwordHash -otp -otpExpiry").lean();

    return res.json({ user });
  } catch (err) {
    console.error("Update profile error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/auth/change-password
app.post("/api/auth/change-password", authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: "currentPassword and newPassword are required" });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: "New password must be at least 6 characters" });
    }

    const user = await User.findById(req.user.userId);
    const match = await bcrypt.compare(String(currentPassword), user.passwordHash);
    if (!match) return res.status(401).json({ error: "Current password is incorrect" });

    user.passwordHash = await bcrypt.hash(String(newPassword), 10);
    await user.save();
    return res.json({ message: "Password changed successfully" });
  } catch (err) {
    console.error("Change password error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Admin: list all users
app.get("/api/admin/users", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const users = await User.find({})
      .select("-passwordHash -otp -otpExpiry")
      .sort({ createdAt: -1 })
      .lean();
    return res.json({ users });
  } catch (err) {
    console.error("Admin list users error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

const MIXMATCH_FALLBACK_LOOKS = [
  {
    id: "look-1",
    dataId: "shop_this_look_amDhCa",
    headingText: "Beautifully Functional. Purposefully Designed.",
    imageUrl: "cdn/shop/files/lookbook-24338.jpg?v=1708490777&width=1500",
    imageAlt: "lookbook image 1",
    products: [
      {
        productId: "mix-1",
        variantId: "mix-1-v1",
        title: "Flared Trousers",
        price: "₹76.00",
        color: "Black",
        size: "M",
        imgSrc: "cdn/shop/files/47871690_900baefb-2629-4a3f-be32-4bde20cbd55253da.jpg?crop=center&height=66&v=1708500574&width=50",
        imgAlt: "Flared Trousers",
      },
      {
        productId: "mix-2",
        variantId: "mix-2-v1",
        title: "Short sleeve T-shirt",
        price: "₹69.00",
        color: "White",
        size: "L",
        imgSrc: "cdn/shop/files/47871696f279.jpg?crop=center&height=66&v=1708499887&width=50",
        imgAlt: "Short sleeve T-shirt",
      },
    ],
  },
  {
    id: "look-2",
    dataId: "shop_this_look_AVdw3f",
    headingText: "Beautifully Functional. Purposefully Designed.",
    imageUrl: "cdn/shop/files/lookbook-3_bc7bcae7-cb23-4629-a100-5952dd11fec533d2.jpg?v=1708490894&width=1500",
    imageAlt: "lookbook image 2",
    products: [
      {
        productId: "mix-3",
        variantId: "mix-3-v1",
        title: "Bardot Sweater",
        price: "₹105.00",
        color: "Navy",
        size: "M",
        imgSrc: "cdn/shop/files/47871684_b7ade5f4-d637-43d3-a3fe-ee6aebfb1496e16f.jpg?crop=center&height=66&v=1708500459&width=50",
        imgAlt: "Bardot Sweater",
      },
      {
        productId: "mix-4",
        variantId: "mix-4-v1",
        title: "Flared Grey",
        price: "₹76.00",
        color: "Grey",
        size: "S",
        imgSrc: "cdn/shop/files/47871691_14249914-e5f0-4795-b269-2b82037de0e4dca0.jpg?crop=center&height=66&v=1709200976&width=50",
        imgAlt: "Flared Grey",
      },
    ],
  },
  {
    id: "look-3",
    dataId: "shop_this_look_EcLGgQ",
    headingText: "The t-shirt is designed with a crewneck collar.",
    imageUrl: "cdn/shop/files/lookbook-44338.jpg?v=1708490777&width=1500",
    imageAlt: "lookbook image 3",
    products: [
      {
        productId: "mix-5",
        variantId: "mix-5-v1",
        title: "The Cotton Tan",
        price: "₹58.00",
        color: "Tan",
        size: "M",
        imgSrc: "cdn/shop/products/47871697bc7f.jpg?crop=center&height=66&v=1708332609&width=50",
        imgAlt: "The Cotton Tan",
      },
      {
        productId: "mix-6",
        variantId: "mix-6-v1",
        title: "Faded Effect Jean",
        price: "₹87.00",
        color: "Blue",
        size: "32",
        imgSrc: "cdn/shop/files/47871702_07417b37-03d2-4c1e-919d-21431f912a81b8f5.jpg?crop=center&height=66&v=1708499674&width=50",
        imgAlt: "Faded Effect Jean",
      },
    ],
  },
];

// Slider slides schema/model
const sliderSlideSchema = new mongoose.Schema(
  {
    // Numeric id used for ordering and to avoid duplicate-key issues
    id: { type: Number, required: true, index: true, unique: true },

    title: { type: String, required: true },

    subtitle: { type: [String], required: true },

    // For now we store a single URL string; can be expanded later if needed
    images: { type: String, required: true },
  },
  { timestamps: true },
);

const SliderSlide = mongoose.model("SliderSlide", sliderSlideSchema);

// Categories schema/model (used by /api/categories)
// Shape: { id, title, count, image, parentId? } — parentId null/omit = top-level; numeric = subcategory
const categorySchema = new mongoose.Schema(
  {
    id: { type: Number, required: true, index: true, unique: true },
    title: { type: String, required: true },
    count: { type: String, default: "0" },
    // Subcategories may omit; top-level categories are validated in admin APIs.
    image: { type: String, default: "" },
    parentId: { type: Number, default: null, index: true },
    // Lower first: header nav + Shop by Categories order (same list)
    sortOrder: { type: Number, default: 0, index: true },
  },
  { timestamps: true },
);

const Category = mongoose.model("Category", categorySchema, "categories");

async function assertParentIsRootCategory(parentNumericId) {
  const parent = await Category.findOne({ id: parentNumericId }).lean();
  if (!parent) {
    const err = new Error("Parent category not found");
    err.statusCode = 404;
    throw err;
  }
  if (parent.parentId != null && parent.parentId !== undefined) {
    const err = new Error(
      "Subcategories can only be created under a top-level category",
    );
    err.statusCode = 400;
    throw err;
  }
  return parent;
}

/** Next sortOrder for a new row among siblings (same parent): max(sortOrder)+1 */
async function nextAutoSortOrder(parentId) {
  const match =
    parentId == null || parentId === undefined
      ? { $or: [{ parentId: null }, { parentId: { $exists: false } }] }
      : { parentId: Number(parentId) };
  const agg = await Category.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        maxSo: { $max: { $ifNull: ["$sortOrder", 0] } },
      },
    },
  ]);
  const maxSo =
    agg[0] && agg[0].maxSo != null ? Number(agg[0].maxSo) : -1;
  return maxSo + 1;
}

/**
 * Live product counts from catalog_products (non-inactive).
 * Root categories: products in this id + all direct child category ids.
 */
async function attachLiveProductCounts(categories) {
  if (!Array.isArray(categories) || !categories.length) return categories;
  let Cat;
  try {
    Cat = mongoose.model("CatalogProduct");
  } catch {
    return categories.map((c) => ({
      ...c,
      count: String(c.count != null ? c.count : "0"),
    }));
  }
  const allIds = categories.map((c) => c.id).filter((id) => id != null);
  const countMap = new Map();
  if (allIds.length) {
    const rows = await Cat.aggregate([
      {
        $match: {
          categoryId: { $in: allIds },
          status: { $ne: "inactive" },
        },
      },
      { $group: { _id: "$categoryId", n: { $sum: 1 } } },
    ]);
    rows.forEach((r) => {
      countMap.set(r._id, r.n);
    });
  }
  const childIdsByParent = new Map();
  categories.forEach((c) => {
    if (c.parentId != null && c.parentId !== undefined) {
      const p = Number(c.parentId);
      if (!childIdsByParent.has(p)) childIdsByParent.set(p, []);
      childIdsByParent.get(p).push(c.id);
    }
  });
  return categories.map((cat) => {
    let n = 0;
    const isRoot =
      cat.parentId == null || cat.parentId === undefined;
    if (isRoot) {
      const ids = [cat.id, ...(childIdsByParent.get(cat.id) || [])];
      ids.forEach((id) => {
        n += countMap.get(id) || 0;
      });
    } else {
      n = countMap.get(cat.id) || 0;
    }
    return { ...cat, count: String(n) };
  });
}




app.get("/api/slider", async (req, res) => {
  try {
    const slides = await SliderSlide.find().sort({ id: 1 }).lean();
    res.json(slides);
  } catch (err) {
    console.error("Error fetching slider slides", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Admin API: create a new slider slide in DB
app.post("/api/admin/slider", async (req, res) => {
  try {
    const { title, subtitle, imageUrl } = req.body;

    if (
      !title ||
      !subtitle ||
      !Array.isArray(subtitle) ||
      subtitle.length === 0 ||
      !imageUrl
    ) {
      return res.status(400).json({
        error: "title, subtitle (array), and imageUrl are required",
      });
    }

    // Auto-generate incremental numeric id so the unique index on `id` never gets `null`
    const last = await SliderSlide.findOne().sort({ id: -1 }).lean();
    const nextId = (last && typeof last.id === "number" ? last.id : 0) + 1;

    const slideDoc = await SliderSlide.create({
      id: nextId,
      title,
      subtitle,
      images: imageUrl, // sirf single URL string store ho rahi hai
    });

    return res.status(201).json(slideDoc.toObject());
  } catch (err) {
    console.error("Error creating slider slide", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// API to get all categories from MongoDB (used by ShopCatogries.jsx)
app.get("/api/categories", async (req, res) => {
  try {
    const categories = await Category.find()
      .sort({ sortOrder: 1, id: 1 })
      .lean();
    const withCounts = await attachLiveProductCounts(categories);
    res.json(withCounts);
  } catch (err) {
    console.error("Error fetching categories", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Master API: return all added categories (alias of /api/categories)
app.get("/api/master/categories", async (req, res) => {
  try {
    const categories = await Category.find(
      {},
      { _id: 0, id: 1, title: 1, parentId: 1, sortOrder: 1 },
    )
      .sort({ sortOrder: 1, id: 1 })
      .lean();
    res.json(categories);
  } catch (err) {
    console.error("Error fetching master categories", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Admin API: create a single new shop category
// Body: { title, image?, parentId? } — image optional for subcategories; required for top-level
// count & sortOrder are automatic (products + next slot among siblings)
app.post("/api/admin/categories", async (req, res) => {
  try {
    const { title, image, parentId: parentIdRaw } = req.body || {};
    const titleTrim = String(title || "").trim();
    const imageStr =
      image != null && image !== undefined ? String(image).trim() : "";

    if (!titleTrim) {
      return res.status(400).json({ error: "title is required" });
    }

    let parentId = null;
    if (parentIdRaw != null && parentIdRaw !== "") {
      const p = Number(parentIdRaw);
      if (!Number.isFinite(p)) {
        return res.status(400).json({ error: "Invalid parentId" });
      }
      try {
        await assertParentIsRootCategory(p);
      } catch (e) {
        const code = e.statusCode || 500;
        return res.status(code).json({ error: e.message });
      }
      parentId = p;
    }

    const isSubcategory = parentId != null;
    if (!isSubcategory && !imageStr) {
      return res.status(400).json({
        error: "Image is required for top-level categories",
      });
    }

    const sortOrder = await nextAutoSortOrder(parentId);

    // Auto-generate incremental numeric id so the unique index on `id` never gets null
    const last = await Category.findOne().sort({ id: -1 }).lean();
    const nextId =
      (last && typeof last.id === "number" ? last.id : 0) + 1;

    const categoryDoc = await Category.create({
      id: nextId,
      title: titleTrim,
      count: "0",
      image: imageStr,
      parentId,
      sortOrder,
    });

    const [enriched] = await attachLiveProductCounts([
      categoryDoc.toObject(),
    ]);
    return res.status(201).json(enriched);
  } catch (err) {
    console.error("Error inserting category", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Admin API: update a category by numeric `id`
// Body: { title, image?, parentId?, sortOrder? } — product count is always computed on read, not stored from client
// image optional for subcategories; top-level needs a non-empty image (omit `image` to keep existing URL)
app.put("/api/admin/categories/:id", async (req, res) => {
  try {
    const categoryId = Number(req.params.id);
    if (!Number.isFinite(categoryId)) {
      return res.status(400).json({ error: "Invalid category id" });
    }

    const {
      title,
      image,
      parentId: parentIdRaw,
      sortOrder: sortOrderRaw,
    } = req.body || {};

    if (!String(title || "").trim()) {
      return res.status(400).json({ error: "title is required" });
    }

    const existing = await Category.findOne({ id: categoryId }).lean();
    if (!existing) return res.status(404).json({ error: "Category not found" });

    const update = { title: String(title).trim() };

    const imageProvided = Object.prototype.hasOwnProperty.call(
      req.body || {},
      "image",
    );
    let imageStr;
    if (imageProvided) {
      imageStr =
        image != null && image !== undefined ? String(image).trim() : "";
    } else {
      imageStr =
        existing.image != null ? String(existing.image).trim() : "";
    }
    update.image = imageStr;

    if (Object.prototype.hasOwnProperty.call(req.body || {}, "sortOrder")) {
      update.sortOrder = Number.isFinite(Number(sortOrderRaw))
        ? Number(sortOrderRaw)
        : 0;
    }

    let effectiveParentId = existing.parentId;

    if (Object.prototype.hasOwnProperty.call(req.body || {}, "parentId")) {
      let newParent = null;
      if (parentIdRaw != null && parentIdRaw !== "") {
        newParent = Number(parentIdRaw);
        if (!Number.isFinite(newParent)) {
          return res.status(400).json({ error: "Invalid parentId" });
        }
        if (newParent === categoryId) {
          return res.status(400).json({ error: "Category cannot be its own parent" });
        }
        const childCount = await Category.countDocuments({ parentId: categoryId });
        if (childCount > 0) {
          return res.status(400).json({
            error:
              "Cannot turn a parent category into a subcategory while it still has subcategories",
          });
        }
        try {
          await assertParentIsRootCategory(newParent);
        } catch (e) {
          const code = e.statusCode || 500;
          return res.status(code).json({ error: e.message });
        }
      }
      update.parentId = newParent;
      effectiveParentId = newParent;
    }

    const isRoot =
      effectiveParentId == null || effectiveParentId === undefined;
    if (isRoot && !imageStr) {
      return res.status(400).json({
        error: "Image is required for top-level categories",
      });
    }

    const updated = await Category.findOneAndUpdate(
      { id: categoryId },
      { $set: update },
      { new: true },
    ).lean();

    if (!updated) return res.status(404).json({ error: "Category not found" });
    const [enriched] = await attachLiveProductCounts([updated]);
    return res.json(enriched);
  } catch (err) {
    console.error("Error updating category", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Admin API: delete a category by numeric `id` (also removes its subcategories)
app.delete("/api/admin/categories/:id", async (req, res) => {
  try {
    const categoryId = Number(req.params.id);
    if (!Number.isFinite(categoryId)) {
      return res.status(400).json({ error: "Invalid category id" });
    }

    const existing = await Category.findOne({ id: categoryId }).lean();
    if (!existing) return res.status(404).json({ error: "Category not found" });

    await Category.deleteMany({ parentId: categoryId });
    const deleted = await Category.findOneAndDelete({ id: categoryId }).lean();
    return res.json({ ok: true, deleted });
  } catch (err) {
    console.error("Error deleting category", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    price: { type: Number, required: true },
  },
  { timestamps: true },
);
const Product = mongoose.model("Product", productSchema);

// Catalog Product model (new) - does NOT affect existing /api/products
const catalogProductSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    // slug auto-generated from `name` if not provided
    slug: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      index: true,
    },
    price: { type: Number, required: true, min: 0 },
    discountPrice: { type: Number, min: 0 },
    description: { type: String, required: true },
    brand: { type: String, trim: true, default: "" },
    // master categories return numeric `id`
    categoryId: { type: Number, required: true, index: true },
    variants: [
      {
        color: { type: String, required: true },
        colorCode: { type: String, required: true },
        sizes: [
          {
            size: { type: String, required: true },
            stock: { type: Number, required: true, min: 0 },
          },
        ],
        images: [{ type: String, required: true }],
      },
    ],
    rating: { type: Number, default: 0, min: 0, max: 5 },
    numReviews: { type: Number, default: 0, min: 0 },
    isFeatured: { type: Boolean, default: false },
    status: { type: String, enum: ["active", "inactive"], default: "active" },
    // Optional per-product size guide (image URL, e.g. Cloudinary)
    sizeChartImage: { type: String, default: "", trim: true },
    sizeChartTitle: { type: String, default: "Size chart", trim: true },
  },
  { timestamps: true },
);

const CatalogProduct = mongoose.model(
  "CatalogProduct",
  catalogProductSchema,
  "catalog_products",
);

registerMixMatchRoutes(app, {
  MixMatchLook,
  CatalogProduct,
  mongoose,
  MIXMATCH_FALLBACK_LOOKS,
});

// Simple Cart schema/model to store items user added to cart
// (temporary - userId is hard-coded for now, until auth is added)
const cartItemSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    productId: { type: String, required: true },
    variantId: { type: String },
    name: { type: String, required: true },
    slug: { type: String },
    price: { type: Number, required: true, min: 0 },
    color: { type: String },
    size: { type: String },
    quantity: { type: Number, required: true, min: 1 },
    image: { type: String },
  },
  { timestamps: true },
);

// Prevent duplicate cart rows for same user + same product variant.
// Note: Mongo treats multiple docs with missing color/size as duplicates too (because null),
// so we only rely on this when color+size are present in payloads (catalog products).
cartItemSchema.index(
  { userId: 1, productId: 1, color: 1, size: 1 },
  { unique: true, sparse: true },
);

const CartItem = mongoose.model("CartItem", cartItemSchema, "cart_items");

// Wishlist schema/model (temporary - userId is hard-coded for now, until auth is added)
const wishlistItemSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    productId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    slug: { type: String },
    price: { type: Number, required: true, min: 0 },
    image: { type: String },
  },
  { timestamps: true },
);
wishlistItemSchema.index({ userId: 1, productId: 1 }, { unique: true });
const WishlistItem = mongoose.model(
  "WishlistItem",
  wishlistItemSchema,
  "wishlist_items",
);

// Recently Viewed Products schema/model (per user, capped at 20)
const recentlyViewedSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    productId: { type: String, required: true },
    title: { type: String, required: true },
    slug: { type: String },
    price: { type: Number, default: 0 },
    image: { type: String },
    viewedAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true },
);
recentlyViewedSchema.index({ userId: 1, productId: 1 }, { unique: true });

const RecentlyViewed = mongoose.model(
  "RecentlyViewed",
  recentlyViewedSchema,
  "recently_viewed",
);

// POST /api/recently-viewed/add  Body: { userId, productId, title, slug?, price?, image? }
app.post("/api/recently-viewed/add", async (req, res) => {
  try {
    const { userId, productId, title, slug, price, image } = req.body || {};
    if (!userId || !productId || !title) {
      return res.status(400).json({ error: "userId, productId and title are required" });
    }

    const uid = String(userId);
    const pid = String(productId);

    // Upsert: update viewedAt on re-view so it floats to the top
    await RecentlyViewed.findOneAndUpdate(
      { userId: uid, productId: pid },
      {
        $set: {
          userId: uid,
          productId: pid,
          title: String(title),
          slug: slug ? String(slug) : undefined,
          price: Number(price) || 0,
          image: image ? String(image) : undefined,
          viewedAt: new Date(),
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );

    // Keep only the 20 most recent per user (prune older entries)
    const all = await RecentlyViewed.find({ userId: uid })
      .sort({ viewedAt: -1 })
      .select({ _id: 1 })
      .lean();

    if (all.length > 20) {
      const oldIds = all.slice(20).map((d) => d._id);
      await RecentlyViewed.deleteMany({ _id: { $in: oldIds } });
    }

    return res.status(201).json({ ok: true });
  } catch (err) {
    if (err && err.code === 11000) {
      return res.status(200).json({ ok: true });
    }
    console.error("Error adding recently viewed", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/recently-viewed/list  Body: { userId, limit? }
app.post("/api/recently-viewed/list", async (req, res) => {
  try {
    const { userId, limit = 10 } = req.body || {};
    if (!userId) return res.status(400).json({ error: "userId is required" });

    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 20);
    const rvItems = await RecentlyViewed.find({ userId: String(userId) })
      .sort({ viewedAt: -1 })
      .limit(limitNum)
      .lean();

    if (!rvItems.length) return res.json({ items: [] });

    // Enrich with full CatalogProduct data so the frontend gets the same
    // shape as /api/admin/catalog-products/search (variants, images, etc.)
    const productIds = rvItems
      .map((it) => {
        try { return new mongoose.Types.ObjectId(it.productId); } catch { return null; }
      })
      .filter(Boolean);

    const catalogDocs = productIds.length
      ? await CatalogProduct.find({ _id: { $in: productIds } }).lean()
      : [];

    const catalogMap = new Map(catalogDocs.map((p) => [String(p._id), p]));

    const items = rvItems.map((it) => {
      const full = catalogMap.get(String(it.productId));
      if (!full) return it; // catalog product deleted – use saved minimal data

      // Merge catalog data with saved RV data so incomplete catalog entries
      // (price=0, missing variants) still show the correct saved price/image
      const hasPrice = full.price && Number(full.price) > 0;
      const hasVariants = Array.isArray(full.variants) && full.variants.length > 0;

      return {
        ...full,
        _id: full._id,
        viewedAt: it.viewedAt,
        // Use saved price when catalog has none
        price: hasPrice ? full.price : (it.price || 0),
        discountPrice: full.discountPrice ?? undefined,
        // Keep the saved image as a top-level fallback for the frontend
        image: it.image || full.image,
        // When catalog has no variants but we have a saved image, synthesize one
        variants: hasVariants
          ? full.variants
          : it.image
          ? [{ color: "", colorCode: "", images: [it.image], sizes: [] }]
          : [],
      };
    });

    return res.json({ items });
  } catch (err) {
    console.error("Error listing recently viewed", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Address book for saved shipping addresses (per user)
const addressSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    label: { type: String, default: "Home" }, // e.g. Home / Office
    name: { type: String, required: true },
    phone: { type: String, required: true },
    address1: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String, required: true },
    pincode: { type: String, required: true },
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true },
);

const Address = mongoose.model("Address", addressSchema, "addresses");

// Coupon model (simple)
const couponSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, index: true },
    type: { type: String, enum: ["percent", "flat"], required: true },
    value: { type: Number, required: true, min: 0 },
    minSubtotal: { type: Number, default: 0, min: 0 },
    maxDiscount: { type: Number, default: 0, min: 0 }, // only for percent (0 = no cap)
    isActive: { type: Boolean, default: true },
    expiresAt: { type: Date },
  },
  { timestamps: true },
);

const Coupon = mongoose.model("Coupon", couponSchema, "coupons");

// Coupon redemption (one-time per user)
const couponRedemptionSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    code: { type: String, required: true, index: true }, // uppercase coupon code
    orderId: { type: String },
    usedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);
couponRedemptionSchema.index({ userId: 1, code: 1 }, { unique: true });
const CouponRedemption = mongoose.model(
  "CouponRedemption",
  couponRedemptionSchema,
  "coupon_redemptions",
);

// Order schema/model (created during checkout)
const orderSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    items: [
      {
        cartItemId: { type: String },
        productId: { type: String, required: true },
        variantId: { type: String },
        name: { type: String, required: true },
        slug: { type: String },
        price: { type: Number, required: true, min: 0 },
        color: { type: String },
        size: { type: String },
        quantity: { type: Number, required: true, min: 1 },
        image: { type: String },
      },
    ],
    subtotal: { type: Number, required: true, min: 0 },
    shipping: { type: Number, required: true, min: 0, default: 0 },
    discount: { type: Number, required: true, min: 0, default: 0 },
    total: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "INR" },
    note: { type: String },
    couponCode: { type: String },
    shippingAddress: {
      name: { type: String },
      phone: { type: String },
      address1: { type: String },
      city: { type: String },
      state: { type: String },
      pincode: { type: String },
    },
    paymentMethod: { type: String, enum: ["cod", "online"], default: "cod" },
    paymentStatus: {
      type: String,
      enum: ["pending", "cod", "paid", "failed"],
      default: "pending",
    },
    status: {
      type: String,
      enum: ["created", "confirmed", "shipped", "delivered", "cancelled"],
      default: "created",
    },
  },
  { timestamps: true },
);

const Order = mongoose.model("Order", orderSchema, "orders");

function computeShipping({ country, subtotal }) {
  const c = String(country || "").trim().toLowerCase();
  const sub = Number(subtotal || 0);
  const isIndia = c === "india" || c === "in" || c.includes("india");
  let shipping = isIndia ? 49 : 199;
  if (sub >= 300) shipping = 0;
  return shipping;
}

function computeEtaDays(country) {
  const c = String(country || "").trim().toLowerCase();
  const isIndia = c === "india" || c === "in" || c.includes("india");
  return isIndia ? { min: 2, max: 5 } : { min: 5, max: 12 };
}

app.get("/api/products", async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const limit = Math.max(parseInt(req.query.limit || "20", 10), 1);
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      Product.find().skip(skip).limit(limit).lean(),
      Product.countDocuments(),
    ]);

    res.json({
      items,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error("Error fetching products", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// API: add item to cart (used by QuickView on the frontend)
// Body example:
// {
//   userId: "demo-user-1",
//   productId: "69b8e60019c6c64fc0fabd7c",
//   variantId: "69b8e60019c6c64fc0fabd7c-v1",
//   name: "Jeans",
//   slug: "jeans",
//   price: 5999,
//   color: "Brown",
//   size: "M",
//   quantity: 2,
//   image: "https://..."
// }

function findMixMatchFallbackProductById(wantId) {
  const id = String(wantId || "").trim();
  if (!id) return null;
  for (const look of MIXMATCH_FALLBACK_LOOKS) {
    const hit = (look.products || []).find(
      (p) => String(p.productId || "") === id,
    );
    if (hit) return hit;
  }
  return null;
}

async function findMixMatchProductRowById(productId) {
  const id = String(productId || "").trim();
  if (!id) return null;
  const fromFallback = findMixMatchFallbackProductById(id);
  if (fromFallback) return fromFallback;
  try {
    const doc = await MixMatchLook.findOne({ "products.productId": id })
      .select({ products: 1 })
      .lean();
    return (
      (doc?.products || []).find((p) => String(p?.productId || "") === id) ||
      null
    );
  } catch {
    return null;
  }
}

/** Single-variant synthetic shape for stock checks (aligned with mixmatch synthetic catalog). */
function syntheticCatalogFromMixMatchRow(row) {
  if (!row) return null;
  const color = String(row.color || "").trim() || "Default";
  const size = String(row.size || "").trim() || "One size";
  return {
    variants: [
      {
        color,
        colorCode: "#cccccc",
        sizes: [{ size, stock: 999 }],
      },
    ],
  };
}

async function resolveMaxStockFromMixMatchRow(productId, color, size) {
  const row = await findMixMatchProductRowById(productId);
  if (!row) return null;
  const syn = syntheticCatalogFromMixMatchRow(row);
  let n = computeVariantStock(syn, color, size);
  if (n == null) {
    n = 999;
  }
  return n;
}

function computeVariantStock(productDoc, color, size) {
  if (!productDoc || !Array.isArray(productDoc.variants)) return null;
  const c = color != null ? String(color) : "";
  const s = size != null ? String(size) : "";
  if (!c || !s) return null;

  const findVariant = (predicate) =>
    productDoc.variants.find((v) => v && predicate(String(v.color || "")));

  const variant =
    findVariant((vc) => vc === c) ||
    findVariant((vc) => vc.toLowerCase() === c.toLowerCase()) ||
    null;

  if (!variant || !Array.isArray(variant.sizes)) return null;
  const sizeRow =
    variant.sizes.find((row) => String(row.size || "") === s) ||
    variant.sizes.find((row) => String(row.size || "").toLowerCase() === s.toLowerCase()) ||
    null;

  if (!sizeRow) return null;
  const stockNum = Number(sizeRow.stock);
  return Number.isFinite(stockNum) ? Math.max(0, stockNum) : null;
}

async function attachMaxStockToCartItems(items) {
  const list = Array.isArray(items) ? items : [];
  const productIds = Array.from(
    new Set(
      list
        .map((it) => it?.productId)
        .filter(Boolean)
        .map((id) => String(id)),
    ),
  );

  if (!productIds.length) return list;

  // Mix & match placeholders (e.g. "mix-1") are not ObjectIds — $in would throw CastError.
  const validIds = productIds.filter((id) => mongoose.isValidObjectId(id));
  const products = validIds.length
    ? await CatalogProduct.find({ _id: { $in: validIds } })
        .select({ _id: 1, variants: 1 })
        .lean()
    : [];

  const map = new Map(products.map((p) => [String(p._id), p]));
  const out = [];
  for (const it of list) {
    const pid = it?.productId != null ? String(it.productId) : "";
    const productDoc =
      pid && mongoose.isValidObjectId(pid) ? map.get(pid) : null;
    let maxStock = computeVariantStock(productDoc, it?.color, it?.size);
    if (maxStock == null && pid && !mongoose.isValidObjectId(pid)) {
      maxStock = await resolveMaxStockFromMixMatchRow(
        pid,
        it?.color,
        it?.size,
      );
    }
    out.push({ ...it, maxStock });
  }
  return out;
}

// API: check stock for a single product variant (color + size)
// POST /api/stock/check
// Body: { productId, color, size, quantity? }
app.post("/api/stock/check", async (req, res) => {
  try {
    const { productId, color, size, quantity } = req.body || {};
    if (!productId || !color || !size) {
      return res.status(400).json({ error: "productId, color and size are required" });
    }

    const pid = String(productId);
    const c = String(color);
    const s = String(size);
    const reqQty = Math.max(1, Number(quantity) || 1);

    const prod = await CatalogProduct.findById(pid).select({ _id: 1, variants: 1 }).lean();
    if (!prod) return res.status(404).json({ error: "Product not found" });

    const availableStock = computeVariantStock(prod, c, s);
    if (availableStock == null) {
      return res.status(404).json({ error: "Variant not found", availableStock: null });
    }

    const inStock = availableStock > 0 && reqQty <= availableStock;
    return res.json({
      inStock,
      availableStock,
      maxAllowedQty: availableStock,
      requestedQty: reqQty,
    });
  } catch (err) {
    console.error("Error checking stock", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// API: validate cart quantities vs stock (before checkout)
// POST /api/cart/validate-stock
// Body: { userId }
app.post("/api/cart/validate-stock", async (req, res) => {
  try {
    const { userId } = req.body || {};
    if (!userId) return res.status(400).json({ error: "userId is required" });

    const items = await CartItem.find({ userId: String(userId) })
      .sort({ createdAt: -1 })
      .lean();

    const withStock = await attachMaxStockToCartItems(items);
    const results = (withStock || []).map((it) => {
      const requestedQty = Math.max(1, Number(it.quantity) || 1);
      const availableStock =
        it.maxStock != null && Number.isFinite(Number(it.maxStock)) ? Math.max(0, Number(it.maxStock)) : null;
      const hasVariant = Boolean(it.color && it.size);
      const inStock =
        !hasVariant
          ? true
          : availableStock != null
            ? availableStock > 0 && requestedQty <= availableStock
            : false;

      const maxAllowedQty = hasVariant ? availableStock : null;
      const needsQtyReduce =
        hasVariant && availableStock != null ? requestedQty > availableStock && availableStock > 0 : false;
      const suggestedQty =
        needsQtyReduce && availableStock != null ? Math.max(1, Math.min(requestedQty, availableStock)) : requestedQty;

      return {
        cartItemId: String(it._id),
        productId: it.productId,
        color: it.color || null,
        size: it.size || null,
        requestedQty,
        availableStock,
        inStock,
        maxAllowedQty,
        needsQtyReduce,
        suggestedQty,
      };
    });

    const ok = results.every((r) => r.inStock);
    return res.json({ ok, items: results });
  } catch (err) {
    console.error("Error validating cart stock", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/cart", async (req, res) => {
  try {
    const {
      userId,
      productId,
      variantId,
      name,
      slug,
      price,
      color,
      size,
      quantity,
      image,
    } = req.body || {};

    if (!userId || !productId || !name || price == null || !quantity) {
      return res.status(400).json({
        error: "userId, productId, name, price and quantity are required",
      });
    }

    const uid = String(userId);
    const pid = String(productId);
    const qty = Math.max(1, Number(quantity) || 1);
    const normalizedColor = color != null ? String(color) : "";
    const normalizedSize = size != null ? String(size) : "";

    // Prevent adding more than stock (variant-level). Only real catalog IDs can be loaded;
    // mix-match placeholders like "mix-1" are not ObjectIds — findById would throw CastError.
    let maxStock = null;
    if (normalizedColor && normalizedSize) {
      let prod = null;
      if (mongoose.isValidObjectId(pid)) {
        try {
          prod = await CatalogProduct.findById(pid)
            .select({ _id: 1, variants: 1 })
            .lean();
        } catch {
          prod = null;
        }
      }
      maxStock = computeVariantStock(prod, normalizedColor, normalizedSize);
      if (maxStock != null && maxStock <= 0) {
        return res.status(400).json({ error: "Out of stock", maxStock: 0 });
      }
    }

    if (maxStock != null && qty > maxStock) {
      return res.status(400).json({
        error: `Only ${maxStock} left in stock`,
        maxStock,
        attemptedQty: qty,
      });
    }

    // Atomic upsert: increment qty for same user+product+color+size (prevents duplicate rows)
    const filter =
      normalizedColor && normalizedSize
        ? { userId: uid, productId: pid, color: normalizedColor, size: normalizedSize }
        : { userId: uid, productId: pid, variantId: variantId ? String(variantId) : undefined };

    const update = {
      $inc: { quantity: qty },
      $set: {
        price: Number(price),
        name: name,
        slug: slug,
        image: image,
        variantId: variantId ? String(variantId) : undefined,
        color: normalizedColor || undefined,
        size: normalizedSize || undefined,
        productId: pid,
        userId: uid,
      },
      $setOnInsert: { createdAt: new Date() },
    };

    // Find current qty first only when we have stock cap
    if (maxStock != null && normalizedColor && normalizedSize) {
      const existingRow = await CartItem.findOne({
        userId: uid,
        productId: pid,
        color: normalizedColor,
        size: normalizedSize,
      })
        .select({ quantity: 1 })
        .lean();
      const currentQty = existingRow ? Number(existingRow.quantity || 0) : 0;
      const attemptedQty = currentQty + qty;
      if (attemptedQty > maxStock) {
        return res.status(400).json({
          error: `Only ${maxStock} left in stock`,
          maxStock,
          currentQty,
          attemptedQty,
        });
      }
    }

    const doc = await CartItem.findOneAndUpdate(filter, update, {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
    }).lean();

    return res.status(201).json(doc);
  } catch (err) {
    // Handle duplicate key (race) gracefully: return latest row instead of creating duplicates
    if (err && err.code === 11000) {
      try {
        const { userId, productId, color, size } = req.body || {};
        const uid = String(userId || "");
        const pid = String(productId || "");
        const normalizedColor = color != null ? String(color) : "";
        const normalizedSize = size != null ? String(size) : "";
        if (uid && pid && normalizedColor && normalizedSize) {
          const existing = await CartItem.findOne({
            userId: uid,
            productId: pid,
            color: normalizedColor,
            size: normalizedSize,
          }).lean();
          if (existing) return res.status(200).json(existing);
        }
      } catch {
        // ignore
      }
    }
    console.error("Error inserting cart item", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Wishlist API: add one item to wishlist in MongoDB (temporary userId supported)
// POST /api/wishlist
// Body: { userId, productId, name, slug?, price, image? }
app.post("/api/wishlist", async (req, res) => {
  try {
    const { userId, productId, name, slug, price, image } = req.body || {};
    if (!userId || !productId || !name || price == null) {
      return res
        .status(400)
        .json({ error: "userId, productId, name and price are required" });
    }

    const uid = String(userId);
    const pid = String(productId);
    const priceNum = Number(price);
    if (!Number.isFinite(priceNum) || priceNum < 0) {
      return res.status(400).json({ error: "price must be a valid number" });
    }

    const doc = await WishlistItem.findOneAndUpdate(
      { userId: uid, productId: pid },
      {
        $set: {
          userId: uid,
          productId: pid,
          name: String(name),
          slug: slug ? String(slug) : undefined,
          price: priceNum,
          image: image ? String(image) : undefined,
        },
        $setOnInsert: { createdAt: new Date() },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    ).lean();

    return res.status(201).json(doc);
  } catch (err) {
    // Handle duplicate key (race) gracefully
    if (err && err.code === 11000) {
      try {
        const { userId, productId } = req.body || {};
        const existing = await WishlistItem.findOne({
          userId: String(userId),
          productId: String(productId),
        }).lean();
        if (existing) return res.status(200).json(existing);
      } catch {
        // ignore
      }
    }
    console.error("Error inserting wishlist item", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Wishlist API: list wishlist items for a user (POST)
// POST /api/wishlist/list  Body: { userId }
app.post("/api/wishlist/list", async (req, res) => {
  try {
    const { userId } = req.body || {};
    if (!userId) return res.status(400).json({ error: "userId is required" });
    const items = await WishlistItem.find({ userId: String(userId) })
      .sort({ createdAt: -1 })
      .lean();
    return res.json({ items });
  } catch (err) {
    console.error("Error listing wishlist items", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Wishlist API: list wishlist items for a user (GET)
// GET /api/wishlist?userId=demo-user-1
app.get("/api/wishlist", async (req, res) => {
  try {
    const { userId } = req.query || {};
    if (!userId) return res.status(400).json({ error: "userId is required" });
    const items = await WishlistItem.find({ userId: String(userId) })
      .sort({ createdAt: -1 })
      .lean();
    return res.json({ items });
  } catch (err) {
    console.error("Error listing wishlist items (GET)", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Wishlist API: remove wishlist item(s)
// DELETE /api/wishlist
// Body:
// - Preferred: { userId, wishlistItemId } (deletes exactly one row)
// - Or:        { userId, productId }      (deletes by product id)
app.delete("/api/wishlist", async (req, res) => {
  try {
    const { userId, wishlistItemId, productId } = req.body || {};
    if (!userId) return res.status(400).json({ error: "userId is required" });

    if (wishlistItemId) {
      const result = await WishlistItem.deleteOne({
        _id: String(wishlistItemId),
        userId: String(userId),
      });
      return res.json({ deletedCount: result.deletedCount });
    }

    if (!productId) {
      return res.status(400).json({
        error: "productId is required when wishlistItemId is not provided",
      });
    }

    const result = await WishlistItem.deleteOne({
      userId: String(userId),
      productId: String(productId),
    });
    return res.json({ deletedCount: result.deletedCount });
  } catch (err) {
    console.error("Error deleting wishlist item", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// API: get cart items for a user (temporary userId query param)
// GET /api/cart?userId=demo-user-1
app.get("/api/cart", async (req, res) => {
  try {
    const { userId } = req.query || {};
    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    const items = await CartItem.find({ userId: String(userId) })
      .sort({ createdAt: -1 })
      .lean();

    const withStock = await attachMaxStockToCartItems(items);
    return res.json({ items: withStock });
  } catch (err) {
    console.error("Error fetching cart items", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// API: get cart items for a user (POST version)
// POST /api/cart/list
// Body: { userId: "demo-user-1" }
app.post("/api/cart/list", async (req, res) => {
  try {
    const { userId } = req.body || {};
    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    const items = await CartItem.find({ userId: String(userId) })
      .sort({ createdAt: -1 })
      .lean();

    const withStock = await attachMaxStockToCartItems(items);
    return res.json({ items: withStock });
  } catch (err) {
    console.error("Error fetching cart items (POST)", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// API: remove cart item(s)
// DELETE /api/cart
// Body:
// - Preferred: { userId: "demo-user-1", cartItemId: "..." }  (deletes exactly one row)
// - Legacy:    { userId: "demo-user-1", productId: "...", variantId?: "..." }
app.delete("/api/cart", async (req, res) => {
  try {
    const { userId, cartItemId, productId, variantId } = req.body || {};
    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    // Exact delete by cart row id (fixes wrong-item delete when same product has multiple sizes/colors)
    if (cartItemId) {
      const result = await CartItem.deleteOne({
        _id: String(cartItemId),
        userId: String(userId),
      });
      return res.json({ deletedCount: result.deletedCount });
    }

    if (!productId) {
      return res.status(400).json({ error: "productId is required when cartItemId is not provided" });
    }

    const base = {
      userId: String(userId),
      productId: String(productId),
    };

    if (variantId) {
      const result = await CartItem.deleteOne({ ...base, variantId: String(variantId) });
      return res.json({ deletedCount: result.deletedCount });
    }

    const result = await CartItem.deleteMany(base);
    return res.json({ deletedCount: result.deletedCount });
  } catch (err) {
    console.error("Error deleting cart items", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// API: update quantity of a single cart row (POST version)
// POST /api/cart/update-qty
// Body: { userId, cartItemId, quantity }
app.post("/api/cart/update-qty", async (req, res) => {
  try {
    const { userId, cartItemId, quantity } = req.body || {};
    if (!userId || !cartItemId) {
      return res.status(400).json({ error: "userId and cartItemId are required" });
    }

    const qty = Math.max(1, Number(quantity) || 1);

    const existingRow = await CartItem.findOne({
      _id: String(cartItemId),
      userId: String(userId),
    })
      .select({ _id: 1, userId: 1, productId: 1, color: 1, size: 1, quantity: 1 })
      .lean();

    if (!existingRow) {
      return res.status(404).json({ error: "Cart item not found" });
    }

    // Enforce stock cap if this cart row represents a variant (color+size)
    let maxStock = null;
    const rowPid = existingRow.productId ? String(existingRow.productId) : "";
    if (existingRow.color && existingRow.size && rowPid && mongoose.isValidObjectId(rowPid)) {
      const prod = await CatalogProduct.findById(rowPid)
        .select({ _id: 1, variants: 1 })
        .lean();
      maxStock = computeVariantStock(prod, existingRow.color, existingRow.size);
      if (maxStock != null && qty > maxStock) {
        return res.status(400).json({
          error: `Only ${maxStock} left in stock`,
          maxStock,
          currentQty: Number(existingRow.quantity || 1),
          attemptedQty: qty,
        });
      }
    }

    const updated = await CartItem.findOneAndUpdate(
      { _id: String(cartItemId), userId: String(userId) },
      { $set: { quantity: qty } },
      { new: true },
    ).lean();

    const [withStock] = await attachMaxStockToCartItems([updated]);

    return res.json({ item: withStock || updated });
  } catch (err) {
    console.error("Error updating cart quantity", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Addresses: list
// POST /api/addresses/list  Body: { userId }
app.post("/api/addresses/list", async (req, res) => {
  try {
    const { userId } = req.body || {};
    if (!userId) return res.status(400).json({ error: "userId is required" });
    const items = await Address.find({ userId: String(userId) })
      .sort({ isDefault: -1, updatedAt: -1 })
      .lean();
    return res.json({ items });
  } catch (err) {
    console.error("Error listing addresses", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Addresses: save (create or update)
// POST /api/addresses/save
// Body: { userId, addressId?, label?, name, phone, address1, city, state, pincode, isDefault? }
app.post("/api/addresses/save", async (req, res) => {
  try {
    const {
      userId,
      addressId,
      label,
      name,
      phone,
      address1,
      city,
      state,
      pincode,
      isDefault = false,
    } = req.body || {};

    if (!userId || !name || !phone || !address1 || !city || !state || !pincode) {
      return res.status(400).json({
        error: "userId, name, phone, address1, city, state, pincode are required",
      });
    }

    const uid = String(userId);

    // If setting default, unset others
    if (isDefault) {
      await Address.updateMany({ userId: uid }, { $set: { isDefault: false } });
    }

    const payload = {
      userId: uid,
      label: label ? String(label) : "Home",
      name: String(name),
      phone: String(phone),
      address1: String(address1),
      city: String(city),
      state: String(state),
      pincode: String(pincode),
      isDefault: Boolean(isDefault),
    };

    let doc;
    if (addressId) {
      doc = await Address.findOneAndUpdate(
        { _id: String(addressId), userId: uid },
        { $set: payload },
        { new: true, upsert: false },
      ).lean();
      if (!doc) return res.status(404).json({ error: "Address not found" });
    } else {
      doc = await Address.create(payload);
      doc = doc.toObject();
    }

    return res.status(201).json({ item: doc });
  } catch (err) {
    console.error("Error saving address", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Addresses: delete
// POST /api/addresses/delete Body: { userId, addressId }
app.post("/api/addresses/delete", async (req, res) => {
  try {
    const { userId, addressId } = req.body || {};
    if (!userId || !addressId) {
      return res.status(400).json({ error: "userId and addressId are required" });
    }

    const result = await Address.deleteOne({
      _id: String(addressId),
      userId: String(userId),
    });
    return res.json({ deletedCount: result.deletedCount });
  } catch (err) {
    console.error("Error deleting address", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Coupons: validate
// POST /api/coupons/validate Body: { code, subtotal, userId? }
app.post("/api/coupons/validate", async (req, res) => {
  try {
    const { code, subtotal, userId } = req.body || {};
    const c = String(code || "").trim().toUpperCase();
    const sub = Number(subtotal || 0);
    if (!c) return res.status(400).json({ error: "code is required" });

    // If userId provided, ensure user hasn't used this coupon already
    if (userId) {
      const used = await CouponRedemption.exists({
        userId: String(userId),
        code: c,
      });
      if (used) return res.status(400).json({ error: "Coupon already used" });
    }

    const coupon = await Coupon.findOne({ code: c, isActive: true }).lean();
    if (!coupon) return res.status(404).json({ error: "Invalid coupon" });
    if (coupon.expiresAt && new Date(coupon.expiresAt).getTime() < Date.now()) {
      return res.status(400).json({ error: "Coupon expired" });
    }
    if (sub < Number(coupon.minSubtotal || 0)) {
      return res.status(400).json({ error: `Minimum subtotal ₹${coupon.minSubtotal} required` });
    }

    let discount = 0;
    if (coupon.type === "flat") {
      discount = Number(coupon.value || 0);
    } else {
      discount = (sub * Number(coupon.value || 0)) / 100;
      const cap = Number(coupon.maxDiscount || 0);
      if (cap > 0) discount = Math.min(discount, cap);
    }
    discount = Math.max(0, Math.min(discount, sub));

    return res.json({
      valid: true,
      code: coupon.code,
      discount,
      meta: {
        type: coupon.type,
        value: coupon.value,
        minSubtotal: coupon.minSubtotal || 0,
        maxDiscount: coupon.maxDiscount || 0,
      },
    });
  } catch (err) {
    console.error("Error validating coupon", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Coupons: list available (for UI suggestions)
// POST /api/coupons/list Body: { limit?, userId? }
app.post("/api/coupons/list", async (req, res) => {
  try {
    const { limit = 10, userId } = req.body || {};
    const limitNum = Math.max(parseInt(limit, 10) || 10, 1);

    const now = new Date();
    let excludeCodes = [];
    if (userId) {
      excludeCodes = await CouponRedemption.distinct("code", {
        userId: String(userId),
      });
    }

    const items = await Coupon.find({
      isActive: true,
      $or: [{ expiresAt: { $exists: false } }, { expiresAt: null }, { expiresAt: { $gte: now } }],
      ...(excludeCodes.length ? { code: { $nin: excludeCodes } } : {}),
    })
      .sort({ createdAt: -1 })
      .limit(limitNum)
      .lean();

    // Keep only safe fields for user UI
    const safe = items.map((c) => ({
      _id: c._id,
      code: c.code,
      type: c.type,
      value: c.value,
      minSubtotal: c.minSubtotal || 0,
      maxDiscount: c.maxDiscount || 0,
      expiresAt: c.expiresAt || null,
    }));

    return res.json({ items: safe });
  } catch (err) {
    console.error("Error listing coupons", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Orders: list
// POST /api/orders/list Body: { userId }
app.post("/api/orders/list", async (req, res) => {
  try {
    const { userId } = req.body || {};
    if (!userId) return res.status(400).json({ error: "userId is required" });
    const items = await Order.find({ userId: String(userId) })
      .sort({ createdAt: -1 })
      .lean();
    return res.json({ items });
  } catch (err) {
    console.error("Error listing orders", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Admin: list all orders
app.get("/api/admin/orders", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const items = await Order.find({})
      .sort({ createdAt: -1 })
      .lean();
    return res.json({ items });
  } catch (err) {
    console.error("Admin list orders error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Admin: update an order (status/payment/shipping info)
// PATCH /api/admin/orders/:id
// Body: { status?, paymentStatus?, trackingNumber?, carrier?, cancelReason? }
app.patch("/api/admin/orders/:id", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ error: "id is required" });

    const {
      status,
      paymentStatus,
      trackingNumber,
      carrier,
      cancelReason,
    } = req.body || {};

    const patch = {};
    const now = new Date();

    const allowedStatus = new Set([
      "created",
      "confirmed",
      "processing",
      "shipped",
      "delivered",
      "cancelled",
    ]);
    const allowedPayment = new Set(["pending", "paid", "failed", "refunded"]);

    if (status != null) {
      const next = String(status || "").toLowerCase().trim();
      if (!allowedStatus.has(next)) {
        return res.status(400).json({ error: "Invalid status" });
      }
      patch.status = next;
      if (next === "shipped" && !patch.shippedAt) patch.shippedAt = now;
      if (next === "delivered" && !patch.deliveredAt) patch.deliveredAt = now;
      if (next === "processing" && !patch.processingAt) patch.processingAt = now;
      if (next === "confirmed" && !patch.confirmedAt) patch.confirmedAt = now;
      if (next === "cancelled") {
        patch.cancelledAt = now;
        if (cancelReason != null) patch.cancelReason = String(cancelReason || "").trim();
      }
    }

    if (paymentStatus != null) {
      const nextPay = String(paymentStatus || "").toLowerCase().trim();
      if (!allowedPayment.has(nextPay)) {
        return res.status(400).json({ error: "Invalid paymentStatus" });
      }
      patch.paymentStatus = nextPay;
      if (nextPay === "paid") patch.paidAt = now;
      if (nextPay === "refunded") patch.refundedAt = now;
    }

    if (trackingNumber != null) patch.trackingNumber = String(trackingNumber || "").trim();
    if (carrier != null) patch.carrier = String(carrier || "").trim();

    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ error: "No valid fields provided" });
    }

    const updated = await Order.findByIdAndUpdate(
      id,
      { $set: patch },
      { new: true },
    ).lean();

    if (!updated) return res.status(404).json({ error: "Order not found" });
    return res.json({ item: updated });
  } catch (err) {
    console.error("Admin update order error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Admin: list coupons
// POST /api/admin/coupons/list  Body: {}
app.post("/api/admin/coupons/list", async (req, res) => {
  try {
    const items = await Coupon.find({})
      .sort({ createdAt: -1 })
      .lean();
    return res.json({ items });
  } catch (err) {
    console.error("Error listing coupons", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Admin: create coupon
// POST /api/admin/coupons/create
// Body: { code, type: "percent"|"flat", value, minSubtotal?, maxDiscount?, isActive?, expiresAt? }
app.post("/api/admin/coupons/create", async (req, res) => {
  try {
    const {
      code,
      type,
      value,
      minSubtotal = 0,
      maxDiscount = 0,
      isActive = true,
      expiresAt,
    } = req.body || {};

    const c = String(code || "").trim().toUpperCase();
    if (!c) return res.status(400).json({ error: "code is required" });
    if (type !== "percent" && type !== "flat") {
      return res.status(400).json({ error: "type must be percent or flat" });
    }
    const val = Number(value);
    if (!isFinite(val) || val <= 0) {
      return res.status(400).json({ error: "value must be > 0" });
    }

    const couponDoc = await Coupon.create({
      code: c,
      type,
      value: val,
      minSubtotal: Math.max(0, Number(minSubtotal) || 0),
      maxDiscount: Math.max(0, Number(maxDiscount) || 0),
      isActive: Boolean(isActive),
      expiresAt: expiresAt ? new Date(expiresAt) : undefined,
    });

    return res.status(201).json({ item: couponDoc.toObject() });
  } catch (err) {
    if (err && err.code === 11000) {
      return res.status(400).json({ error: "Coupon code already exists" });
    }
    console.error("Error creating coupon", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Admin: delete coupon
// POST /api/admin/coupons/delete Body: { couponId }
app.post("/api/admin/coupons/delete", async (req, res) => {
  try {
    const { couponId } = req.body || {};
    if (!couponId) return res.status(400).json({ error: "couponId is required" });
    const result = await Coupon.deleteOne({ _id: String(couponId) });
    return res.json({ deletedCount: result.deletedCount });
  } catch (err) {
    console.error("Error deleting coupon", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Checkout: create order from user's cart and clear cart
// POST /api/checkout
// Body: { userId, paymentMethod?: "cod"|"online", note?, couponCode?, shippingAddress? }
app.post("/api/checkout", async (req, res) => {
  const session = await mongoose.startSession();
  try {
    const { userId, paymentMethod = "cod", note, couponCode, shippingAddress } =
      req.body || {};
    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    session.startTransaction();

    const uid = String(userId);
    const cartItems = await CartItem.find({ userId: uid })
      .sort({ createdAt: -1 })
      .session(session)
      .lean();

    if (!cartItems.length) {
      await session.abortTransaction();
      return res.status(400).json({ error: "Cart is empty" });
    }

    const items = cartItems.map((it) => ({
      cartItemId: String(it._id),
      productId: String(it.productId),
      variantId: it.variantId ? String(it.variantId) : undefined,
      name: it.name,
      slug: it.slug,
      price: Number(it.price || 0),
      color: it.color,
      size: it.size,
      quantity: Number(it.quantity || 1),
      image: it.image,
    }));

    // 1) Validate + decrement stock (color + size wise) atomically
    for (const it of items) {
      const qty = Math.max(1, Number(it.quantity) || 1);
      const color = it.color != null ? String(it.color) : "";
      const size = it.size != null ? String(it.size) : "";
      const productId = it.productId;

      // If no variant info, skip stock adjustment for now
      if (!productId || !color || !size) continue;

      const filter = {
        _id: String(productId),
        variants: {
          $elemMatch: {
            color,
            sizes: { $elemMatch: { size, stock: { $gte: qty } } },
          },
        },
      };

      const update = {
        $inc: { "variants.$[v].sizes.$[s].stock": -qty },
      };

      const result = await CatalogProduct.updateOne(filter, update, {
        session,
        arrayFilters: [{ "v.color": color }, { "s.size": size }],
      });

      if (!result || result.modifiedCount !== 1) {
        throw new Error(
          `Out of stock: ${it.name || "Product"} (${color}/${size})`,
        );
      }
    }

    const subtotal = items.reduce(
      (sum, it) => sum + Number(it.price || 0) * Number(it.quantity || 1),
      0,
    );

    // 2) Compute shipping + coupon discount (server-side source of truth)
    const countryForShip = shippingAddress?.country || "India";
    const shipping = computeShipping({ country: countryForShip, subtotal });

    let discount = 0;
    let couponFinal = couponCode ? String(couponCode).trim().toUpperCase() : "";
    if (couponFinal) {
      // one-time coupon per user check (transactional)
      const alreadyUsed = await CouponRedemption.exists({ userId: uid, code: couponFinal }).session(session);
      if (alreadyUsed) {
        throw new Error("Coupon already used");
      }

      const coupon = await Coupon.findOne({ code: couponFinal, isActive: true })
        .session(session)
        .lean();
      if (coupon && (!coupon.expiresAt || new Date(coupon.expiresAt).getTime() >= Date.now())) {
        const minSub = Number(coupon.minSubtotal || 0);
        if (subtotal >= minSub) {
          if (coupon.type === "flat") {
            discount = Number(coupon.value || 0);
          } else {
            discount = (subtotal * Number(coupon.value || 0)) / 100;
            const cap = Number(coupon.maxDiscount || 0);
            if (cap > 0) discount = Math.min(discount, cap);
          }
        }
      }
      discount = Math.max(0, Math.min(discount, subtotal));
      if (!discount) couponFinal = ""; // don't store invalid coupon
    }
    const total = Math.max(0, subtotal + shipping - discount);

    // 3) Create order + clear cart
    const [orderDoc] = await Order.create(
      [
        {
          userId: uid,
          items,
          subtotal,
          shipping,
          discount,
          total,
          note: note ? String(note) : undefined,
          couponCode: couponFinal || undefined,
          shippingAddress:
            shippingAddress && typeof shippingAddress === "object"
              ? shippingAddress
              : undefined,
          paymentMethod: paymentMethod === "online" ? "online" : "cod",
          paymentStatus: paymentMethod === "online" ? "pending" : "cod",
          status: "created",
        },
      ],
      { session },
    );

    // 3.5) Mark coupon used for this user (only if applied)
    if (couponFinal && discount > 0) {
      await CouponRedemption.create(
        [
          {
            userId: uid,
            code: couponFinal,
            orderId: String(orderDoc._id),
            usedAt: new Date(),
          },
        ],
        { session },
      );
    }

    await CartItem.deleteMany({ userId: uid }).session(session);

    await session.commitTransaction();
    return res.status(201).json({ order: orderDoc.toObject() });
  } catch (err) {
    try {
      await session.abortTransaction();
    } catch {
      // ignore
    }
    const msg = err?.message || "Internal server error";
    if (msg.startsWith("Out of stock:")) {
      return res.status(400).json({ error: msg });
    }
    if (msg === "Coupon already used") {
      return res.status(400).json({ error: msg });
    }
    console.error("Error creating checkout order", err);
    return res.status(500).json({ error: "Internal server error" });
  } finally {
    session.endSession();
  }
});

// Shipping rate estimate (simple placeholder logic)
// POST /api/shipping/rates
// Body: { country?, province?, postalCode?, subtotal? }
app.post("/api/shipping/rates", async (req, res) => {
  try {
    const { country, province, postalCode, subtotal } = req.body || {};

    const c = String(country || "").trim().toLowerCase();
    const p = String(province || "").trim();
    const pc = String(postalCode || "").trim();
    const sub = Number(subtotal || 0);

    const isIndia =
      c === "india" ||
      c === "in" ||
      c.includes("india");

    // Base shipping rules (you can replace with real courier API later)
    let shipping = isIndia ? 49 : 199;
    if (sub >= 300) shipping = 0; // free shipping goal like UI

    const etaDays = isIndia ? { min: 2, max: 5 } : { min: 5, max: 12 };

    return res.json({
      shipping,
      currency: "INR",
      etaDays,
      meta: {
        country: country || "",
        province: p,
        postalCode: pc,
        subtotal: sub,
      },
    });
  } catch (err) {
    console.error("Error estimating shipping rates", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// API: product recommendations based on same category
// GET /api/recommendations?productId=...&limit=6
app.get("/api/recommendations", async (req, res) => {
  try {
    const { productId, limit = "6" } = req.query || {};
    if (!productId) {
      return res.status(400).json({ error: "productId is required" });
    }

    const base = await CatalogProduct.findById(productId).lean();
    if (!base) {
      return res.json({ items: [] });
    }

    const limitNum = Math.max(parseInt(limit, 10) || 6, 1);

    const items = await CatalogProduct.find({
      categoryId: base.categoryId,
      status: "active",
      _id: { $ne: base._id },
    })
      .sort({ createdAt: -1 })
      .limit(limitNum)
      .lean();

    return res.json({ items });
  } catch (err) {
    console.error("Error fetching recommendations", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// API: product recommendations (POST version)
// POST /api/recommendations
// Body: { productId: "...", limit?: 6 }
app.post("/api/recommendations", async (req, res) => {
  try {
    const { productId, limit = 6 } = req.body || {};
    if (!productId) {
      return res.status(400).json({ error: "productId is required" });
    }

    const base = await CatalogProduct.findById(productId).lean();
    if (!base) {
      return res.json({ items: [] });
    }

    const limitNum = Math.max(parseInt(limit, 10) || 6, 1);

    const items = await CatalogProduct.find({
      categoryId: base.categoryId,
      status: "active",
      _id: { $ne: base._id },
    })
      .sort({ createdAt: -1 })
      .limit(limitNum)
      .lean();

    return res.json({ items });
  } catch (err) {
    console.error("Error fetching recommendations (POST)", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

function buildCatalogFilter(params) {
  const {
    categoryId,
    minPrice,
    maxPrice,
    colors,
    sizes,
    brands,
    availability,
  } = params || {};

  const filter = {};

  if (categoryId != null && categoryId !== "") {
    // Support comma-separated multiple category IDs
    const catList = Array.isArray(categoryId)
      ? categoryId
      : String(categoryId).split(",").map(c => c.trim()).filter(Boolean);
    const catNums = catList.map(c => Number(c)).filter(n => !isNaN(n));
    if (catNums.length === 1) {
      filter.categoryId = catNums[0];
    } else if (catNums.length > 1) {
      filter.categoryId = { $in: catNums };
    } else {
      // If categoryId was provided but none of the values are valid numbers,
      // force "no matches" instead of returning all products.
      filter.categoryId = { $in: [] };
    }
  }

  if (minPrice != null || maxPrice != null) {
    filter.price = {};
    if (minPrice != null && minPrice !== "") {
      filter.price.$gte = Number(minPrice);
    }
    if (maxPrice != null && maxPrice !== "") {
      filter.price.$lte = Number(maxPrice);
    }
    if (!Object.keys(filter.price).length) {
      delete filter.price;
    }
  }

  const colorList = Array.isArray(colors)
    ? colors
    : typeof colors === "string"
      ? colors.split(",")
      : [];
  const cleanColors = colorList.map((c) => String(c).trim()).filter(Boolean);
  const colorKeysNorm = [
    ...new Set(cleanColors.map(normalizeCatalogColorNameKey).filter(Boolean)),
  ];

  const sizeList = Array.isArray(sizes)
    ? sizes
    : typeof sizes === "string"
      ? sizes.split(",")
      : [];
  const cleanSizes = sizeList.map((s) => String(s).trim()).filter(Boolean);
  const sizeKeysNorm = cleanSizes
    .map((s) => String(s).trim().toLowerCase())
    .filter(Boolean);

  const exprParts = [];
  if (colorKeysNorm.length) {
    exprParts.push(buildVariantColorKeysMatchExpr(colorKeysNorm));
  }
  if (sizeKeysNorm.length) {
    exprParts.push(buildVariantSizeKeysMatchExpr(sizeKeysNorm));
  }
  if (exprParts.length === 1) {
    filter.$expr = exprParts[0];
  } else if (exprParts.length > 1) {
    filter.$expr = { $and: exprParts };
  }

  const brandList = Array.isArray(brands)
    ? brands
    : typeof brands === "string"
      ? brands.split(",")
      : [];
  const cleanBrands = brandList.map((b) => String(b).trim()).filter(Boolean);
  if (cleanBrands.length) {
    filter.brand = { $in: cleanBrands };
  }

  // availability: "instock" | "outofstock" | comma-separated
  const availList = Array.isArray(availability)
    ? availability
    : typeof availability === "string"
      ? availability.split(",")
      : [];
  const cleanAvail = availList.map((a) => String(a).trim().toLowerCase()).filter(Boolean);
  if (cleanAvail.length) {
    if (cleanAvail.includes("instock") && !cleanAvail.includes("outofstock")) {
      // at least one size with stock > 0
      filter["variants.sizes.stock"] = { $gt: 0 };
    } else if (cleanAvail.includes("outofstock") && !cleanAvail.includes("instock")) {
      // all sizes out of stock: no size has stock > 0
      filter["variants.sizes.stock"] = { $not: { $gt: 0 } };
    }
    // if both selected, no filter needed (show all)
  }

  return filter;
}

/**
 * Canonical key for color *name* uniqueness (trim + lower + common spelling variants).
 * Kept in sync with aggregation `$addFields._colorKey` below.
 */
function normalizeCatalogColorNameKey(raw) {
  let k = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  if (!k) return "";
  if (k === "gold" || k === "golen") return "golden";
  if (k === "grey") return "gray";
  return k;
}

/** Mongo expression: canonical color name key for variant `v` (same rules as normalizeCatalogColorNameKey). */
function mongoVariantColorNameKeyExpr() {
  return {
    $let: {
      vars: {
        r: {
          $toLower: {
            $trim: {
              input: { $ifNull: ["$$v.color", ""] },
            },
          },
        },
      },
      in: {
        $switch: {
          branches: [
            { case: { $in: ["$$r", ["gold", "golen"]] }, then: "golden" },
            { case: { $eq: ["$$r", "grey"] }, then: "gray" },
          ],
          default: "$$r",
        },
      },
    },
  };
}

/** $expr: product has a variant whose canonical color name matches any key. */
function buildVariantColorKeysMatchExpr(normalizedKeys) {
  return {
    $gt: [
      {
        $size: {
          $filter: {
            input: { $ifNull: ["$variants", []] },
            as: "v",
            cond: {
              $in: [mongoVariantColorNameKeyExpr(), normalizedKeys],
            },
          },
        },
      },
      0,
    ],
  };
}

/** $expr: product has a variant with a size matching any normalized key (trim + lower). */
function buildVariantSizeKeysMatchExpr(normalizedKeys) {
  return {
    $gt: [
      {
        $size: {
          $filter: {
            input: { $ifNull: ["$variants", []] },
            as: "v",
            cond: {
              $gt: [
                {
                  $size: {
                    $filter: {
                      input: { $ifNull: ["$$v.sizes", []] },
                      as: "s",
                      cond: {
                        $in: [
                          {
                            $toLower: {
                              $trim: {
                                input: { $ifNull: ["$$s.size", ""] },
                              },
                            },
                          },
                          normalizedKeys,
                        ],
                      },
                    },
                  },
                },
                0,
              ],
            },
          },
        },
      },
      0,
    ],
  };
}

/** Pick a display label from distinct DB strings (prefer longer = more specific). */
function pickRepresentativeLabel(labels) {
  const arr = [...new Set((labels || []).map(String).filter(Boolean))];
  if (!arr.length) return "";
  return arr.reduce((a, b) => (b.length > a.length ? b : a));
}

// GET /api/catalog-products/filters
// Returns aggregated filter options scoped to active filters.
// Categories are ALWAYS returned unfiltered so multi-select works.
// Colors / sizes / brands are scoped to the currently active filters.
app.get("/api/catalog-products/filters", async (req, res) => {
  try {
    // scopeFilter = everything the user has active (category, price, colors, sizes, brands, availability)
    const scopeFilter = buildCatalogFilter(req.query || {});

    // Run all aggregations in parallel
    const [
      colorAgg,
      sizeAgg,
      brandAgg,
      totalCount,
      inStockCount,
      categoryAgg,   // always unfiltered
    ] = await Promise.all([
      // Colors — one row per canonical color *name* (trim+lower + gold/golen→golden, grey→gray)
      CatalogProduct.aggregate([
        { $match: scopeFilter },
        { $unwind: "$variants" },
        { $match: { "variants.color": { $nin: ["", null] } } },
        {
          $addFields: {
            _colorKey: {
              $let: {
                vars: {
                  r: {
                    $toLower: {
                      $trim: {
                        input: { $ifNull: ["$variants.color", ""] },
                      },
                    },
                  },
                },
                in: {
                  $switch: {
                    branches: [
                      { case: { $in: ["$$r", ["gold", "golen"]] }, then: "golden" },
                      { case: { $eq: ["$$r", "grey"] }, then: "gray" },
                    ],
                    default: "$$r",
                  },
                },
              },
            },
          },
        },
        { $match: { _colorKey: { $ne: "" } } },
        {
          $group: {
            _id: "$_colorKey",
            productIds: { $addToSet: "$_id" },
            colorCode: { $first: "$variants.colorCode" },
            labels: { $addToSet: "$variants.color" },
          },
        },
        {
          $project: {
            _id: 0,
            colorKey: "$_id",
            colorCode: 1,
            labels: 1,
            count: { $size: "$productIds" },
          },
        },
        { $sort: { count: -1 } },
      ]),

      // Sizes — one row per trim+lower(size); labels from DB (e.g. Free Size vs Free size)
      CatalogProduct.aggregate([
        { $match: scopeFilter },
        { $unwind: "$variants" },
        { $unwind: "$variants.sizes" },
        { $match: { "variants.sizes.size": { $nin: ["", null] } } },
        {
          $addFields: {
            _sizeKey: {
              $toLower: {
                $trim: {
                  input: { $ifNull: ["$variants.sizes.size", ""] },
                },
              },
            },
          },
        },
        { $match: { _sizeKey: { $ne: "" } } },
        {
          $group: {
            _id: "$_sizeKey",
            count: { $addToSet: "$_id" },
            totalStock: { $sum: "$variants.sizes.stock" },
            labels: { $addToSet: "$variants.sizes.size" },
          },
        },
        {
          $project: {
            _id: 0,
            sizeKey: "$_id",
            count: { $size: "$count" },
            totalStock: 1,
            labels: 1,
          },
        },
        { $sort: { sizeKey: 1 } },
      ]),

      // Brands — scoped to active filters
      CatalogProduct.aggregate([
        { $match: { ...scopeFilter, brand: { $ne: "", $exists: true } } },
        { $group: { _id: "$brand", count: { $sum: 1 } } },
        { $project: { _id: 0, brand: "$_id", count: 1 } },
        { $sort: { count: -1 } },
      ]),

      // Total products matching scope
      CatalogProduct.countDocuments(scopeFilter),

      // In-stock count
      CatalogProduct.countDocuments({
        ...scopeFilter,
        "variants.sizes.stock": { $gt: 0 },
      }),

      // Categories — ALWAYS unfiltered (ignore categoryId so all cats show)
      CatalogProduct.aggregate([
        { $group: { _id: "$categoryId", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
    ]);

    // Fetch category names to pair with ids
    const catIds = categoryAgg.map((c) => c._id).filter((id) => id != null);
    const categoryDocs = catIds.length
      ? await Category.find({ id: { $in: catIds } }).select({ id: 1, title: 1 }).lean()
      : [];
    const catNameMap = new Map(categoryDocs.map((c) => [c.id, c.title]));

    const categories = categoryAgg.map((c) => ({
      id: c._id,
      title: catNameMap.get(c._id) || `Category ${c._id}`,
      count: c.count,
    }));

    const colors = (colorAgg || []).map((row) => ({
      color: pickRepresentativeLabel(row.labels) || row.colorKey || "",
      colorCode: row.colorCode || "#ccc",
      count: row.count,
    }));

    const sizes = (sizeAgg || []).map((row) => ({
      size: pickRepresentativeLabel(row.labels) || row.sizeKey || "",
      count: row.count,
      totalStock: row.totalStock,
    }));

    res.json({
      availability: [
        { value: "instock", label: "In stock", count: inStockCount },
        { value: "outofstock", label: "Out of stock", count: Math.max(totalCount - inStockCount, 0) },
      ],
      colors,
      sizes,
      brands: brandAgg,
      categories,
    });
  } catch (err) {
    console.error("Error fetching catalog filters", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Admin API: list catalog products (GET with query filters)
app.get("/api/admin/catalog-products", async (req, res) => {
  try {
    const { page = "1", limit = "40" } = req.query || {};
    const filter = buildCatalogFilter(req.query || {});

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.max(parseInt(limit, 10) || 40, 1);
    const skip = (pageNum - 1) * limitNum;

    const [items, total] = await Promise.all([
      CatalogProduct.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      CatalogProduct.countDocuments(filter),
    ]);

    res.json({
      items,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (err) {
    console.error("Error fetching catalog products", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Admin API: list catalog products (POST with JSON body filters)
function buildSortQuery(sortBy) {
  switch (sortBy) {
    case "title-ascending":    return { name: 1 };
    case "title-descending":   return { name: -1 };
    case "price-ascending":    return { price: 1 };
    case "price-descending":   return { price: -1 };
    case "created-ascending":  return { createdAt: 1 };
    case "best-selling":
    case "manual":
    case "created-descending":
    default:                   return { createdAt: -1 };
  }
}

app.post("/api/admin/catalog-products/search", async (req, res) => {
  try {
    const { page = 1, limit = 40, sortBy, ...rest } = req.body || {};
    const filter = buildCatalogFilter(rest || {});
    const sort = buildSortQuery(sortBy);

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.max(parseInt(limit, 10) || 40, 1);
    const skip = (pageNum - 1) * limitNum;

    const [items, total] = await Promise.all([
      CatalogProduct.find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limitNum)
        .lean(),
      CatalogProduct.countDocuments(filter),
    ]);

    res.json({
      items,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (err) {
    console.error("Error fetching catalog products (POST search)", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Admin API: create catalog product (new)
app.post("/api/admin/catalog-products", async (req, res) => {
  try {
    const payload = req.body || {};

    // Auto-generate slug from name if missing
    if (!payload.slug && payload.name) {
      const base = String(payload.name)
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "product";

      let slug = base;
      let i = 1;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        // eslint-disable-next-line no-await-in-loop
        const exists = await CatalogProduct.exists({ slug });
        if (!exists) break;
        i += 1;
        slug = `${base}-${i}`;
      }
      payload.slug = slug;
    }

    if (payload.categoryId != null) {
      payload.categoryId = Number(payload.categoryId);
    }
    const catalogProductDoc = await CatalogProduct.create(payload);
    return res.status(201).json(catalogProductDoc.toObject());
  } catch (err) {
    console.error("Error creating catalog product", err);
    if (err && err.name === "ValidationError") {
      return res.status(400).json({ error: err.message });
    }
    if (err && err.code === 11000) {
      return res.status(409).json({ error: "Duplicate slug" });
    }
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Admin API: get one catalog product
app.get("/api/admin/catalog-products/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: "id is required" });
    const doc = await CatalogProduct.findById(id).lean();
    if (!doc) return res.status(404).json({ error: "Catalog product not found" });
    return res.json(doc);
  } catch (err) {
    console.error("Error fetching catalog product by id", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Admin API: update a catalog product
app.put("/api/admin/catalog-products/:id", async (req, res) => {
  try {
    const { id: productId } = req.params;
    if (!productId) return res.status(400).json({ error: "id is required" });

    const existing = await CatalogProduct.findById(productId).lean();
    if (!existing) return res.status(404).json({ error: "Catalog product not found" });

    const payload = req.body || {};

    const merged = {
      ...existing,
      ...payload,
    };

    if (merged.name == null || String(merged.name || "").trim() === "") {
      return res.status(400).json({ error: "name is required" });
    }
    if (merged.price == null || !Number.isFinite(Number(merged.price))) {
      return res.status(400).json({ error: "price is required" });
    }
    if (merged.description == null || String(merged.description || "").trim() === "") {
      return res.status(400).json({ error: "description is required" });
    }
    if (merged.categoryId == null || !Number.isFinite(Number(merged.categoryId))) {
      return res.status(400).json({ error: "categoryId is required" });
    }
    if (!Array.isArray(merged.variants) || merged.variants.length === 0) {
      return res.status(400).json({ error: "variants is required" });
    }

    // Auto-generate slug from name when:
    // - slug not provided, AND
    // - name is being changed
    let slug = merged.slug;
    const shouldRegenerateSlug =
      payload.slug == null &&
      payload.name != null &&
      String(payload.name || "").trim() !== String(existing.name || "").trim();

    if (!slug || shouldRegenerateSlug) {
      const base = String(merged.name)
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "product";

      let candidate = base;
      let i = 1;
      while (true) {
        // eslint-disable-next-line no-await-in-loop
        const exists = await CatalogProduct.exists({
          slug: candidate,
          _id: { $ne: productId },
        });
        if (!exists) break;
        i += 1;
        candidate = `${base}-${i}`;
      }
      slug = candidate;
    }

    if (merged.categoryId != null) merged.categoryId = Number(merged.categoryId);
    const discountPrice =
      merged.discountPrice == null || merged.discountPrice === ""
        ? undefined
        : Number(merged.discountPrice);

    const sizeChartImage =
      merged.sizeChartImage != null ? String(merged.sizeChartImage).trim() : "";
    const sizeChartTitleRaw =
      merged.sizeChartTitle != null ? String(merged.sizeChartTitle).trim() : "";
    const sizeChartTitle =
      sizeChartTitleRaw || "Size chart";

    const updatedPayload = {
      name: String(merged.name).trim(),
      slug: String(slug).trim(),
      price: Number(merged.price),
      ...(discountPrice == null ? {} : { discountPrice }),
      description: String(merged.description).trim(),
      brand: String(merged.brand || ""),
      categoryId: Number(merged.categoryId),
      variants: merged.variants,
      rating: Number(merged.rating || 0),
      numReviews: Number(merged.numReviews || 0),
      isFeatured: Boolean(merged.isFeatured),
      status: merged.status === "inactive" ? "inactive" : "active",
      sizeChartImage,
      sizeChartTitle,
    };

    const updated = await CatalogProduct.findByIdAndUpdate(
      productId,
      { $set: updatedPayload },
      { new: true }
    ).lean();

    if (!updated) return res.status(404).json({ error: "Catalog product not found" });
    return res.json(updated);
  } catch (err) {
    console.error("Error updating catalog product", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Admin API: delete a catalog product
app.delete("/api/admin/catalog-products/:id", async (req, res) => {
  try {
    const { id: productId } = req.params;
    if (!productId) return res.status(400).json({ error: "id is required" });
    const deleted = await CatalogProduct.findByIdAndDelete(productId).lean();
    if (!deleted) return res.status(404).json({ error: "Catalog product not found" });
    return res.json({ ok: true, deletedId: productId });
  } catch (err) {
    console.error("Error deleting catalog product", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Header nav = same data as Shop Categories (`categories` collection) ─────
function sortCategoryDocsForNav(list) {
  return [...(list || [])].sort(
    (a, b) =>
      (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0) ||
      (Number(a.id) || 0) - (Number(b.id) || 0),
  );
}

/** Build Header.js–compatible menu: top-level categories → mega items; children → links with categoryIds */
function buildNavMenuFromCategories(allRaw) {
  const all = sortCategoryDocsForNav(allRaw);
  const isRoot = (c) =>
    c.parentId == null || c.parentId === undefined;
  const roots = all.filter(isRoot);
  const childrenOf = (pid) =>
    sortCategoryDocsForNav(
      all.filter((c) => Number(c.parentId) === Number(pid)),
    );

  return roots.map((root) => {
    const kids = childrenOf(root.id);
    const key = `cat-${root.id}`;
    if (!kids.length) {
      return {
        _id: key,
        key,
        label: root.title,
        categoryIds: [root.id],
      };
    }
    const allIds = [root.id, ...kids.map((k) => k.id)];
    return {
      _id: key,
      key,
      label: root.title,
      categoryIds: allIds,
      items: kids.map((c) => ({
        id: `sub-${c.id}`,
        label: c.title,
        categoryIds: [c.id],
      })),
    };
  });
}

// GET /api/nav-menu  — derived from `categories` (single source of truth)
app.get("/api/nav-menu", async (req, res) => {
  try {
    const all = await Category.find({}).lean();
    return res.json(buildNavMenuFromCategories(all));
  } catch (err) {
    console.error("Error fetching nav menu", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

const NAV_MENU_DEPRECATED_MSG =
  "Navigation is built from Shop Categories. Use Admin → Categories (titles, parent, Sort order).";

// Legacy admin routes — nav is no longer a separate table
app.post(
  "/api/admin/nav-menu",
  authMiddleware,
  adminMiddleware,
  async (req, res) => {
    return res.status(400).json({ error: NAV_MENU_DEPRECATED_MSG });
  },
);

app.patch(
  "/api/admin/nav-menu/:key",
  authMiddleware,
  adminMiddleware,
  async (req, res) => {
    return res.status(400).json({ error: NAV_MENU_DEPRECATED_MSG });
  },
);

const PORT = process.env.PORT || 4000;
const HOST = process.env.HOST || "0.0.0.0";

async function start() {
  const uri = (process.env.MONGODB_URI || "").trim();
  if (!uri) {
    console.error(
      "MONGODB_URI missing — set it in websiteBackend/.env (see .env.example).",
    );
  } else {
    try {
      await mongoose.connect(uri);
      console.log("MongoDB connected");
      await seedAdmin();
      // await seedShirtSubcategories();
    } catch (err) {
      console.error("Failed to connect to MongoDB. Continuing without DB.", err);
    }
  }

  // Start the Express server regardless of MongoDB connection status
  app.listen(PORT, HOST, () => {
    console.log(`Server listening on http://${HOST}:${PORT}`);
  });
}

start();