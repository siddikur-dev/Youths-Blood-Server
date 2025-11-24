const express = require("express");
const app = express();
const cors = require("cors");
const bcrypt = require("bcryptjs");
const port = process.env.PORT || 5000;
require("dotenv").config();


run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Youth's Blood Server Running!");
});

app.listen(port, () => {
  console.log(`Youth's Blood server running on port ${port}`);
});