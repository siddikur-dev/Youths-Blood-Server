const express = require("express");
const app = express();
const cors = require("cors");
const bcrypt = require("bcryptjs");
const port = process.env.PORT || 5000;
require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_KEY);

// middleware
app.use(cors());
app.use(express.json());

function generateTrackingId() {
  const prefix = "TRK";

  // format: YYYYMMDD
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");

  // random hex (8 chars)
  const randomHex = crypto.randomBytes(4).toString("hex").toUpperCase();

  return `${prefix}-${date}-${randomHex}`;
}

// MongoDB Server Connection
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const uri = `mongodb+srv://${process.env.DB_USERNAME}:${process.env.DB_PASS}@cluster0.rfkbq1n.mongodb.net/?appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    const bloodDB = client.db("bloodDB");
    const bloodCollection = bloodDB.collection("bloods");
    const usersCollection = bloodDB.collection("users");
    const bookingsCollection = bloodDB.collection("bookings");
    const bookingsPayment = bloodDB.collection("bookings_payment");
    const userActivitiesCollection = bloodDB.collection("user_activities");

    // app.post("/users", async (req, res) => {
    //   const userInfo = req.body;
    //   const result = await usersCollection.insertOne(userInfo);
    //   res.send(result);
    // });

    app.post("/users", async (req, res) => {
      const user = req.body;
      user.role = "user";
      const email = user.email;
      const existUser = await usersCollection.findOne({ email });
      if (existUser) {
        return res.send({ message: "This user exists" });
      }
      user.createdAt = new Date();
      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    app.get("/users/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email };
      // Check if email is provided
      if (!email) {
        return res.status(400).json({
          success: false,
          message: "Email is required",
        });
      }
      const result = await usersCollection.findOne(query);
      res.send(result);
    });

    //  bookings related api
    app.post("/bookings", async (req, res) => {
      const bookingInfo = req.body;
      const result = await bookingsCollection.insertOne(bookingInfo);
      res.send(result);
    });

    app.get("/bookings", async (req, res) => {
      const result = await bookingsCollection.find().toArray();
      res.send(result);
    });

    app.get("/bookings/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email };
      // Check if email is provided
      if (!email) {
        return res.status(400).json({
          success: false,
          message: "Email is required",
        });
      }
      // const query = { _id: new ObjectId(req.params.id) };
      const result = await bookingsCollection.find(query).toArray();
      res.send(result);
    });

    app.delete("/bookings/:id", async (req, res) => {
      const query = { _id: new ObjectId(req.params.id) };
      const result = await bookingsCollection.deleteOne(query);
      res.send(result);
    });

    // payment related api

    app.post("/create-checkout-session", async (req, res) => {
      const paymentInfo = req.body;
      const amount = parseInt(paymentInfo.totalPrice) * 100;

      const session = await stripe.checkout.sessions.create({
        line_items: [
          {
            price_data: {
              currency: "USD",
              product_data: {
                name: paymentInfo.displayName,
              },
              unit_amount: amount,
            },
            quantity: 1,
          },
        ],

        metadata: {
          bookingId: paymentInfo._id, // ⭐ MUST ADD THIS
          product_name: paymentInfo.displayName,
        },

        customer_email: paymentInfo.email,
        mode: "payment",

        success_url: `${process.env.SITE_DOMAIN}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.SITE_DOMAIN}/dashboard/payment-cancelled`,
      });

      res.json({ url: session.url });
    });

    app.get("/payments", async (req, res) => {
      const email = req.query.email;
      const query = {};

      if (email) {
        query.customerEmail = email;
      }

      const result = await bookingsPayment
        .find(query)
        .sort({ paidAt: -1 })
        .toArray();

      res.send(result);
    });

    app.patch("/payment-success", async (req, res) => {
      try {
        const sessionId = req.query.session_id;
        const session = await stripe.checkout.sessions.retrieve(sessionId);

        if (session.payment_status !== "paid") {
          return res.send({ success: false });
        }

        const bookingId = session.metadata.bookingId; // এখন value আসবে!
        const filter = { _id: new ObjectId(bookingId) };

        const updateDoc = {
          $set: {
            paymentStatus: "paid",
          },
        };

        const result = await bookingsCollection.updateOne(filter, updateDoc);

        res.send({
          success: true,
          updated: result.modifiedCount === 1,
        });
      } catch (error) {
        console.log(error);
        res.status(500).send({ success: false, error: error.message });
      }
    });

    // Connect the client to the server
    // await client.connect();

    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Youth's Blood Server Running!");
});

app.listen(port, () => {
  console.log(`Youth's Blood server running on port ${port}`);
});
