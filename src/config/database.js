const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const User = require("../models/User");
const Workshop = require("../models/Workshop");
const WorkshopStaff = require("../models/WorkshopStaff");
const IotDevice = require("../models/IotDevice");

const seedLocalDB = async () => {
  try {
    const userCount = await User.countDocuments();
    const workshopCount = await Workshop.countDocuments();
    const deviceCount = await IotDevice.countDocuments();

    if (userCount === 0 && workshopCount === 0 && deviceCount === 0) {
      console.log("Local database is empty. Seeding default data...");

      // 1. Seed Users
      const passwordHash = await bcrypt.hash("123456", 10);
      
      const adminUser = await User.create({
        email: "admin@gmail.com",
        password_hash: passwordHash,
        full_name: "System Admin",
        phone: "0912345678",
        status: "Active",
        is_verified: true,
        role: "Admin",
      });

      const volunteerUser = await User.create({
        email: "volunteer@gmail.com",
        password_hash: passwordHash,
        full_name: "Nguyen Van Canh",
        phone: "0987654321",
        status: "Active",
        is_verified: true,
        role: "Volunteer",
      });

      const shopOwnerUser = await User.create({
        email: "workshop@gmail.com",
        password_hash: passwordHash,
        full_name: "Tran Van Xe",
        phone: "0901234567",
        status: "Active",
        is_verified: true,
        role: "Workshop",
      });

      const normalUser = await User.create({
        email: "user@gmail.com",
        password_hash: passwordHash,
        full_name: "Le Van An",
        phone: "0934567890",
        status: "Active",
        is_verified: true,
        role: "User",
      });

      console.log("Seeded default users (password: 123456)");

      // 2. Seed Workshops
      const workshop1 = await Workshop.create({
        name: "Sửa Xe Ninh Kiều Cần Thơ",
        phone: "0901234567",
        address: "30 Đường 30 Tháng 4, Hưng Lợi, Ninh Kiều, Cần Thơ",
        lat: 10.028089,
        lng: 105.770905,
        services: [],
        is_open: true,
        is_mobile: true,
        coverage_radius: 5,
        rating_average: 4.8,
        rating_count: 5,
        status: "Active"
      });
 
      const workshop2 = await Workshop.create({
        name: "Cứu Hộ Sửa Xe Cái Răng",
        phone: "0987654321",
        address: "Lê Bình, Cái Răng, Cần Thơ",
        lat: 10.005189,
        lng: 105.748305,
        services: [],
        is_open: true,
        is_mobile: true,
        coverage_radius: 8,
        rating_average: 4.5,
        rating_count: 3,
        status: "Active"
      });

      console.log("Seeded workshops");

      // 3. Seed WorkshopStaff
      await WorkshopStaff.create({
        workshop_id: workshop1._id,
        user_id: shopOwnerUser._id,
        workshop_name: workshop1.name,
        is_owner: true,
        status: "Available",
        current_lat: 10.028089,
        current_lng: 105.770905
      });

      console.log("Seeded workshop staff linking owner");

      // 4. Seed IoT Devices (placed in Can Tho area)
      await IotDevice.create([
        {
          device_code: "CT-NK-01",
          name: "Trạm Quan Trắc Ninh Kiều",
          lat: 10.034189,
          lng: 105.781305,
          status: "Online",
          location: "Bến Ninh Kiều, Cần Thơ",
          calib_empty_cm: 150,
          current_water_level: 45,
          current_battery_level: 85,
          sleep_interval_minutes: 5,
          last_reading_time: new Date(),
          battery_level: 85,
          last_ping: new Date()
        },
        {
          device_code: "CT-CR-02",
          name: "Trạm Quan Trắc Cái Răng",
          lat: 10.009189,
          lng: 105.753305,
          status: "Online",
          location: "Chợ nổi Cái Răng, Cần Thơ",
          calib_empty_cm: 150,
          current_water_level: 55,
          current_battery_level: 90,
          sleep_interval_minutes: 5,
          last_reading_time: new Date(),
          battery_level: 90,
          last_ping: new Date()
        },
        {
          device_code: "CT-BT-03",
          name: "Trạm Quan Trắc Bình Thủy",
          lat: 10.071189,
          lng: 105.723305,
          status: "Offline",
          location: "Rạch Bình Thủy, Cần Thơ",
          calib_empty_cm: 150,
          current_water_level: 10,
          current_battery_level: 5,
          sleep_interval_minutes: 5,
          last_reading_time: new Date(Date.now() - 3600000),
          battery_level: 5,
          last_ping: new Date(Date.now() - 3600000)
        }
      ]);

      console.log("Seeded IoT devices");

      // 5. Seed default System Config if it doesn't exist
      const SystemConfig = require("../models/SystemConfig");
      const configCount = await SystemConfig.countDocuments();
      if (configCount === 0) {
        await SystemConfig.create({
          key: 'default',
          water_level_l1: 20,
          water_level_l2: 40,
          water_level_l3: 50,
          water_level_l4: 60
        });
        console.log("Seeded default system configuration");
      }

      console.log("Local database seeding completed successfully!");
    } else {
      console.log("Local database already contains data. Skipping seeding.");
    }
  } catch (seedErr) {
    console.error("Error seeding local database:", seedErr);
  }
};

const connectDB = async () => {
  try {
    console.log("Attempting to connect to MongoDB Atlas...");
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000 // 5 seconds timeout
    });
    console.log("MongoDB Atlas Connected");

    await User.syncIndexes();
    console.log("User indexes synced");
  } catch (error) {
    console.error("MongoDB Atlas Connection Failed:", error.message);
    console.log("Falling back to local MongoDB at mongodb://127.0.0.1:27017/SFTR_DB...");
    try {
      await mongoose.connect("mongodb://127.0.0.1:27017/SFTR_DB", {
        serverSelectionTimeoutMS: 5000
      });
      console.log("Local MongoDB Connected");

      await User.syncIndexes();
      console.log("User indexes synced on local DB");

      await seedLocalDB();
    } catch (localError) {
      console.error("Local MongoDB connection also failed:", localError.message);
      process.exit(1);
    }
  }
};

module.exports = connectDB;
