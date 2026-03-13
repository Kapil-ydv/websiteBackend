require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const mixMatchLooks = [
  {
    id: "look-1",
    dataId: "shop_this_look_amDhCa",
    image: {
      src: "cdn/shop/files/lookbook-24338.jpg?v=1708490777&width=1500",
      alt: "lookbook image shop_this_look_amDhCa",
      srcSet:
        "//fashion.minimog.co/cdn/shop/files/lookbook-2.webp?v=1708490777&width=375 375w, //fashion.minimog.co/cdn/shop/files/lookbook-2.webp?v=1708490777&width=550 550w, //fashion.minimog.co/cdn/shop/files/lookbook-2.webp?v=1708490777&width=750 750w, //fashion.minimog.co/cdn/shop/files/lookbook-2.webp?v=1708490777&width=1100 1100w, //fashion.minimog.co/cdn/shop/files/lookbook-2.webp?v=1708490777&width=1500 1500w",
      width: 906,
      height: "1268.9999999999998",
    },
    headingText: "Beautifully Functional. Purposefully Designed.",
    products: [
      {
        dataId: "shop_this_look_amDhCa--content",
        href: "zh/products/flared-trousers.html",
        imgSrc:
          "cdn/shop/files/47871690_900baefb-2629-4a3f-be32-4bde20cbd55253da.jpg?crop=center&height=66&v=1708500574&width=50",
        imgAlt: "Flared Trousers",
        imgSrcSet:
          "//fashion.minimog.co/cdn/shop/files/47871690_900baefb-2629-4a3f-be32-4bde20cbd552.webp?crop=center&height=66&v=1708500574&width=50 50w",
        title: "Flared Trousers",
        price: "$76.00",
      },
      {
        dataId: "shop_this_look_amDhCa--content",
        href: "zh/products/short-sleeve-t-shirt.html",
        imgSrc:
          "cdn/shop/files/47871696f279.jpg?crop=center&height=66&v=1708499887&width=50",
        imgAlt: "Short sleeve T-shirt",
        imgSrcSet:
          "//fashion.minimog.co/cdn/shop/files/47871696.webp?crop=center&height=66&v=1708499887&width=50 50w",
        title: "Short sleeve T-shirt",
        price: "$69.00",
      },
    ],
  },
  {
    id: "look-2",
    dataId: "shop_this_look_AVdw3f",
    image: {
      src: "cdn/shop/files/lookbook-3_bc7bcae7-cb23-4629-a100-5952dd11fec533d2.jpg?v=1708490894&width=1500",
      alt: "lookbook image shop_this_look_AVdw3f",
      srcSet:
        "//fashion.minimog.co/cdn/shop/files/lookbook-3_bc7bcae7-cb23-4629-a100-5952dd11fec5.webp?v=1708490894&width=375 375w, //fashion.minimog.co/cdn/shop/files/lookbook-3_bc7bcae7-cb23-4629-a100-5952dd11fec5.webp?v=1708490894&width=550 550w, //fashion.minimog.co/cdn/shop/files/lookbook-3_bc7bcae7-cb23-4629-a100-5952dd11fec5.webp?v=1708490894&width=750 750w, //fashion.minimog.co/cdn/shop/files/lookbook-3_bc7bcae7-cb23-4629-a100-5952dd11fec5.webp?v=1708490894&width=1100 1100w, //fashion.minimog.co/cdn/shop/files/lookbook-3_bc7bcae7-cb23-4629-a100-5952dd11fec5.webp?v=1708490894&width=1500 1500w",
      width: 906,
      height: "1268.9999999999998",
    },
    headingText: "Beautifully Functional. Purposefully Designed.",
    products: [
      {
        dataId: "shop_this_look_AVdw3f--content",
        href: "zh/products/bardot-sweater-1.html",
        imgSrc:
          "cdn/shop/files/47871684_b7ade5f4-d637-43d3-a3fe-ee6aebfb1496e16f.jpg?crop=center&height=66&v=1708500459&width=50",
        imgAlt: "Bardot Sweater",
        imgSrcSet:
          "//fashion.minimog.co/cdn/shop/files/47871684_b7ade5f4-d637-43d3-a3fe-ee6aebfb1496.webp?crop=center&height=66&v=1708500459&width=50 50w",
        title: "Bardot Sweater",
        price: "$105.00",
      },
      {
        dataId: "shop_this_look_AVdw3f--content",
        href: "zh/products/flared-grey.html",
        imgSrc:
          "cdn/shop/files/47871691_14249914-e5f0-4795-b269-2b82037de0e4dca0.jpg?crop=center&height=66&v=1709200976&width=50",
        imgAlt: "Flared Grey",
        imgSrcSet:
          "//fashion.minimog.co/cdn/shop/files/47871691_14249914-e5f0-4795-b269-2b82037de0e4.webp?crop=center&height=66&v=1709200976&width=50 50w",
        title: "Flared Grey",
        price: "$76.00",
      },
    ],
  },
  {
    id: "look-3",
    dataId: "shop_this_look_EcLGgQ",
    image: {
      src: "cdn/shop/files/lookbook-44338.jpg?v=1708490777&width=1500",
      alt: "lookbook image shop_this_look_EcLGgQ",
      srcSet:
        "//fashion.minimog.co/cdn/shop/files/lookbook-4.webp?v=1708490777&width=375 375w, //fashion.minimog.co/cdn/shop/files/lookbook-4.webp?v=1708490777&width=550 550w, //fashion.minimog.co/cdn/shop/files/lookbook-4.webp?v=1708490777&width=750 750w, //fashion.minimog.co/cdn/shop/files/lookbook-4.webp?v=1708490777&width=1100 1100w, //fashion.minimog.co/cdn/shop/files/lookbook-4.webp?v=1708490777&width=1500 1500w",
      width: 906,
      height: "1268.9999999999998",
    },
    headingText: "The t-shirt is designed with a crewneck collar.",
    products: [
      {
        dataId: "shop_this_look_EcLGgQ--content",
        href: "zh/products/the-cotton-tan.html",
        imgSrc:
          "cdn/shop/products/47871697bc7f.jpg?crop=center&height=66&v=1708332609&width=50",
        imgAlt: "The Cotton Tan",
        imgSrcSet:
          "//fashion.minimog.co/cdn/shop/products/47871697.webp?crop=center&height=66&v=1708332609&width=50 50w",
        title: "The Cotton Tan",
        price: "$58.00",
      },
      {
        dataId: "shop_this_look_EcLGgQ--content",
        href: "zh/products/faded-effect-jean.html",
        imgSrc:
          "cdn/shop/files/47871702_07417b37-03d2-4c1e-919d-21431f912a81b8f5.jpg?crop=center&height=66&v=1708499674&width=50",
        imgAlt: "Faded Effect Jean",
        imgSrcSet:
          "//fashion.minimog.co/cdn/shop/files/47871702_07417b37-03d2-4c1e-919d-21431f912a81.webp?crop=center&height=66&v=1708499674&width=50 50w",
        title: "Faded Effect Jean",
        price: "$87.00",
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
const categorySchema = new mongoose.Schema(
  {
    id: { type: Number, required: true, index: true, unique: true },
    title: { type: String, required: true },
    href: { type: String },
    ariaLabel: { type: String },
    ctaAriaLabel: { type: String },
    count: { type: String },
    animationOrder: { type: String },
    img: {
      wrapperClassName: { type: String },
      imgClassName: { type: String },
      src: { type: String },
      srcSet: { type: String },
      width: { type: Number },
      height: { type: Number },
    },
  },
  { timestamps: true },
);

const Category = mongoose.model("Category", categorySchema, "categories");

// API to get all slider slides from DB
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

    const doc = await SliderSlide.create({
      id: nextId,
      title,
      subtitle,
      images: imageUrl, // sirf single URL string store ho rahi hai
    });

    return res.status(201).json(doc.toObject());
  } catch (err) {
    console.error("Error creating slider slide", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// API to get all categories from MongoDB (used by ShopCatogries.jsx)
app.get("/api/categories", async (req, res) => {
  try {
    const categories = await Category.find().sort({ id: 1 }).lean();
    res.json(categories);
  } catch (err) {
    console.error("Error fetching categories", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// API to get Mix & Match looks (used by MixMatch.jsx)
app.get("/api/mixmatch", (req, res) => {
  res.json(mixMatchLooks);
});

// Simple example schema/model
const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    price: { type: Number, required: true },
  },
  { timestamps: true },
);
const Product = mongoose.model("Product", productSchema);

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

const PORT = process.env.PORT || 4000;

async function start() {
  const uri =
    process.env.MONGODB_URI ||
    "mongodb+srv://akashsaini5377:akashsaini12345@cluster0.nltdj.mongodb.net/Website?retryWrites=true&w=majority&appName=Cluster0";

  try {
    await mongoose.connect(uri);
    console.log("MongoDB connected");
  } catch (err) {
    console.error("Failed to connect to MongoDB. Continuing without DB.", err);
  }

  // Start the Express server regardless of MongoDB connection status
  app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

start();
