const mongoose = require("mongoose");

const sliderSlideSchema = new mongoose.Schema(
  {
    // Numeric id used for ordering and to avoid duplicate-key issues
    id: { type: Number, required: true, index: true, unique: true },
    title: { type: String, required: true },
    subtitle: { type: [String], required: true },
    // Store a single URL string
    images: { type: String, required: true },
  },
  { timestamps: true },
);

module.exports = mongoose.model("SliderSlide", sliderSlideSchema);

