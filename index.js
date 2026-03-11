require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Basic health route
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "Backend is running" });
});

// Slider data (for homepage hero slider)
// Seed data for slider (used once to populate DB)
const sliderSlides = [
  {
    id: 0,
    subtitle: "New Arrivals",
    title: ["Venice Haute", "Couture"],
    buttonHref: "/AllProducts",
    footerLink: "/AllProducts",
    images: {
      mobile: {
        srcSet:
          "//fashion.minimog.co/cdn/shop/files/mobile-slide-1.webp?v=1709177317&width=400 400w, " +
          "//fashion.minimog.co/cdn/shop/files/mobile-slide-1.webp?v=1709177317&width=600 600w, " +
          "//fashion.minimog.co/cdn/shop/files/mobile-slide-1.webp?v=1709177317&width=800 800w, " +
          "//fashion.minimog.co/cdn/shop/files/mobile-slide-1.webp?v=1709177317&width=1000 1000w",
      },
      desktop: {
        src: "//fashion.minimog.co/cdn/shop/files/slideshow-187fa.jpg?v=1708484484&width=3840",
        srcSet:
          "//fashion.minimog.co/cdn/shop/files/slideshow-1.webp?v=1708484484&width=300 300w, " +
          "//fashion.minimog.co/cdn/shop/files/slideshow-1.webp?v=1708484484&width=400 400w, " +
          "//fashion.minimog.co/cdn/shop/files/slideshow-1.webp?v=1708484484&width=500 500w, " +
          "//fashion.minimog.co/cdn/shop/files/slideshow-1.webp?v=1708484484&width=600 600w, " +
          "//fashion.minimog.co/cdn/shop/files/slideshow-1.webp?v=1708484484&width=700 700w, " +
          "//fashion.minimog.co/cdn/shop/files/slideshow-1.webp?v=1708484484&width=800 800w, " +
          "//fashion.minimog.co/cdn/shop/files/slideshow-1.webp?v=1708484484&width=900 900w, " +
          "//fashion.minimog.co/cdn/shop/files/slideshow-1.webp?v=1708484484&width=1000 1000w, " +
          "//fashion.minimog.co/cdn/shop/files/slideshow-1.webp?v=1708484484&width=1200 1200w, " +
          "//fashion.minimog.co/cdn/shop/files/slideshow-1.webp?v=1708484484&width=1400 1400w, " +
          "//fashion.minimog.co/cdn/shop/files/slideshow-1.webp?v=1708484484&width=1600 1600w, " +
          "//fashion.minimog.co/cdn/shop/files/slideshow-1.webp?v=1708484484&width=1800 1800w, " +
          "//fashion.minimog.co/cdn/shop/files/slideshow-1.webp?v=1708484484&width=2000 2000w, " +
          "//fashion.minimog.co/cdn/shop/files/slideshow-1.webp?v=1708484484&width=2200 2200w, " +
          "//fashion.minimog.co/cdn/shop/files/slideshow-1.webp?v=1708484484&width=2400 2400w, " +
          "//fashion.minimog.co/cdn/shop/files/slideshow-1.webp?v=1708484484&width=2600 2600w, " +
          "//fashion.minimog.co/cdn/shop/files/slideshow-1.webp?v=1708484484&width=2800 2800w, " +
          "//fashion.minimog.co/cdn/shop/files/slideshow-1.webp?v=1708484484&width=3000 3000w, " +
          "//fashion.minimog.co/cdn/shop/files/slideshow-1.webp?v=1708484484&width=3200 3200w",
      },
    },
  },
  {
    id: 1,
    subtitle: "New Arrivals",
    title: ["Responsible", "Denim Lab"],
    buttonHref: "/AllProducts",
    footerLink: "/AllProducts",
    images: {
      mobile: {
        srcSet:
          "//fashion.minimog.co/cdn/shop/files/mobile-slide-3.webp?v=1709177317&width=400 400w, " +
          "//fashion.minimog.co/cdn/shop/files/mobile-slide-3.webp?v=1709177317&width=600 600w, " +
          "//fashion.minimog.co/cdn/shop/files/mobile-slide-3.webp?v=1709177317&width=800 800w, " +
          "//fashion.minimog.co/cdn/shop/files/mobile-slide-3.webp?v=1709177317&width=1000 1000w",
      },
      desktop: {
        src: "//fashion.minimog.co/cdn/shop/files/slideshow-287fa.jpg?v=1708484484&width=3840",
        srcSet:
          "//fashion.minimog.co/cdn/shop/files/slideshow-2.webp?v=1708484484&width=300 300w, " +
          "//fashion.minimog.co/cdn/shop/files/slideshow-2.webp?v=1708484484&width=400 400w, " +
          "//fashion.minimog.co/cdn/shop/files/slideshow-2.webp?v=1708484484&width=500 500w, " +
          "//fashion.minimog.co/cdn/shop/files/slideshow-2.webp?v=1708484484&width=600 600w, " +
          "//fashion.minimog.co/cdn/shop/files/slideshow-2.webp?v=1708484484&width=700 700w, " +
          "//fashion.minimog.co/cdn/shop/files/slideshow-2.webp?v=1708484484&width=800 800w, " +
          "//fashion.minimog.co/cdn/shop/files/slideshow-2.webp?v=1708484484&width=900 900w, " +
          "//fashion.minimog.co/cdn/shop/files/slideshow-2.webp?v=1708484484&width=1000 1000w, " +
          "//fashion.minimog.co/cdn/shop/files/slideshow-2.webp?v=1708484484&width=1200 1200w, " +
          "//fashion.minimog.co/cdn/shop/files/slideshow-2.webp?v=1708484484&width=1400 1400w, " +
          "//fashion.minimog.co/cdn/shop/files/slideshow-2.webp?v=1708484484&width=1600 1600w, " +
          "//fashion.minimog.co/cdn/shop/files/slideshow-2.webp?v=1708484484&width=1800 1800w, " +
          "//fashion.minimog.co/cdn/shop/files/slideshow-2.webp?v=1708484484&width=2000 2000w, " +
          "//fashion.minimog.co/cdn/shop/files/slideshow-2.webp?v=1708484484&width=2200 2200w, " +
          "//fashion.minimog.co/cdn/shop/files/slideshow-2.webp?v=1708484484&width=2400 2400w, " +
          "//fashion.minimog.co/cdn/shop/files/slideshow-2.webp?v=1708484484&width=2600 2600w, " +
          "//fashion.minimog.co/cdn/shop/files/slideshow-2.webp?v=1708484484&width=2800 2800w, " +
          "//fashion.minimog.co/cdn/shop/files/slideshow-2.webp?v=1708484484&width=3000 3000w, " +
          "//fashion.minimog.co/cdn/shop/files/slideshow-2.webp?v=1708484484&width=3200 3200w",
      },
    },
  },
  {
    id: 2,
    subtitle: "New Arrivals",
    title: ["Ultimate Winter", "Warmer"],
    buttonHref: "/AllProducts",
    footerLink: "/AllProducts",
    images: {
      mobile: {
        srcSet:
          "//fashion.minimog.co/cdn/shop/files/mobile-slide-2.webp?v=1709177317&width=400 400w, " +
          "//fashion.minimog.co/cdn/shop/files/mobile-slide-2.webp?v=1709177317&width=600 600w, " +
          "//fashion.minimog.co/cdn/shop/files/mobile-slide-2.webp?v=1709177317&width=800 800w, " +
          "//fashion.minimog.co/cdn/shop/files/mobile-slide-2.webp?v=1709177317&width=1000 1000w",
      },
      desktop: {
        src: "//fashion.minimog.co/cdn/shop/files/slideshow-387fa.jpg?v=1708484484&width=3840",
        srcSet:
          "//fashion.minimog.co/cdn/shop/files/slideshow-3.webp?v=1708484484&width=300 300w, " +
          "//fashion.minimog.co/cdn/shop/files/slideshow-3.webp?v=1708484484&width=400 400w, " +
          "//fashion.minimog.co/cdn/shop/files/slideshow-3.webp?v=1708484484&width=500 500w, " +
          "//fashion.minimog.co/cdn/shop/files/slideshow-3.webp?v=1708484484&width=600 600w, " +
          "//fashion.minimog.co/cdn/shop/files/slideshow-3.webp?v=1708484484&width=700 700w, " +
          "//fashion.minimog.co/cdn/shop/files/slideshow-3.webp?v=1708484484&width=800 800w, " +
          "//fashion.minimog.co/cdn/shop/files/slideshow-3.webp?v=1708484484&width=900 900w, " +
          "//fashion.minimog.co/cdn/shop/files/slideshow-3.webp?v=1708484484&width=1000 1000w, " +
          "//fashion.minimog.co/cdn/shop/files/slideshow-3.webp?v=1708484484&width=1200 1200w, " +
          "//fashion.minimog.co/cdn/shop/files/slideshow-3.webp?v=1708484484&width=1400 1400w, " +
          "//fashion.minimog.co/cdn/shop/files/slideshow-3.webp?v=1708484484&width=1600 1600w, " +
          "//fashion.minimog.co/cdn/shop/files/slideshow-3.webp?v=1708484484&width=1800 1800w, " +
          "//fashion.minimog.co/cdn/shop/files/slideshow-3.webp?v=1708484484&width=2000 2000w, " +
          "//fashion.minimog.co/cdn/shop/files/slideshow-3.webp?v=1708484484&width=2200 2200w, " +
          "//fashion.minimog.co/cdn/shop/files/slideshow-3.webp?v=1708484484&width=2400 2400w, " +
          "//fashion.minimog.co/cdn/shop/files/slideshow-3.webp?v=1708484484&width=2600 2600w, " +
          "//fashion.minimog.co/cdn/shop/files/slideshow-3.webp?v=1708484484&width=2800 2800w, " +
          "//fashion.minimog.co/cdn/shop/files/slideshow-3.webp?v=1708484484&width=3000 3000w, " +
          "//fashion.minimog.co/cdn/shop/files/slideshow-3.webp?v=1708484484&width=3200 3200w",
      },
    },
  },
];

// Static data for Mix & Match looks (used by MixMatch.jsx)
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

// Mongoose schema/model for slider slides
const sliderSlideSchema = new mongoose.Schema(
  {
    id: { type: Number, required: true, index: true, unique: true },
    subtitle: { type: String, required: true },
    title: { type: [String], required: true },
    buttonHref: { type: String, required: true },
    footerLink: { type: String, required: true },
    images: {
      mobile: {
        srcSet: { type: String, required: true },
      },
      desktop: {
        src: { type: String, required: true },
        srcSet: { type: String, required: true },
      },
    },
  },
  { timestamps: true }
);

const SliderSlide = mongoose.model("SliderSlide", sliderSlideSchema);

// Mongoose schema/model for categories (uses existing "categories" collection)
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
  { timestamps: true }
);

// Explicitly bind to the "categories" collection
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
  { timestamps: true }
);

const Product = mongoose.model("Product", productSchema);

// Paginated products: returns data in chunks using ?page=&limit=
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
    "mongodb+srv://akashsaini5377:akashsaini12345@cluster0.nltdj.mongodb.net/FashionStore?retryWrites=true&w=majority&appName=Cluster0";

  try {
    await mongoose.connect(uri);
    console.log("MongoDB connected");

    // Seed slider slides once if collection is empty
    const count = await SliderSlide.estimatedDocumentCount();
    if (count === 0) {
      await SliderSlide.insertMany(sliderSlides);
      console.log("Seeded slider slides into database");
    }
  } catch (err) {
    console.error("Failed to connect to MongoDB. Continuing without DB.", err);
  }

  // Start the Express server regardless of MongoDB connection status
  app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

start();

