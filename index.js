const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
const bodyParser = require("body-parser");
const Detail = require("./models/detail");
const engine = require("ejs-mate");
const wrapAsync = require("./utils/wrapasync");
const ExpressError = require("./utils/expressError");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const flash = require("connect-flash");
const http = require("http");
const { Server } = require("socket.io");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 8080;

// Connect to MongoDB using Mongoose
const dbUrl = process.env.ATLASDB_URL;

async function main() {
  try {
    await mongoose.connect(dbUrl);
    console.log("Connected to DB");
  } catch (error) {
    console.error("Error connecting to DB:", error);
    process.exit(1); // Exit process on error
  }
}

main().catch((error) => console.log(error));

// Create MongoStore for session storage
const store = MongoStore.create({
  mongoUrl: dbUrl,
  crypto: {
    secret: process.env.SECRET,
  },
  touchAfter: 24 * 3600, // 24 hours
});

store.on("error", (error) => {
  console.log("Error in Mongo session store:", error);
});

// Session middleware configuration
const sessionOptions = {
  store,
  secret: process.env.SECRET,
  resave: false,
  saveUninitialized: true,
  cookie: {
    expires: Date.now() + 7 * 24 * 60 * 60 * 1000, // 1 week
    maxAge: 7 * 24 * 60 * 60 * 1000, // 1 week
    httpOnly: true,
  },
};

// Middleware setup
app.set("views", path.join(__dirname, "views"));
app.engine("ejs", engine);
app.set("view engine", "ejs");
app.use(express.static(path.join(__dirname, "public")));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session(sessionOptions));
app.use(flash());

app.use((req, res, next) => {
  res.locals.success = req.flash("success");
  next();
});

// Routes
app.get("/details", async (req, res, next) => {
  try {
    const allDetails = await Detail.find({});
    res.render("details/home.ejs", { allDetails });
  } catch (error) {
    next(error);
  }
});

app.get("/details/new", (req, res) => {
  res.render("details/new.ejs");
});

app.post(
  "/details",
  wrapAsync(async (req, res, next) => {
    const newDetail = new Detail(req.body.detail);
    await newDetail.save();
    req.flash("success", "New user data has been successfully added");
    res.redirect("/details");
  })
);

app.get("/email", (req, res) => {
  res.render("details/email");
});

app.post("/check-email", async (req, res) => {
  try {
    const { emailId } = req.body;
    const user = await Detail.findOne({ emailId });

    if (user) {
      req.session.userId = user._id;
      req.session.emailId = user.emailId;
      req.session.name = `${user.firstName} ${user.lastName}`;
      req.flash("success", `${user.firstName} has joined.`);

      io.emit("userJoined", { name: `${user.firstName} ${user.lastName}` });

      res.redirect("/userprofile");
    } else {
      res.status(404).send("Email not found");
    }
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.get("/userprofile", async (req, res, next) => {
  try {
    if (!req.session.userId) {
      return res.status(403).send("Unauthorized access");
    }

    const user = await Detail.findById(
      req.session.userId,
      "firstName lastName emailId mobileNo address street city state country loginId"
    );
    if (!user) {
      return res.status(404).send("User not found");
    }

    const userData = {
      name: `${user.firstName} ${user.lastName}`,
      email: user.emailId,
      mobileNo: user.mobileNo || "",
      address: `${user.address.street}, ${user.address.city}, ${user.address.state}, ${user.address.country}`,
      loginId: user.loginId,
      userId: user._id,
    };

    res.render("details/user", userData);
  } catch (err) {
    next(err);
  }
});

app.use((error, req, res, next) => {
  console.error(error);
  const { statuscode = 500, message = "Something went wrong!" } = error;
  res.status(statuscode).render("details/error.ejs", { message });
});

app.all("*", (req, res, next) => {
  next(new ExpressError(404, "Page Not Found"));
});

app.use((error, req, res, next) => {
  const { statuscode = 500, message = "Something went wrong!" } = error;
  res.status(statuscode).render("details/error.ejs", { message });
});

// Start the server
const server = app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

// Socket.IO setup
const io = new Server(server);

const connectedUsers = new Map();

io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);

  socket.on("registerUser", async (userId) => {
    try {
      const user = await Detail.findById(
        userId,
        "firstName lastName mobileNo emailId street city state country loginId"
      );
      if (user) {
        user.socketId = socket.id;
        await user.save();

        connectedUsers.set(socket.id, {
          name: `${user.firstName} ${user.lastName}`,
          email: user.emailId,
          socketId: socket.id,
          userId: user._id,
        });

        socket.emit("userDetails", {
          name: `${user.firstName} ${user.lastName}`,
          email: user.emailId,
          socketId: socket.id,
        });

        io.emit("updateUserList", Array.from(connectedUsers.values()));
      }
    } catch (error) {
      console.error("Error registering user:", error);
      socket.emit("error", "There was an error registering your session.");
    }
  });

  socket.on("getUserDetails", async (userId) => {
    try {
      const user = await Detail.findById(
        userId,
        "firstName lastName mobileNo address street city state country loginId emailId"
      );
      if (user) {
        console.log("User details retrieved:", user);
        socket.emit("userDetailResponse", {
          name: `${user.firstName} ${user.lastName}`,
          mobileNo: user.mobileNo,
          email: user.emailId,
          address: `${user.address.street}, ${user.address.city}, ${user.address.state}, ${user.address.country}`,
          loginId: user.loginId,
          socketId: socket.id,
        });
      } else {
        console.log("User not found with ID:", userId);
      }
    } catch (error) {
      console.error("Error retrieving user details:", error);
      socket.emit("error", "Error retrieving user details.");
    }
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
    connectedUsers.delete(socket.id);
    io.emit("updateUserList", Array.from(connectedUsers.values()));
  });
});
