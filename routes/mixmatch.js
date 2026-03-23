const express = require("express");
const mixMatchLooks = require("../data/mixMatchLooks");

const router = express.Router();

// GET /api/mixmatch
router.get("/mixmatch", (req, res) => {
  res.json(mixMatchLooks);
});

module.exports = router;

