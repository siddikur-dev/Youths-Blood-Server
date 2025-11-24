const express = require("express");
const app = express();
const cors = require("cors");
const bcrypt = require("bcryptjs");
const port = process.env.PORT || 5000;
require("dotenv").config();

// middleware
app.use(
  cors({
    origin: "http://localhost:3000",
    credentials: true,
  })
);
app.use(express.json());

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
    const userActivitiesCollection = bloodDB.collection("user_activities");

    // Connect the client to the server
    await client.connect();

    // ========== USER MANAGEMENT & TRACKING APIs ========== //

    // User registration with password hashing
    app.post("/auth/register", async (req, res) => {
      try {
        const userData = req.body;
        console.log("Registration attempt for:", userData.email);

        // Check if user already exists
        const existingUser = await usersCollection.findOne({
          email: userData.email,
        });
        if (existingUser) {
          return res.status(400).send({
            success: false,
            message: "User already exists with this email",
          });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(userData.password, 12);

        // Save user with hashed password
        const userResult = await usersCollection.insertOne({
          name: userData.name,
          email: userData.email,
          password: hashedPassword,
          bloodGroup: userData.bloodGroup,
          phone: userData.phone,
          address: userData.address,
          role: "user",
          createdAt: new Date(),
          status: "active",
          lastLogin: new Date(),
          loginCount: 0
        });

        // Track registration activity
        await userActivitiesCollection.insertOne({
          userId: userResult.insertedId,
          email: userData.email,
          activityType: "registration",
          timestamp: new Date(),
          userAgent: req.headers["user-agent"],
          ip: req.ip || req.connection.remoteAddress,
        });

        console.log("User registered successfully:", userData.email);
        
        res.send({
          success: true,
          userId: userResult.insertedId,
          message: "User registered successfully",
        });
      } catch (error) {
        console.error("Registration error:", error);
        res.status(500).send({
          success: false,
          message: "Registration failed",
        });
      }
    });

    // User login with bcrypt verification
    app.post("/api/auth/login", async (req, res) => {
      try {
        const { email, password } = req.body;
        console.log("Login attempt for:", email);

        // Check if user exists
        const user = await usersCollection.findOne({ email: email });
        if (!user) {
          console.log("User not found:", email);
          return res.status(401).send({
            success: false,
            message: "Invalid email or password",
          });
        }

        console.log("User found, verifying password...");

        // Verify password with bcrypt
        const isPasswordValid = await bcrypt.compare(password, user.password);

        if (!isPasswordValid) {
          console.log("Invalid password for:", email);
          return res.status(401).send({
            success: false,
            message: "Invalid email or password",
          });
        }

        console.log("Password valid, updating login info...");

        // Update last login time
        await usersCollection.updateOne(
          { email: email },
          {
            $set: {
              lastLogin: new Date(),
            },
            $inc: {
              loginCount: 1
            }
          }
        );

        // Track login activity
        await userActivitiesCollection.insertOne({
          userId: user._id,
          email: email,
          activityType: "login",
          timestamp: new Date(),
          userAgent: req.headers["user-agent"],
          ip: req.ip || req.connection.remoteAddress,
        });

        // Return user data (password বাদ দিয়ে)
        const userResponse = {
          _id: user._id.toString(),
          id: user._id.toString(),
          name: user.name,
          email: user.email,
          role: user.role,
          bloodGroup: user.bloodGroup,
          phone: user.phone,
          address: user.address,
          createdAt: user.createdAt,
          lastLogin: user.lastLogin
        };

        console.log("Login successful for:", email);
        
        res.send({
          success: true,
          user: userResponse,
          message: "Login successful"
        });
        
      } catch (error) {
        console.error("Login error:", error);
        res.status(500).send({
          success: false,
          message: "Login failed",
        });
      }
    });

    // Temporary: Plain password login for existing users (Remove after testing)
    app.post("/api/auth/login-plain", async (req, res) => {
      try {
        const { email, password } = req.body;
        console.log("Plain login attempt for:", email);

        const user = await usersCollection.findOne({ email: email });
        if (!user) {
          return res.status(401).send({
            success: false,
            message: "Invalid email or password",
          });
        }

        // Plain password comparison
        const isPasswordValid = user.password === password;

        if (!isPasswordValid) {
          return res.status(401).send({
            success: false,
            message: "Invalid email or password",
          });
        }

        // Update user with hashed password
        const hashedPassword = await bcrypt.hash(password, 12);
        await usersCollection.updateOne(
          { email: email },
          {
            $set: {
              password: hashedPassword,
              lastLogin: new Date(),
            },
            $inc: {
              loginCount: 1
            }
          }
        );

        const userResponse = {
          _id: user._id.toString(),
          id: user._id.toString(),
          name: user.name,
          email: user.email,
          role: user.role,
          bloodGroup: user.bloodGroup,
          phone: user.phone,
          address: user.address,
          createdAt: user.createdAt,
          lastLogin: user.lastLogin
        };

        res.send({
          success: true,
          user: userResponse,
          message: "Login successful (password migrated to hashed)"
        });
        
      } catch (error) {
        console.error("Plain login error:", error);
        res.status(500).send({
          success: false,
          message: "Login failed",
        });
      }
    });

    // Reset user password to hashed version
    app.patch("/auth/migrate-password/:email", async (req, res) => {
      try {
        const { email } = req.params;
        const { newPassword } = req.body;

        const user = await usersCollection.findOne({ email: email });
        if (!user) {
          return res.status(404).send({
            success: false,
            message: "User not found"
          });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 12);
        
        const result = await usersCollection.updateOne(
          { email: email },
          {
            $set: {
              password: hashedPassword
            }
          }
        );

        res.send({
          success: true,
          message: "Password migrated to hashed successfully"
        });
      } catch (error) {
        console.error("Password migration error:", error);
        res.status(500).send({
          success: false,
          message: "Password migration failed"
        });
      }
    });

    // User login activity tracking
    app.post("/auth/login-activity", async (req, res) => {
      try {
        const { email, loginTime } = req.body;

        const user = await usersCollection.findOne({ email: email });
        if (!user) {
          return res.status(404).send({
            success: false,
            message: "User not found",
          });
        }

        await usersCollection.updateOne(
          { email: email },
          {
            $set: {
              lastLogin: new Date(loginTime),
            },
            $inc: {
              loginCount: 1
            }
          }
        );

        await userActivitiesCollection.insertOne({
          userId: user._id,
          email: email,
          activityType: "login",
          timestamp: new Date(loginTime),
          userAgent: req.headers["user-agent"],
          ip: req.ip || req.connection.remoteAddress,
        });

        res.send({
          success: true,
          message: "Login activity tracked",
        });
      } catch (error) {
        console.error("Login activity error:", error);
        res.status(500).send({
          success: false,
          message: "Failed to track login activity",
        });
      }
    });

    // Get all users (For admin dashboard)
    app.get("/auth/users", async (req, res) => {
      try {
        const users = await usersCollection
          .find({})
          .project({ password: 0 }) // Password exclude করুন
          .sort({ createdAt: -1 })
          .toArray();
        res.send({
          success: true,
          data: users,
        });
      } catch (error) {
        console.error("Get users error:", error);
        res.status(500).send({
          success: false,
          message: "Failed to fetch users",
        });
      }
    });

    // Get user activities (For admin dashboard)
    app.get("/auth/activities", async (req, res) => {
      try {
        const { limit = 100, type } = req.query;
        let query = {};

        if (type) {
          query.activityType = type;
        }

        const activities = await userActivitiesCollection
          .find(query)
          .sort({ timestamp: -1 })
          .limit(parseInt(limit))
          .toArray();

        res.send({
          success: true,
          data: activities,
        });
      } catch (error) {
        console.error("Get activities error:", error);
        res.status(500).send({
          success: false,
          message: "Failed to fetch activities",
        });
      }
    });

    // Get user statistics
    app.get("/auth/statistics", async (req, res) => {
      try {
        const totalUsers = await usersCollection.countDocuments();
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const todayLogins = await userActivitiesCollection.countDocuments({
          activityType: "login",
          timestamp: { $gte: today },
        });

        const totalLogins = await userActivitiesCollection.countDocuments({
          activityType: "login",
        });

        const todayRegistrations = await userActivitiesCollection.countDocuments({
          activityType: "registration",
          timestamp: { $gte: today },
        });

        const totalBloodRequests = await bloodCollection.countDocuments();
        const pendingBloodRequests = await bloodCollection.countDocuments({
          status: "pending",
        });

        res.send({
          success: true,
          data: {
            totalUsers,
            todayLogins,
            totalLogins,
            todayRegistrations,
            totalBloodRequests,
            pendingBloodRequests,
          },
        });
      } catch (error) {
        console.error("Get statistics error:", error);
        res.status(500).send({
          success: false,
          message: "Failed to fetch statistics",
        });
      }
    });

    // Get user by email
    app.get("/auth/users/:email", async (req, res) => {
      try {
        const email = req.params.email;
        const user = await usersCollection.findOne(
          { email: email },
          { projection: { password: 0 } } // Password exclude
        );

        if (!user) {
          return res.status(404).send({
            success: false,
            message: "User not found",
          });
        }

        res.send({
          success: true,
          data: user,
        });
      } catch (error) {
        console.error("Get user error:", error);
        res.status(500).send({
          success: false,
          message: "Failed to fetch user",
        });
      }
    });

    // Update user profile
    app.patch("/auth/users/:email", async (req, res) => {
      try {
        const email = req.params.email;
        const updateData = req.body;

        const result = await usersCollection.updateOne(
          { email: email },
          {
            $set: {
              ...updateData,
              updatedAt: new Date()
            }
          }
        );

        if (result.modifiedCount === 0) {
          return res.status(404).send({
            success: false,
            message: "User not found or no changes made",
          });
        }

        res.send({
          success: true,
          message: "User updated successfully",
        });
      } catch (error) {
        console.error("Update user error:", error);
        res.status(500).send({
          success: false,
          message: "Failed to update user",
        });
      }
    });

    // ========== BLOOD REQUEST APIs ========== //

    // Create blood request
    app.post("/bloods", async (req, res) => {
      try {
        const issue = req.body;
        const result = await bloodCollection.insertOne({
          ...issue,
          createdAt: new Date(),
          status: "pending",
          updatedAt: new Date(),
        });

        res.send({
          success: true,
          data: result,
        });
      } catch (error) {
        console.error("Blood request error:", error);
        res.status(500).send({
          success: false,
          message: "Failed to create blood request",
        });
      }
    });

    // Get all blood requests
    app.get("/bloods", async (req, res) => {
      try {
        const { status, bloodGroup, limit } = req.query;
        let query = {};

        if (status) query.status = status;
        if (bloodGroup) query.bloodGroup = bloodGroup;

        const result = await bloodCollection
          .find(query)
          .sort({ createdAt: -1 })
          .limit(parseInt(limit) || 50)
          .toArray();

        res.send({
          success: true,
          data: result,
        });
      } catch (error) {
        console.error("Get blood requests error:", error);
        res.status(500).send({
          success: false,
          message: "Failed to fetch blood requests",
        });
      }
    });

    // Get single blood request by id
    app.get("/bloods/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await bloodCollection.findOne(query);

        if (!result) {
          return res.status(404).send({
            success: false,
            message: "Blood request not found",
          });
        }

        res.send({
          success: true,
          data: result,
        });
      } catch (error) {
        console.error("Get blood request error:", error);
        res.status(500).send({
          success: false,
          message: "Failed to fetch blood request",
        });
      }
    });

    // Update blood request status
    app.patch("/bloods/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const { status } = req.body;

        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: {
            status: status,
            updatedAt: new Date(),
          },
        };

        const result = await bloodCollection.updateOne(filter, updateDoc);
        res.send({
          success: true,
          data: result,
        });
      } catch (error) {
        console.error("Update blood request error:", error);
        res.status(500).send({
          success: false,
          message: "Failed to update blood request",
        });
      }
    });

    // Delete blood request
    app.delete("/bloods/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };

        const result = await bloodCollection.deleteOne(filter);
        if (result.deletedCount === 0) {
          return res.status(404).send({
            success: false,
            message: "Blood request not found",
          });
        }

        res.send({
          success: true,
          message: "Blood request deleted successfully",
        });
      } catch (error) {
        console.error("Delete blood request error:", error);
        res.status(500).send({
          success: false,
          message: "Failed to delete blood request",
        });
      }
    });

    console.log("Pinged your deployment. You successfully connected to MongoDB!");
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