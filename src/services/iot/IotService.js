const IotDevice = require('../../models/IotDevice');

class IotService {
  async getAllDevices(search = '') {
    try {
      let query = {};
      if (search && search.trim() !== '') {
        const regex = new RegExp(search.trim(), 'i');
        query.$or = [
          { device_code: { $regex: regex } },
          { name: { $regex: regex } },
          { location: { $regex: regex } }
        ];
      }
      const devices = await IotDevice.find(query);
      for (const device of devices) {
        await device.save();
      }
      return devices;
    } catch (error) {
      throw new Error('Error fetching IoT devices: ' + error.message);
    }
  }

  async getDeviceById(id) {
    try {
      let query = { device_code: id };
      if (id.match(/^[0-9a-fA-F]{24}$/)) {
        query = { $or: [{ _id: id }, { device_code: id }] };
      }
      const device = await IotDevice.findOne(query);
      if (!device) {
        throw new Error('Device not found');
      }
      return device;
    } catch (error) {
      throw new Error('Error fetching device details: ' + error.message);
    }
  }

  async addDevice(deviceData) {
    try {
      const newDevice = new IotDevice(deviceData);
      await newDevice.save();
      return newDevice;
    } catch (error) {
      throw new Error('Error adding IoT device: ' + error.message);
    }
  }
  async updateTelemetry(deviceId, waterLevel, batteryPercent, now) {
    try {
      const device = await IotDevice.findOne({ device_code: deviceId });
      if (!device) return null;
      if (device.is_disabled) return device;

      const WaterLevelLog = require('../../models/WaterLevelLog');
      const recentLogs = await WaterLevelLog.find({ device_id: device._id })
        .sort({ timestamp: -1 })
        .limit(14)
        .lean();

      let speedCmPerMin = 0;
      if (recentLogs.length > 0) {
        const oldestInWindow = recentLogs[recentLogs.length - 1];
        const diffMin = Math.max(0.1, (now.getTime() - new Date(oldestInWindow.timestamp).getTime()) / 60000);
        const diffCm = waterLevel - ((oldestInWindow.water_level_mm || 0) / 10);
        speedCmPerMin = parseFloat((diffCm / diffMin).toFixed(2));
      } else if (device.last_reading_time) {
        const diffMin = Math.max(0.1, (now.getTime() - new Date(device.last_reading_time).getTime()) / 60000);
        const diffCm = waterLevel - (device.current_water_level || 0);
        speedCmPerMin = parseFloat((diffCm / diffMin).toFixed(2));
      }
      const risingSpeedMmPerMin = Math.max(0, speedCmPerMin * 10);

      device.current_water_level = waterLevel;
      device.current_rising_speed = speedCmPerMin;
      device.current_battery_level = batteryPercent;
      device.last_reading_time = now;
      device.last_ping = now;
      device.status = waterLevel > 5 ? 'Online' : 'Offline';
      
      await device.save();

      try {
        const WaterLevelLog = require('../../models/WaterLevelLog');
        await WaterLevelLog.create({
          device_id: device._id,
          timestamp: now,
          water_level_mm: waterLevel * 10,
          rising_speed_mm_per_min: risingSpeedMmPerMin
        });
      } catch (logErr) {
        console.error('Failed to create WaterLevelLog:', logErr);
      }

      // Notify all roles (except guest) of High Water Rising Speed
      try {
        const SystemConfig = require('../../models/SystemConfig');
        const sysConfig = await SystemConfig.findOne({ key: 'default' });
        const speedThreshold = sysConfig?.water_rising_speed_threshold ?? 5;

        if (speedCmPerMin >= speedThreshold && speedCmPerMin > 0) {
          const Notification = require('../../models/Notification');
          const wsHelper = require('../../utils/wsHelper');
          const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000);
          
          const existingSpeedAlert = await Notification.findOne({
            reference_id: device._id,
            type: 'System_Alert',
            title: { $regex: 'Tốc độ nước dâng cao' },
            created_at: { $gte: thirtyMinsAgo }
          }).exec();

          if (!existingSpeedAlert) {
            const rolesToNotify = ['Admin', 'Manager', 'User', 'Volunteer', 'Workshop'];
            const title = `🚨 Cảnh báo: Tốc độ nước dâng cao tại trạm ${device.name}`;
            const body = `Tốc độ nước dâng hiện tại đạt ${speedCmPerMin} cm/min (Ngưỡng cảnh báo: ${speedThreshold} cm/min). Trạm vừa đo mức nước ${waterLevel} cm.`;

            for (const role of rolesToNotify) {
              const notif = await Notification.create({
                recipient_role: role,
                title,
                body,
                type: 'System_Alert',
                reference_id: device._id,
                metadata: {
                  sender_name: device.name,
                  web_url: '/dashboard',
                  speed_cm_per_min: speedCmPerMin
                }
              });
              wsHelper.broadcast({ type: 'notification', notification: notif });
            }
          }
        }
      } catch (speedErr) {
        console.error('Failed to trigger water rising speed alerts:', speedErr);
      }

      // Notify Admin/Manager of low/depleted battery
      try {
        if (batteryPercent <= 20) {
          const Notification = require('../../models/Notification');
          const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
          const existingBatteryAlert = await Notification.findOne({
            reference_id: device._id,
            type: 'System_Alert',
            title: { $regex: 'Battery' },
            created_at: { $gte: oneDayAgo }
          }).exec();

          if (!existingBatteryAlert) {
            const isDead = batteryPercent <= 1;
            const title = isDead ? `IoT Battery Depleted: ${device.name}` : `IoT Low Battery Warning: ${device.name}`;
            const body = isDead ? `Station "${device.name}" battery is completely depleted (0%).` : `Station "${device.name}" battery is running low at ${batteryPercent}%.`;

            await Notification.create({
              recipient_role: 'Admin',
              title,
              body,
              type: 'System_Alert',
              reference_id: device._id,
              metadata: {
                sender_name: device.name,
                web_url: '/dashboard'
              }
            });

            await Notification.create({
              recipient_role: 'Manager',
              title,
              body,
              type: 'System_Alert',
              reference_id: device._id,
              metadata: {
                sender_name: device.name,
                web_url: '/dashboard'
              }
            });
          }
        }
      } catch (err) {
        console.error('Failed to trigger battery alerts:', err);
      }

      // Notify Admin/Manager of IoT Flood Detection
      try {
        if (device.warning_water_status !== 'safe') {
          const Notification = require('../../models/Notification');
          const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000);
          const existingFloodAlert = await Notification.findOne({
            reference_id: device._id,
            type: 'System_Alert',
            title: { $regex: 'IoT Flood Alert' },
            created_at: { $gte: fourHoursAgo }
          }).exec();

          if (!existingFloodAlert) {
            const title = `IoT Flood Alert: ${device.name}`;
            const body = `Station "${device.name}" registered high water level of ${device.current_water_level}cm: status ${device.warning_water_status}.`;

            await Notification.create({
              recipient_role: 'Admin',
              title,
              body,
              type: 'System_Alert',
              reference_id: device._id,
              metadata: {
                sender_name: device.name,
                web_url: '/dashboard'
              }
            });

            await Notification.create({
              recipient_role: 'Manager',
              title,
              body,
              type: 'System_Alert',
              reference_id: device._id,
              metadata: {
                sender_name: device.name,
                web_url: '/dashboard'
              }
            });
          }
        }
      } catch (err) {
        console.error('Failed to trigger IoT flood alerts:', err);
      }
      
      if (device.warning_water_status !== 'safe') {
        try {
          const warningRoadService = require('../warningRoad/warningRoadService');
          await warningRoadService.checkAndNotifyWarningRoads(
            device.lat,
            device.lng,
            'Thiết bị IoT',
            `Ngập lụt tại trạm ${device.name}: ${device.current_water_level}cm (${device.warning_water_status})`
          );
        } catch (roadErr) {
          console.error('Failed to trigger warning road alerts from IoT:', roadErr);
        }

        const { checkAndTriggerWarningZoneAlerts } = require('../../utils/warningZoneHelper');
        checkAndTriggerWarningZoneAlerts(device.lat, device.lng, {
          title: `Cảnh báo ngập lụt tại trạm ${device.name}`,
          body: `Trạm đo ${device.name} ghi nhận mức nước đạt ${device.current_water_level}cm (${device.warning_water_status})`,
          type: 'Flood_In_Warning_Zone',
          reference_id: device._id,
          reference_type: 'incident_reports',
          metadata: {
            sender_name: device.name,
            web_url: `/dashboard`,
            flood_depth_mm: device.current_water_level * 10
          }
        }).catch(err => console.error('Error triggering warning zone alerts from telemetry:', err));
      }

      return device;
    } catch (error) {
      throw new Error('Error updating telemetry: ' + error.message);
    }
  }

  async toggleDeviceDisabled(id, isDisabled) {
    try {
      let query = { device_code: id };
      if (id.match(/^[0-9a-fA-F]{24}$/)) {
        query = { $or: [{ _id: id }, { device_code: id }] };
      }
      const device = await IotDevice.findOneAndUpdate(
        query,
        { $set: { is_disabled: isDisabled } },
        { new: true }
      );
      if (!device) throw new Error('Device not found');
      return device;
    } catch (error) {
      throw new Error('Error toggling device disabled state: ' + error.message);
    }
  }

  async updateDevice(id, updateData) {
    try {
      let query = { device_code: id };
      if (id.match(/^[0-9a-fA-F]{24}$/)) {
        query = { $or: [{ _id: id }, { device_code: id }] };
      }
      const device = await IotDevice.findOne(query);
      if (!device) throw new Error('Device not found');

      Object.assign(device, updateData);
      await device.save();
      return device;
    } catch (error) {
      throw new Error('Error updating IoT device: ' + error.message);
    }
  }

  async getDeviceHistory(id) {
    try {
      const device = await this.getDeviceById(id);
      const WaterLevelLog = require('../../models/WaterLevelLog');
      
      let logs = await WaterLevelLog.find({ device_id: device._id }).sort({ timestamp: 1 }).lean();
      
      // Note: Automatic seeding of dummy data removed per user request so that only real DB records are shown.

      // Parse real DB logs into flood cycles (contiguous periods where water_level_mm >= 50mm i.e. 5cm)
      const cycles = [];
      let currentCycle = null;

      const formatDate = (dt) => {
        const d = new Date(dt);
        const day = d.getDate().toString().padStart(2, '0');
        const m = (d.getMonth() + 1).toString().padStart(2, '0');
        const y = d.getFullYear();
        const hh = d.getHours().toString().padStart(2, '0');
        const mm = d.getMinutes().toString().padStart(2, '0');
        return `${hh}:${mm} ${day}/${m}/${y}`;
      };

      for (let i = 0; i < logs.length; i++) {
        const log = logs[i];
        const waterCm = Math.round((log.water_level_mm || 0) / 10);
        const rainfallMm = Math.round((log.rising_speed_mm_per_min || 0) * 4);

        if (waterCm >= 5) {
          if (!currentCycle) {
            currentCycle = {
              id: `cycle-${cycles.length + 1}`,
              cycle_name: `Flood Cycle #${cycles.length + 1}`,
              start_time: formatDate(log.timestamp),
              end_time: formatDate(log.timestamp),
              peak_level_cm: waterCm,
              startTimeMs: new Date(log.timestamp).getTime(),
              endTimeMs: new Date(log.timestamp).getTime(),
              data_points: []
            };
          }
          const dtStr = formatDate(log.timestamp).split(' ')[0];
          currentCycle.data_points.push({
            time: dtStr,
            waterLevel: waterCm,
            rainfall: rainfallMm
          });
          currentCycle.end_time = formatDate(log.timestamp);
          currentCycle.endTimeMs = new Date(log.timestamp).getTime();
          if (waterCm > currentCycle.peak_level_cm) {
            currentCycle.peak_level_cm = waterCm;
          }
        } else {
          if (currentCycle) {
            const diffHours = Math.max(1, Math.round((currentCycle.endTimeMs - currentCycle.startTimeMs) / (1000 * 60 * 60)));
            currentCycle.duration = `${diffHours}h`;
            delete currentCycle.startTimeMs;
            delete currentCycle.endTimeMs;
            cycles.push(currentCycle);
            currentCycle = null;
          }
        }
      }
      if (currentCycle) {
        const diffHours = Math.max(1, Math.round((currentCycle.endTimeMs - currentCycle.startTimeMs) / (1000 * 60 * 60)));
        currentCycle.duration = `${diffHours}h`;
        delete currentCycle.startTimeMs;
        delete currentCycle.endTimeMs;
        cycles.push(currentCycle);
      }

      // Name cycles in English in reverse chronological order (newest first)
      cycles.reverse();
      cycles.forEach((c, idx) => {
        c.cycle_name = `Flood Cycle #${cycles.length - idx} (${c.start_time.split(' ')[1]})`;
      });

      return {
        device_id: device.device_code || device._id,
        device_name: device.name,
        total_cycles: cycles.length,
        cycles: cycles
      };
    } catch (error) {
      throw new Error('Error fetching device history: ' + error.message);
    }
  }

  async getDeviceSpeedAnalysis(id) {
    try {
      const device = await this.getDeviceById(id);
      const WaterLevelLog = require('../../models/WaterLevelLog');
      const SystemConfig = require('../../models/SystemConfig');
      const config = await SystemConfig.findOne({ key: 'default' });

      const logs = await WaterLevelLog.find({ device_id: device._id }).sort({ timestamp: 1 }).lean();

      const formatDate = (dt) => {
        const d = new Date(dt);
        const day = d.getDate().toString().padStart(2, '0');
        const m = (d.getMonth() + 1).toString().padStart(2, '0');
        const y = d.getFullYear();
        const hh = d.getHours().toString().padStart(2, '0');
        const mm = d.getMinutes().toString().padStart(2, '0');
        const ss = d.getSeconds().toString().padStart(2, '0');
        return `${hh}:${mm}:${ss} ${day}/${m}/${y}`;
      };

      const speedLogs = [];
      for (let i = 0; i < logs.length; i++) {
        const log = logs[i];
        const waterCm = parseFloat(((log.water_level_mm || 0) / 10).toFixed(2));
        let speed = parseFloat(((log.rising_speed_mm_per_min || 0) / 10).toFixed(2));

        if (i > 0) {
          const windowStartIdx = Math.max(0, i - 14);
          const startLog = logs[windowStartIdx];
          const diffMin = (new Date(log.timestamp).getTime() - new Date(startLog.timestamp).getTime()) / 60000;
          if (diffMin >= 0.1) {
            const diffCm = waterCm - ((startLog.water_level_mm || 0) / 10);
            speed = parseFloat((diffCm / diffMin).toFixed(2));
          }
        }
        speedLogs.push({
          time: formatDate(log.timestamp),
          waterLevel: waterCm,
          speed: speed
        });
      }

      let currentSpeed = device.current_rising_speed || 0;
      if (speedLogs.length > 0 && currentSpeed === 0) {
        currentSpeed = speedLogs[speedLogs.length - 1].speed;
      }

      const sleepMin = device.sleep_interval_minutes || 1;
      const currentLevel = device.current_water_level || 0;
      const predictedLevel = parseFloat((currentLevel + (currentSpeed * sleepMin)).toFixed(2));

      const calib = device.calib_empty_cm || 100;
      const predictedPct = (predictedLevel / calib) * 100;

      const l1 = config?.water_level_l1 ?? 20;
      const l2 = config?.water_level_l2 ?? 40;
      const l3 = config?.water_level_l3 ?? 50;
      const l4 = config?.water_level_l4 ?? 60;

      let predictedStatus = 'safe';
      if (predictedPct >= l4) predictedStatus = 'critical';
      else if (predictedPct >= l3) predictedStatus = 'severe';
      else if (predictedPct >= l2) predictedStatus = 'moderate';
      else if (predictedPct >= l1) predictedStatus = 'slight';

      let cycleLogs = speedLogs;
      if (speedLogs.length > 0) {
        let lastSafeIdx = -1;
        for (let i = speedLogs.length - 1; i >= 0; i--) {
          if (speedLogs[i].waterLevel < 5) {
            lastSafeIdx = i;
            break;
          }
        }
        if (lastSafeIdx !== -1 && lastSafeIdx < speedLogs.length - 1) {
          cycleLogs = speedLogs.slice(lastSafeIdx + 1);
        }
        if (cycleLogs.length > 15) {
          cycleLogs = cycleLogs.slice(-15);
        }
      }

      return {
        device_id: device.device_code || device._id,
        device_name: device.name,
        current_water_level: currentLevel,
        sleep_interval_minutes: sleepMin,
        speed_threshold: config?.water_rising_speed_threshold ?? 5,
        current_speed: currentSpeed,
        is_warning: currentSpeed >= (config?.water_rising_speed_threshold ?? 5),
        prediction: {
          next_expected_level: predictedLevel,
          next_warning_status: predictedStatus,
          time_after_minutes: sleepMin
        },
        speed_history: cycleLogs
      };
    } catch (error) {
      throw new Error('Error fetching speed analysis: ' + error.message);
    }
  }
}

module.exports = new IotService();
